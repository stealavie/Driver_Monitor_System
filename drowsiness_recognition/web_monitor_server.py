import os
import base64
import socket

import cv2
import dlib
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from scipy.spatial import distance as dist

# --- Configuration ---
EYE_AR_THRESH = 0.2
MOUTH_AR_THRESH = 0.9
ESP32_IP = "192.168.4.1"
ESP32_PORT = 80

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app)

# --- Paths ---
HERE = os.path.dirname(__file__)
PREDICTOR_PATH = os.path.join(HERE, "shape_predictor_68_face_landmarks.dat")
STATIC_FOLDER = os.path.join(HERE, "static")

# --- dlib Models ---
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor(PREDICTOR_PATH)

# --- Utility Functions ---

def check_esp32_connection():
    """Return True if ESP32 at ESP32_IP:ESP32_PORT is reachable."""
    try:
        with socket.create_connection((ESP32_IP, ESP32_PORT), timeout=1):
            return True
    except OSError:
        return False


def shape_to_np(shape, dtype="int"):
    """
    Convert a dlib shape object to a NumPy array of (x, y) coordinates.
    """
    coords = np.zeros((68, 2), dtype=dtype)
    for i in range(68):
        coords[i] = (shape.part(i).x, shape.part(i).y)
    return coords


def eye_aspect_ratio(eye):
    """Compute eye aspect ratio (EAR) for a set of 6 landmarks."""
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    return (A + B) / (2.0 * C)


def mouth_aspect_ratio(mouth):
    """Compute mouth aspect ratio (MAR) for a set of 12 landmarks."""
    A = dist.euclidean(mouth[2], mouth[10])
    B = dist.euclidean(mouth[4], mouth[8])
    C = dist.euclidean(mouth[3], mouth[9])
    D = dist.euclidean(mouth[0], mouth[6])
    return (A + B + C) / (2.0 * D)

# --- Flask Endpoints ---

@app.route('/process', methods=['POST'])
def process_frame():
    """Receive a base64-encoded JPEG frame, process drowsiness, return JSON."""
    data = request.get_json(force=True)
    img_data = data.get('frame', '')

    # Decode base64 image
    if ',' in img_data:
        img_data = img_data.split(',', 1)[1]
    raw = base64.b64decode(img_data)
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify(error='Invalid frame'), 400

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = detector(gray, 1)
    result = {'left_eye': None, 'right_eye': None, 'mouth': None}

    if faces:
        shape = predictor(gray, faces[0])
        pts = shape_to_np(shape)

        leftEAR = eye_aspect_ratio(pts[42:48])
        rightEAR = eye_aspect_ratio(pts[36:42])
        result['left_eye'] = 'open' if leftEAR > EYE_AR_THRESH else 'closed'
        result['right_eye'] = 'open' if rightEAR > EYE_AR_THRESH else 'closed'

        mar = mouth_aspect_ratio(pts[48:60])
        result['mouth'] = 'open' if mar > MOUTH_AR_THRESH else 'closed'

    return jsonify(result)


@app.route('/')
def index():
    """Serve main UI if ESP32 is reachable, else show connection page."""
    # page = 'index.htm' if check_esp32_connection() else 'connection_check_page.htm'
    page = 'index.htm'
    return send_from_directory(STATIC_FOLDER, page)


if __name__ == '__main__':
    print(f"Server running on http://0.0.0.0:5000, serving {STATIC_FOLDER}")
    app.run(host='0.0.0.0', port=5000, debug=False)
