# netlify/functions/api.py
from flask import Flask, jsonify

app = Flask(__name__)


@app.route("/.netlify/functions/api")
def api():
    return jsonify({"message": "Hello from Netlify functions!"})


def handler(event, context):
    with app.request_context(event["path"]):
        response = app.full_dispatch_request()
        return {
            "statusCode": response.status_code,
            "headers": dict(response.headers),
            "body": response.get_data(as_text=True),
        }
