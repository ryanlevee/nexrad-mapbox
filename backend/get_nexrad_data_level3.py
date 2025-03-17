import asyncio
import datetime
import json
import os
import re
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import timedelta, timezone
from time import time

import boto3
from boto3.s3.transfer import TransferConfig
from botocore import UNSIGNED
from botocore.client import Config
from pytz import UTC
from read_and_plot_nexrad_level3 import read_and_plot_nexrad_level3_data
from utils import Utl

RELATIVE_PATH = "./frontend/public/"
ABSOLUTE_CODES_PATH = f"{os.path.abspath(RELATIVE_PATH)}/codes/options.json"
ABSOLUTE_IMAGE_PATH = f"{os.path.abspath(RELATIVE_PATH)}/plots_level3/"
ABSOLUTE_LIST_PATH = f"{os.path.abspath(RELATIVE_PATH)}/lists/"

CHUNK_SIZE = 1024 * 1024 * 2


def generate_file_list_json(plotted_files, products, radar_site):
    filtered_file_list = {}

    for product in products:
        product_file_list = {}
        product_type = product["type"]
        print(f"Generating file list for nexrad_level3_{product_type}_files.json")
        LIST_FILENAME = f"nexrad_level3_{product_type}_files.json"
        with open(os.path.join(ABSOLUTE_LIST_PATH, LIST_FILENAME), "r") as f:
            product_file_list = json.load(f)
            f.close()

        plotted_product_files = plotted_files[product_type]
        plotted_product_files.sort()
        latest_file_datetime = plotted_product_files[-1][4:19].replace("_", " ")
        format_string = "%Y%m%d %H%M%S"
        datetime_object = datetime.datetime.strptime(
            latest_file_datetime, format_string
        )
        three_hours_ago = datetime_object - timedelta(minutes=180)

        min_file_datetime = (
            str(three_hours_ago).replace("-", "").replace(":", "").replace(" ", "_")
        )

        min_prefix = f"K{radar_site}{min_file_datetime}"  # add "K" for level3

        filtered_product_list = {
            k: v for k, v in product_file_list.items() if k >= min_prefix
        }

        for file in plotted_product_files:
            if file >= min_prefix:
                filtered_product_list.update({file: {"sweeps": 1}})

        print(f"Removing old {product_type} pngs and jsons in {ABSOLUTE_IMAGE_PATH}")

        with open(os.path.join(ABSOLUTE_LIST_PATH, LIST_FILENAME), "w+") as g:
            json.dump(filtered_product_list, g)
            g.close()

        [filtered_file_list.update({k: v}) for k, v in filtered_product_list.items()]

    print('filtered_file_list:', filtered_file_list)

    for file in os.listdir(ABSOLUTE_IMAGE_PATH):
        if file[:23] not in filtered_file_list:
            os.unlink(os.path.join(ABSOLUTE_IMAGE_PATH, file))

    print(f"nextrad_leevl3_{product_type}_files.json updated")

    code_options = {}
    with open(
        ABSOLUTE_CODES_PATH,
        "r",
    ) as h:
        code_options = json.load(h)
        h.close()

    for product in products:
        product_type = product["type"]
        print(f"Generating {product_type} code options for options.json")

        product_codes = code_options[product_type]
        jcodes = [jk[-3:] for jk in filtered_file_list]

        for i, codes in enumerate(product_codes):
            code = codes["value"]
            product_codes[i]["count"] = jcodes.count(code)

        code_options[product_type] = product_codes
        print(f"updating options.json for {product_type}")

    with open(
        ABSOLUTE_CODES_PATH,
        "w+",
    ) as j:
        json.dump(code_options, j)
        j.close()


TRANSFER_CONFIG = TransferConfig(max_concurrency=50)
CONFIG = Config(signature_version=UNSIGNED, s3={"transfer_config": TRANSFER_CONFIG})
SESSION = boto3.session.Session()
S3_CLIENT = SESSION.client("s3", config=CONFIG, region_name="us-east-1")
DOWNLOAD_FOLDER = "nexrad_level3_data"


def download_nexrad_level3_data(
    # config,
    # files,
    filename,
    existing_files,
    # product,
    bucket_name="unidata-nexrad-level3",
    # parent_download_dir="nexrad_level3_data",
):
    # download_dir = os.path.join(parent_download_dir, product_type)

    # session = aiobotocore.session.get_session()
    # async with session.create_client("s3") as s3_client:
    # if not os.path.exists(download_dir):
    #     os.makedirs(download_dir)

    # existing_files = os.listdir(download_dir)

    # downloaded_files = []
    # for filename in files:
    fns = filename.split("_")

    normalized_filename = (
        f"K{''.join([fns[0], *fns[2:5]])}_{''.join(fns[5:8])}_{fns[1]}"
    )

    fn = filename.replace("_", "")
    normalized_filename = f"K{fn[:-6]}_{fn[-6:]}"

    if normalized_filename in existing_files:
        print(f"File {filename} already exists, skipping.")
        return False

    download_path = os.path.join(DOWNLOAD_FOLDER, filename)
    print(f"Downloading {filename} to {download_path}")

    try:
        # response = await s3_client.get_object(Bucket=bucket_name, Key=filename)
        response = S3_CLIENT.get_object(Bucket=bucket_name, Key=filename)
        parts = []
        body = response["Body"]
        # while data := await body.read(CHUNK_SIZE):
        while data := body.read(CHUNK_SIZE):
            parts.append(data)

        content = b"".join(parts)

        with open(download_path, "wb") as f:
            f.write(content)

        print(f"Downloaded {filename} successfully.")

        # downloaded_files.append(filename)
        return filename
    except Exception as e:
        print(f"ERROR downloading {filename}: {e}")
        return False

    # return downloaded_files


def fetch_nexrad_level3_data(
    # config,
    product_code,
    radar_site,
    bucket_name,
    start_time,
    end_time,
    # product,
    max_keys=1000,
):

    # session = boto3.session.Session()
    # s3_client = session.client("s3", config=config, region_name="us-east-1")

    # session = aiobotocore.session.get_session()
    # async with session.create_client("s3") as s3:
    all_files_list = []

    # for product_code in product_codes:
    current_time = start_time

    # file_list_for_product = []
    while current_time <= end_time:
        prefix = f"{radar_site}_{product_code}_{current_time.strftime('%Y_%m_%d_%H')}"

        continuation_token = None

        while True:
            list_kwargs = {
                "Bucket": bucket_name,
                "Prefix": prefix,
                "MaxKeys": max_keys,
            }
            if continuation_token:
                list_kwargs["ContinuationToken"] = continuation_token

            response = S3_CLIENT.list_objects_v2(**list_kwargs)

            for obj in response.get("Contents", []):
                if matched_file := _match_file(product_code, obj):
                    all_files_list.append(matched_file)

            continuation_token = response.get("NextContinuationToken")
            if not continuation_token:
                break

        current_time += timedelta(hours=1)
        # all_files_list.extend(all_files_list)

        print(f"Files found for product code {product_code}: {all_files_list}")

    return all_files_list
    # return {product: all_files_list}


def _match_file(product_code_prefix, obj):
    filename = obj["Key"]
    print(f"Processing filename: {filename}")

    match = re.match(
        r"^(?P<site>[A-Z]{3})_(?P<product>[A-Z0-9]{3})_(?P<year>\d{4})_(?P<month>\d{2})_(?P<day>\d{2})_(?P<hour>\d{2})_(?P<minute>\d{2})_(?P<second>\d{2})$",
        filename,
    )

    if not match:
        print(f"SKIPPING: Filename pattern mismatch: {filename}")
        return False

    match_details = match.groupdict()
    radar_site_file = match_details["site"]
    product_code_file = match_details["product"]

    file_datetime_str = f"{match_details['year']}-{match_details['month']}-{match_details['day']} {match_details['hour']}:{match_details['minute']}:{match_details['second']}"
    try:
        file_datetime = datetime.datetime.strptime(
            file_datetime_str, "%Y-%m-%d %H:%M:%S"
        ).replace(tzinfo=UTC)
    except ValueError as e:
        print(f"ERROR parsing timestamp: {filename} - {e}")

    print(
        f"MATCHED: {filename}, Product Prefix: {product_code_prefix}, Filename Product: {product_code_file}, Site: {radar_site_file}, Datetime: {file_datetime}"
    )

    return filename


def get_product_codes(product):
    code_options = []

    with open(ABSOLUTE_CODES_PATH, "r") as f:
        code_options = json.load(f)

    product_codes = [opt.get("value") for opt in code_options[product["type"]]]

    yield from product_codes


async def main(loop):
    minutes = 5

    now_utc = datetime.datetime.now(timezone.utc)
    end_time_utc = now_utc
    start_time_utc = now_utc - timedelta(minutes=minutes)

    bucket_name = "unidata-nexrad-level3"
    radar_site = "PDT"

    products = [
        {"type": "hydrometeor", "field": "radar_echo_classification"},
        {
            "type": "precipitation",
            "field": "radar_estimated_rain_rate",
        },
    ]

    executor = ProcessPoolExecutor()

    if not os.path.exists(DOWNLOAD_FOLDER):
        os.makedirs(DOWNLOAD_FOLDER)

    current_path = os.getcwd()
    file_path = os.path.join(current_path, f"nexrad_level3_data")

    plotted_files = {}
    for product in products:
        product_codes = get_product_codes(product)

        nested_files_to_download = await asyncio.gather(
            *(
                loop.run_in_executor(
                    executor,
                    fetch_nexrad_level3_data,
                    codes,
                    radar_site,
                    bucket_name,
                    start_time_utc,
                    end_time_utc,
                )
                for codes in product_codes
            ),
        )

        files_to_download = Utl.flatten_list(
            nested_files_to_download, flat=[], remove_falsey=True
        )

        print(f"Total Files found for {product['type']}: {files_to_download}")

        existing_files = []

        LIST_FILE_NAME = f"nexrad_level3_{product['type']}_files.json"

        with open(os.path.join(ABSOLUTE_LIST_PATH, LIST_FILE_NAME), "r") as f:
            existing_files.extend(json.load(f))

        downloaded_files = []
        if files_to_download:
            downloaded_files = await asyncio.gather(
                *(
                    loop.run_in_executor(
                        executor,
                        download_nexrad_level3_data,
                        filename,
                        existing_files,
                    )
                    for filename in files_to_download
                ),
            )

        else:
            print(f"No {product['type']} files to download.")
            continue

        print("downloaded_files:", downloaded_files)

        if downloaded_files:
            plotted_files[product["type"]] = await asyncio.gather(
                *(
                    loop.run_in_executor(
                        executor,
                        read_and_plot_nexrad_level3_data,
                        file,
                        file_path,
                        product["type"],
                        product["field"],
                    )
                    for file in downloaded_files
                ),
            )

        else:
            print("No files downloaded.")
            continue

    generate_file_list_json(plotted_files, products, radar_site)

    for root, dirs, files in os.walk(file_path):
        print(f"Removing all temp files")
        for f in files:
            os.unlink(os.path.join(root, f))
        for d in dirs:
            shutil.rmtree(os.path.join(root, d))

    print(f"Level 3 data processing and image creation complete.")


if __name__ == "__main__":
    start = time()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main(loop))
    end = time()
    print(
        f"get_rexrad_data_level2.py completed in {round((end - start)/60, 2)} minutes "
        f"on {datetime.datetime.now()}."
    )
