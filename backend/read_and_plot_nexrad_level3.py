import json
import os

import matplotlib.pyplot as plt
import numpy as np
import pyart
from pyart.core import transforms

RELATIVE_PATH = "./frontend/public/"
ABSOLUTE_IMAGE_PATH = f"{os.path.abspath(RELATIVE_PATH)}/plots_level3/"


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
    colorbar_image_path_full = os.path.join(ABSOLUTE_IMAGE_PATH, colorbar_image_name)

    fig_colorbar.savefig(
        colorbar_image_path_full,
        bbox_inches="tight",
        format="png",
        transparent=True,
    )
    plt.close(fig_colorbar)
    print(f"Saved colorbar image to: {colorbar_image_path_full}")


def read_and_plot_nexrad_level3_data(filename, file_path, product_type, field):
    fns = filename.split("_")

    normalized_filename = (
        f"K{''.join([fns[0], *fns[2:5]])}_{''.join(fns[5:8])}_{fns[1]}"
    )

    file_index = 0

    img_ext = ".png"
    save_img_filename = f"{normalized_filename}_{product_type}_idx{file_index}{img_ext}"
    json_ext = ".json"
    save_json_filename = (
        f"{normalized_filename}_{product_type}_idx{file_index}{json_ext}"
    )

    radar_data_path = os.path.join(file_path, filename)

    radar = False

    # print("Reading NEXRAD Level 3 file:", radar_data_path)
    try:
        radar = pyart.io.read_nexrad_level3(radar_data_path)
    except FileNotFoundError:
        print(f"Error: File not found at path: {radar_data_path}")
    except Exception as e:
        print(f"General Error occurred while reading file: {radar_data_path}A")
        print("Error details:", e)

    if not radar:
        print(f"Error: {product_type} radar cannot be created for: {radar_data_path}")
        return False

    # print("\n--- Generating plot of radar_echo_classification ---")

    display = pyart.graph.RadarDisplay(radar)
    sweep_num = 0
    sweep_start = radar.sweep_start_ray_index["data"][sweep_num]
    elevation_angle = radar.elevation["data"][sweep_start]

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
        "elevation_angle_degrees": np.float64(elevation_angle),
        "azimuth_angle_degrees": np.float64(azimuth_angle),
        "bounding_box_lon_lat": bbox,
    }

    json_path_full = os.path.join(ABSOLUTE_IMAGE_PATH, save_json_filename)

    with open(json_path_full, "w") as f:
        json.dump(bbox_json_data, f, indent=4)

    print(f"Saved bounding box JSON to: {json_path_full}")

    fig = plt.figure(figsize=(10, 10), dpi=350)
    ax = plt.gca()

    ax.spines["top"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])

    display.plot(
        field,
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

    if not os.path.exists(ABSOLUTE_IMAGE_PATH):
        os.makedirs(ABSOLUTE_IMAGE_PATH)

    image_path_full = os.path.join(ABSOLUTE_IMAGE_PATH, save_img_filename)

    plt.savefig(
        image_path_full,
        bbox_inches="tight",
        pad_inches=0,
        format="png",
        transparent=True,
    )

    plt.close()

    print(f"Plot saved to {save_img_filename}")

    return normalized_filename

    # return {normalized_filename: {"sweeps": 1}}


# current_path = os.getcwd()
# file_path = os.path.join(current_path, f"nexrad_level3_data")
# product = {"type": "hydrometeor", "field": "radar_echo_classification"}


# read_and_plot_nexrad_level3_data(
#     'PDT_N1H_2025_03_16_18_08_20',
#     file_path,
#     product['type'],
#     product['field'],
# )
