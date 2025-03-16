import shutil
import asyncio
import datetime
import json
import os
import re
from datetime import timedelta, timezone
import sys
from time import time
from concurrent.futures import ProcessPoolExecutor

import aiobotocore.session
from pytz import UTC
from read_and_plot_nexrad_level3 import read_and_plot_nexrad_level3_data

RELATIVE_PATH = "./frontend/public/"
ABSOLUTE_CODES_PATH = f"{os.path.abspath(RELATIVE_PATH)}/codes/options.json"
ABSOLUTE_IMAGE_PATH = f"{os.path.abspath(RELATIVE_PATH)}/plots_level3/"
ABSOLUTE_LIST_PATH = f"{os.path.abspath(RELATIVE_PATH)}/lists/"

CHUNK_SIZE = 1024 * 1024 * 2


def generate_file_list_json(file_list, product_type, debug=False):
    # # files_json = {}
    # # with open(
    # #     os.path.join(
    # #         ABSOLUTE_LIST_PATH, f"nexrad_level3_{product_type}_files.json"
    # #     )
    # # ) as f:
    # #     files_json = json.load(f)

    # # files_for_json = list(files_json.keys())

    # # current_json = {}
    # # with open(
    # #     os.path.join(
    # #         ABSOLUTE_LIST_PATH, f"nexrad_level3_{product_type}_files.json"
    # #     ),
    # #     "r",
    # # ) as f:
    # #     current_json = json.load(f)
    # #     f.close()

    # # [current_json.update({file: {"sweeps": "1"}}) for file in files_for_json]

    # with open(
    #     os.path.join(
    #         ABSOLUTE_LIST_PATH, f"nexrad_level3_{product_type}_files.json"
    #     ),
    #     "w+",
    # ) as g:
    #     json.dump(file_list, g)
    #     # json.dump(current_json, g)

    # code_options = {}

    # with open(
    #     ABSOLUTE_CODES_PATH,
    #     "r",
    # ) as h:
    #     code_options = json.load(h)
    #     h.close()

    # product_codes = code_options[product_type]
    # # jcodes = [jk[-3:] for jk in files_for_json]
    # jcodes = [jk[-3:] for jk in file_list]

    # for i, codes in enumerate(product_codes):
    #     code = codes["value"]
    #     product_codes[i]["count"] = jcodes.count(code)

    # code_options[product_type] = product_codes

    # with open(
    #     ABSOLUTE_CODES_PATH,
    #     "w+",
    # ) as j:
    #     json.dump(code_options, j)
    base_path = ABSOLUTE_IMAGE_PATH
    files = [
        f
        for f in os.listdir(base_path)
        if f.endswith(f"{product_type}_idx0.json")
    ]
    file_list = [f[:23] for f in files]
    file_list.sort()
    file_set = list(set(file_list))
    files_for_json = file_set
    files_for_json = {}

    print(file_set)

    for file in file_set:
        files_for_json[file] = {"sweeps": file_list.count(file)}

        with open(
            os.path.join(
                ABSOLUTE_LIST_PATH, f"nexrad_level3_{product_type}_files.json"
            ),
            "w+",
        ) as g:
            json.dump(files_for_json, g)
            g.close()

        code_options = {}

        with open(
            ABSOLUTE_CODES_PATH,
            "r",
        ) as h:
            code_options = json.load(h)
            h.close()

        product_codes = code_options[product_type]
        # jcodes = [jk[-3:] for jk in files_for_json]
        jcodes = [jk[-3:] for jk in file_list]

        for i, codes in enumerate(product_codes):
            code = codes["value"]
            product_codes[i]["count"] = jcodes.count(code)

        code_options[product_type] = product_codes

        with open(
            ABSOLUTE_CODES_PATH,
            "w+",
        ) as j:
            json.dump(code_options, j)
            j.close()


async def download_nexrad_level3_data(
    file_list,
    product,
    bucket_name="unidata-nexrad-level3",
    download_dir="nexrad_level3_data",
):
    session = aiobotocore.session.get_session()
    async with session.create_client("s3") as s3:
        if not os.path.exists(download_dir):
            os.makedirs(download_dir)

        LIST_FILE_NAME = f"nexrad_level3_{product['type']}_files.json"

        existing_files = {}
        with open(os.path.join(ABSOLUTE_LIST_PATH, LIST_FILE_NAME), "r") as f:
            existing_files = json.load(f)

        # existing_files = os.listdir(download_dir)

        downloaded_files_gen = []
        for filename in file_list:
            fns = filename.split("_")

            normalized_filename = (
                f"K{''.join([fns[0], *fns[2:5]])}_{''.join(fns[5:8])}_{fns[1]}"
            )

            fn = filename.replace("_", "")
            normalized_filename = f"K{fn[:-6]}_{fn[-6:]}"

            if normalized_filename in existing_files:
                print(f"File {filename} already exists, skipping.")
                continue
            download_path = os.path.join(download_dir, filename)
            print(f"Downloading {filename} to {download_path}")

            try:
                r = await s3.get_object(Bucket=bucket_name, Key=filename)
                parts = []
                body = r["Body"]
                while data := await body.read(CHUNK_SIZE):
                    parts.append(data)

                content = b"".join(parts)

                with open(download_path, "wb") as f:
                    f.write(content)
                print(f"Downloaded {filename} successfully.")
                downloaded_files_gen.append(filename)
            except Exception as e:
                print(f"ERROR downloading {filename}: {e}")
        return downloaded_files_gen


async def fetch_nexrad_level3_data(
    product_codes,
    radar_site,
    bucket_name,
    start_time,
    end_time,
    max_keys=1000,
):
    session = aiobotocore.session.get_session()
    async with session.create_client("s3") as s3:
        all_files_list = []

        for product_code_prefix in product_codes:
            current_time = start_time

            while current_time <= end_time:
                prefix = f"{radar_site}_{product_code_prefix}_{current_time.strftime('%Y_%m_%d_%H')}"

                file_list_for_product = []
                continuation_token = None

                while True:
                    list_kwargs = {
                        "Bucket": bucket_name,
                        "Prefix": prefix,
                        "MaxKeys": max_keys,
                    }
                    if continuation_token:
                        list_kwargs["ContinuationToken"] = continuation_token

                    response = await s3.list_objects_v2(**list_kwargs)

                    # if "Contents" not in response or not response["Contents"]:
                    #     print(
                    #         f"No 'Contents' found in response {response.keys()}"
                    #     )
                    # else:
                    #     print(
                    #         f"Number of objects in response: {len(response['Contents'])}"
                    #     )

                    for obj in response.get("Contents", []):
                        match_files(
                            product_code_prefix, file_list_for_product, obj
                        )

                    continuation_token = response.get("NextContinuationToken")
                    if not continuation_token:
                        break

                current_time += timedelta(hours=1)
                all_files_list.extend(file_list_for_product)

                print(
                    f"Files found for product type {product_code_prefix}: {file_list_for_product}"
                )

        print(f"Total Files found across all product types: {all_files_list}")
        return all_files_list


def match_files(product_code_prefix, file_list_for_product, obj):
    filename = obj["Key"]
    print(f"Processing filename: {filename}")

    match = re.match(
        r"^(?P<site>[A-Z]{3})_(?P<product>[A-Z0-9]{3})_(?P<year>\d{4})_(?P<month>\d{2})_(?P<day>\d{2})_(?P<hour>\d{2})_(?P<minute>\d{2})_(?P<second>\d{2})$",
        filename,
    )

    if match:
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
        file_list_for_product.append(filename)
    else:
        print(f"SKIPPING: Filename pattern mismatch: {filename}")


async def main(loop):
    minutes = 20

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

    current_path = os.getcwd()
    file_path = os.path.join(current_path, f"nexrad_level3_data")

    for product in products:
        code_options = []

        with open(ABSOLUTE_CODES_PATH, "r") as f:
            code_options = json.load(f)

        product_codes = [
            opt.get("value") for opt in code_options[product["type"]]
        ]

        files_to_download = await fetch_nexrad_level3_data(
            product_codes,
            radar_site,
            bucket_name,
            start_time_utc,
            end_time_utc,
        )

        # existing_files = os.listdir(file_path)

        # filtered_files = [
        #     file
        #     for file in files_to_download
        #     if file not in existing_files
        # ]
        # print(f"Filtered files to process: {filtered_files}")
        # LIST_FILE_NAME = f"nexrad_level3_{product['type']}_files.json"

        # existing_files = {}
        # try:
        #     with open(
        #         os.path.join(ABSOLUTE_LIST_PATH, LIST_FILE_NAME), "r"
        #     ) as f:
        #         existing_files = json.load(f)
        # except FileNotFoundError:
        #     pass

        ####### NEED TO NORMALIZE FILENAME FOR THIS CHECK ########
        # filtered_files = [
        #     file_key
        #     for file_key in files_to_download
        #     # if file_key.split("/")[-1] not in existing_files
        #     # if f"K{''.join([file_key[0], *file_key[2:5]])}_{''.join(file_key[5:8])}_{file_key[1]}" not in existing_files
        # ]
        # print(
        #     f"Filtered files to process (excluding existing): {filtered_files}"
        # )

        downloaded_files = []
        if files_to_download:
            downloaded_files = await download_nexrad_level3_data(
                files_to_download, product
            )
            print(f"{product['type']} download and processing complete.")
        else:
            print(f"No {product['type']} files to download.")
            continue

        file_list = []
        if downloaded_files:
            executor = ProcessPoolExecutor()
            file_list = await asyncio.gather(
                *(
                    loop.run_in_executor(
                        executor,
                        read_and_plot_nexrad_level3_data,
                        file,
                        [file_path, product["type"], product["field"]],
                    )
                    for file in downloaded_files
                ),
            )

            # for file in filtered_files:
            #     if file in existing_files:
            #         print(f"File {file} already exists, skipping.")
            #         continue

            #     plotted_file = read_and_plot_nexrad_level3_data(
            #         file_path, file, product["type"], product["field"]
            #     )
            #     file_list.append(plotted_file)
        else:
            print("No files downloaded.")

        generate_file_list_json(file_list, product["type"])

    for root, dirs, files in os.walk(file_path):
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
