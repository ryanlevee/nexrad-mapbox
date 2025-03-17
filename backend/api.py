from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)


@app.route("/*", methods=["OPTIONS"])
def handle_options():
    return "", 204


@app.route("/flag/", methods=["GET"])
def handle_flag_get():
    data = "{}"
    try:
        with open("public/flags/update_flags.json", "r") as f:
            data = f.read()
        print(data)
    except FileNotFoundError:
        data = "{}"

    return jsonify(data), 200


@app.route("/flag/", methods=["POST"])
def handle_flag_post():
    try:
        body = request.get_data(as_text=True)

        if not body:
            return jsonify({"error": "Request body is empty"}), 400

        with open("public/flags/update_flags.json", "w") as f:
            f.write(body)
            print("written to file.")

        return jsonify({"updated": True, "message": "Data updated!"}), 200

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": "Internal Server Error"}), 500


@app.route("/list/", methods=["GET"])
def handle_list_get():

    ###################### JUST FOR TESTING ######################
    with open("public/nexrad_level2_reflectivity_files_mod.json", "r") as f:
        mod = f.read()

    with open("public/nexrad_level2_reflectivity_files.json", "w") as f:
        f.write(mod)
        print("written to file.")
    ##############################################################

    data = "{}"
    try:
        with open("public/nexrad_level2_reflectivity_files.json", "r") as f:
            data = f.read()
        print(data)
    except FileNotFoundError:
        data = "{}"

    data = {"sent": True, "message": "list GET test received"}

    ###################### JUST FOR TESTING ######################
    with open("public/nexrad_level2_reflectivity_files_orig.json", "r") as f:
        orig = f.read()

    with open("public/nexrad_level2_reflectivity_files.json", "w") as f:
        f.write(orig)
        print("written to file.")
    ##############################################################

    return jsonify(data), 200


@app.route("/list-all/", methods=["GET"])
def handle_list_all_get():

    ###################### JUST FOR TESTING ######################
    with open("public/lists/nexrad_level2_reflectivity_files_mod.json", "r") as f:
        mod = f.read()

    with open("public/lists/nexrad_level2_reflectivity_files.json", "w") as f:
        f.write(mod)
        print("written to file.")
    ##############################################################

    data = []

    try:
        with open("public/lists/nexrad_level2_reflectivity_files.json", "r") as f:
            data.append(json.load(f))
        with open("public/lists/nexrad_level3_hydrometeor_files.json", "r") as g:
            data.append(json.load(g))
        with open("public/lists/nexrad_level3_precipitation_files.json", "r") as h:
            data.append(json.load(h))
    except FileNotFoundError as e:
        print(e)
        data = []

    # data = {"sent": True, "message": "list GET test received"}

    ###################### JUST FOR TESTING ######################
    with open("public/lists/nexrad_level2_reflectivity_files_orig.json", "r") as f:
        orig = f.read()

    with open("public/lists/nexrad_level2_reflectivity_files.json", "w") as f:
        f.write(orig)
        print("written to file.")
    ##############################################################

    print(data)

    # return data, 200
    return jsonify(data), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4000))
    app.run(host="0.0.0.0", port=port, debug=True)  # Enable debug mode
