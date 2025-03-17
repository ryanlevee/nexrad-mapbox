import asyncio
import datetime
import json
import os
from concurrent.futures import ProcessPoolExecutor
from time import time

import boto3
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pyart
from boto3.s3.transfer import TransferConfig
from botocore import UNSIGNED
from botocore.client import Config
from pyart.core import transforms

RELATIVE_PATH = "./frontend/public/"
ABSOLUTE_IMAGE_PATH = f"{os.path.abspath(RELATIVE_PATH)}/plots_level2/"
ABSOLUTE_LIST_PATH = f"{os.path.abspath(RELATIVE_PATH)}/lists/"
LIST_FILE_NAME = "nexrad_level2_reflectivity_files.json"

CHUNK_SIZE = 1024 * 1024 * 2


def generate_file_list_json(file_list, product_type, debug=False):
    if debug:
        base_path = ABSOLUTE_IMAGE_PATH

        files = [
            f
            for f in file_list or os.listdir(base_path)
            if f.endswith(".json")
        ]

        file_list = [f[:23] for f in files]
        file_list.sort()
        file_set = list(set(file_list))
        files_for_json = file_set
        files_for_json = {}

        for file in file_set:
            files_for_json[file] = {"sweeps": file_list.count(file)}
    else:
        files_for_json = file_list

    current_json = {}
    try:
        with open(
            os.path.join(
                ABSOLUTE_LIST_PATH, f"nexrad_level2_{product_type}_files.json"
            ),
            "r",
        ) as f:
            current_json = json.load(f)
    except FileNotFoundError:
        current_json = {}
    current_json.update(files_for_json)

    with open(
        os.path.join(
            ABSOLUTE_LIST_PATH, f"nexrad_level2_{product_type}_files.json"
        ),
        "w+",
    ) as g:
        json.dump(current_json, g)


def calculate_file_index(radar, sweep_num):
    """Calculates a unique file index based on elevation and azimuth."""
    sweep_data = []
    for i in range(radar.nsweeps):
        start = radar.sweep_start_ray_index["data"][i]
        sweep_data.append(
            (radar.elevation["data"][start], radar.azimuth["data"][start], i)
        )

    sorted_sweeps = sorted(sweep_data)

    for index, (elev, az, num) in enumerate(sorted_sweeps):
        if num == sweep_num:
            return index


def generate_colorbar(ax, product_name, file_base):
    """
    Generates and saves a separate colorbar image in a *dedicated figure*.

    Args:
        ax: The Matplotlib Axes object where the radar plot is drawn.
        product_name (str): Name of the radar product (e.g., 'reflectivity').
        file_base (str): Base filename of the radar data.
    """

    plot_obj = ax.collections[0]

    fig_colorbar = plt.figure(figsize=(0.5, 7))
    ax_colorbar = fig_colorbar.add_axes([0.2, 0.05, 0.6, 0.9])

    fig_colorbar.colorbar(
        mappable=plot_obj,
        cax=ax_colorbar,
        orientation="vertical",
        label=product_name.capitalize() + " (dBZ)",
    )

    ax_colorbar.yaxis.set_label_position("right")
    ax_colorbar.yaxis.label.set_rotation(270)
    ax_colorbar.yaxis.label.set_verticalalignment("bottom")

    colorbar_image_name = f"{file_base}_{product_name}_colorbar.png"
    colorbar_image_path_full = os.path.join(
        ABSOLUTE_IMAGE_PATH, colorbar_image_name
    )

    fig_colorbar.savefig(
        colorbar_image_path_full,
        bbox_inches="tight",
        format="png",
        transparent=True,
    )
    plt.close(fig_colorbar)
    print(f"Saved colorbar image to: {colorbar_image_path_full}")


def process_single_sweep(radar, sweep_num, file_key, product):
    """Processes a single sweep of radar data and creates an image and JSON."""
    file_index = calculate_file_index(radar, sweep_num)
    sweep_start = radar.sweep_start_ray_index["data"][sweep_num]
    elevation_angle = radar.elevation["data"][sweep_start]
    elevation_list = []
    for s in range(radar.nsweeps):
        start_index = radar.sweep_start_ray_index["data"][s]
        elevation_list.append(radar.elevation["data"][start_index])
    unique_elevations = sorted(list(set(elevation_list)))
    elevation_to_index = {
        elevation: index for index, elevation in enumerate(unique_elevations)
    }
    elevation_index = elevation_to_index[elevation_angle]

    x, y, z = radar.get_gate_x_y_z(sweep_num, edges=True)

    min_x_km = np.min(x) / 1000.0
    max_x_km = np.max(x) / 1000.0
    min_y_km = np.min(y) / 1000.0
    max_y_km = np.max(y) / 1000.0

    corners_xy_km = [
        (min_x_km, max_y_km),
        (max_x_km, max_y_km),
        (max_x_km, min_y_km),
        (min_x_km, min_y_km),
    ]

    all_lons = []
    all_lats = []
    radar_lat = radar.latitude["data"][0]
    radar_lon = radar.longitude["data"][0]
    for corner_x_km, corner_y_km in corners_xy_km:
        corner_lon_np, corner_lat_np = transforms.cartesian_to_geographic_aeqd(
            corner_x_km * 1000.0,
            corner_y_km * 1000.0,
            radar_lon,
            radar_lat,
            R=6370997.0,
        )
        corner_lon = float(corner_lon_np)
        corner_lat = float(corner_lat_np)
        all_lons.append(corner_lon)
        all_lats.append(corner_lat)

    min_lon = min(all_lons)
    max_lon = max(all_lons)
    min_lat = min(all_lats)
    max_lat = max(all_lats)

    bbox = {
        "nw": [min_lon, max_lat],
        "ne": [max_lon, max_lat],
        "se": [max_lon, min_lat],
        "sw": [min_lon, min_lat],
    }

    azimuth_angle = radar.azimuth["data"][sweep_start]

    bbox_json_data = {
        "original_sweep_number": sweep_num + 1,
        "elevation_index": elevation_index + 1,
        "elevation_angle_degrees": np.float64(elevation_angle),
        "azimuth_angle_degrees": np.float64(azimuth_angle),
        "bounding_box_lon_lat": bbox,
    }

    file_base = file_key.split("/")[-1]
    json_name = f"{file_base}_{product}_idx{file_index}.json"
    json_path_full = os.path.join(ABSOLUTE_IMAGE_PATH, json_name)

    with open(json_path_full, "w") as f:
        json.dump(bbox_json_data, f, indent=4)

    print(f"Saved bounding box JSON to: {json_path_full}")

    fig = plt.figure(
        figsize=(10, 10),
        dpi=350,
    )

    ax = plt.gca()

    ax.spines["top"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])

    display = pyart.graph.RadarDisplay(radar)
    display.plot(
        product,
        sweep=sweep_num,
        colorbar_label="",
        axislabels=("", ""),
        title_flag=False,
        axislabels_flag=False,
        colorbar_flag=False,
        raster=True,
        vmin=-20,
        vmax=60,
        fig=fig,
        ax=ax,
    )

    image_name = f"{file_base}_{product}_idx{file_index}.png"
    image_path_full = os.path.join(ABSOLUTE_IMAGE_PATH, image_name)

    if not os.path.exists(ABSOLUTE_IMAGE_PATH):
        os.makedirs(ABSOLUTE_IMAGE_PATH)

    plt.savefig(
        image_path_full,
        bbox_inches="tight",
        pad_inches=0,
        format="png",
        transparent=True,
    )

    plt.close()

    print(
        f"Created image, Elevation: {elevation_angle:.2f} degrees, Azimuth: "
        f" {azimuth_angle:.2f} degrees. Saved to {image_path_full}"
    )


def plot_and_save_overlays(file_key, product):
    file_prefix = file_key.split("/")[-1]

    try:
        radar = pyart.io.read(f"temp_file_{file_prefix}")
        num_sweeps = radar.nsweeps

        for sweep_num in range(num_sweeps):
            process_single_sweep(radar, sweep_num, file_key, product)

        os.remove(f"temp_file_{file_prefix}")
        return {"file": file_prefix, "sweeps": num_sweeps}

    except Exception as e:
        print(f"Error processing {file_key}: {e}")
        if os.path.exists(f"temp_file_{file_prefix}"):
            os.remove(f"temp_file_{file_prefix}")
        return {"file": file_prefix, "sweeps": 0}


TRANSFER_CONFIG = TransferConfig(max_concurrency=50)
CONFIG = Config(signature_version=UNSIGNED, s3={"transfer_config": TRANSFER_CONFIG})
SESSION = boto3.session.Session()
S3_CLIENT = SESSION.client("s3", config=CONFIG, region_name="us-east-1")
# DOWNLOAD_FOLDER = "nexrad_level2_data"

def get_data_and_create_radar_file(file_key, bucket_name):
    """Downloads and processes all sweeps of a single radar file."""
    # transfer_config = TransferConfig(max_concurrency=20)
    # config = Config(
    #     signature_version=UNSIGNED, s3={"transfer_config": TRANSFER_CONFIG}
    # )

    # session = boto3.session.Session()
    bucket_name = "noaa-nexrad-level2"
    # s3_client = session.client("s3", config=CONFIG, region_name="us-east-1")
    response = S3_CLIENT.get_object(Bucket=bucket_name, Key=file_key)
    content = response["Body"].read()
    file_prefix = file_key.split("/")[-1]

    with open(f"temp_file_{file_prefix}", "wb") as f:
        f.write(content)


def check_for_files(radar_site, minutes):
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    three_hours_ago = now_utc - datetime.timedelta(minutes=minutes)
    start_date = three_hours_ago.date()
    end_date = now_utc.date()

    s3_resource = boto3.resource(
        "s3", config=Config(signature_version=UNSIGNED)
    )
    bucket = s3_resource.Bucket("noaa-nexrad-level2")

    files_to_process = []
    current_date = start_date
    while current_date <= end_date:
        year = current_date.year
        month = current_date.month
        day = current_date.day
        prefix = f"{year}/{month:02d}/{day:02d}/{radar_site}/"
        all_files_current_date = bucket.objects.filter(Prefix=prefix)
        print(f"Checking prefix: {prefix}")

        for obj in all_files_current_date:
            file_key = obj.key
            if file_key.endswith("V06") and not file_key.endswith("_MDM"):
                try:
                    filename_parts = file_key.split("/")[-1].split("_")
                    timestamp_str = (
                        filename_parts[0][4:] + "_" + filename_parts[1]
                    )
                    file_datetime_utc = datetime.datetime.strptime(
                        timestamp_str, "%Y%m%d_%H%M%S"
                    ).replace(tzinfo=datetime.timezone.utc)

                    if three_hours_ago <= file_datetime_utc <= now_utc:
                        files_to_process.append(file_key)
                    else:
                        print(
                            f"Skipping file (out of {minutes}-minute window): {file_key}"
                        )

                except ValueError:
                    print(
                        f"Warning: Could not parse timestamp from filename: {file_key}. Skipping."
                    )
                    continue

        current_date += datetime.timedelta(days=1)

    return files_to_process


async def main(loop):
    radar_site = "KPDT"
    product_type = "reflectivity"
    minutes = 180

    files_to_process = check_for_files(radar_site, minutes)
    print(f"\nFiles to process (last {minutes} minutes): {files_to_process}")

    existing_files = {}
    try:
        with open(os.path.join(ABSOLUTE_LIST_PATH, LIST_FILE_NAME), "r") as f:
            existing_files = json.load(f)
    except FileNotFoundError:
        pass

    filtered_files = [
        file_key
        for file_key in files_to_process
        if file_key.split("/")[-1] not in existing_files
    ]
    print(f"Filtered files to process (excluding existing): {filtered_files}")

    if filtered_files:
        bucket_name = "noaa-nexrad-level2"

        executor = ProcessPoolExecutor()
        content = await asyncio.gather(
            *(
                loop.run_in_executor(
                    executor,
                    get_data_and_create_radar_file,
                    file, bucket_name,
                )
                for file in filtered_files
            ),
            *(
                loop.run_in_executor(
                    executor,
                    plot_and_save_overlays,
                    file, product_type,
                )
                for file in filtered_files
            ),
        )

        generate_file_list_json([], product_type, debug=True)
    else:
        print("No new files to process.")

    print("Finished processing.")


if __name__ == "__main__":
    start = time()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main(loop))
    end = time()
    print(
        f"get_rexrad_data_level2.py completed in {round((end - start)/60, 2)} minutes "
        f"on {datetime.datetime.now()}."
    )
