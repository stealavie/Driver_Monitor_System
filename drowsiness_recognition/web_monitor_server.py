import os
import base64
import socket
import csv
import threading
from datetime import datetime

import cv2
import dlib
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from scipy.spatial import distance as dist
import time

# --- Configuration ---
EYE_AR_THRESH = 0.2
MOUTH_AR_THRESH = 0.7
ESP32_IP = "192.168.4.1"
ESP32_PORT = 80

# --- CSV Logging Configuration ---
CSV_FILE_PATH = os.path.join(os.path.dirname(__file__), "processing_times.csv")
processing_times = []
processing_times_lock = threading.Lock()


# --- Flask App Setup ---
app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'file://'])

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


def initialize_csv():
    """Initialize CSV file with headers if it doesn't exist."""
    if not os.path.exists(CSV_FILE_PATH):
        with open(CSV_FILE_PATH, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['time', 'processing_time'])


def save_average_processing_time():
    """Calculate and save average processing time every second."""
    while True:
        time.sleep(1)  # Wait for 1 second
        
        with processing_times_lock:
            if processing_times:
                # Calculate average processing time
                avg_processing_time = sum(processing_times) / len(processing_times)
                current_time = datetime.now().strftime('%H:%M:%S')
                
                # Save to CSV
                with open(CSV_FILE_PATH, 'a', newline='', encoding='utf-8') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow([current_time, f"{avg_processing_time:.2f}"])
                
                print(f"Saved to CSV: {current_time}, Average processing time: {avg_processing_time:.2f}ms")
                
                # Clear the list for the next second
                processing_times.clear()


def add_processing_time(processing_time):
    """Add a processing time to the list for averaging."""
    with processing_times_lock:
        processing_times.append(processing_time)

# --- Flask Endpoints ---
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/process', methods=['POST', 'OPTIONS'])
def process_frame():
    if request.method == 'OPTIONS':
        return '', 200
    
    start_time = time.time()
    
    try:
        data = request.get_json(force=True)
        img_data = data.get('frame', '')

        if not img_data:
            return jsonify(error='No frame data provided'), 400

        # Optimize image processing
        if ',' in img_data:
            img_data = img_data.split(',', 1)[1]
        
        # Decode and resize for faster processing
        raw = base64.b64decode(img_data)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify(error='Invalid frame'), 400

        # Resize frame for faster processing (optional)
        height, width = frame.shape[:2]
        if width > 640:  # Resize if too large
            scale = 640 / width
            new_width = 640
            new_height = int(height * scale)
            frame = cv2.resize(frame, (new_width, new_height))

        # Convert to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
          # Face detection
        faces = detector(rgb_frame, 0)  # Use 0 instead of 1 for faster detection
        
        result = {
            'left_eye_state': 'Không có thông tin',
            'right_eye_state': 'Không có thông tin',
            'mouth_state': 'Không có thông tin',
            'face_detected': False
        }

        if faces:
            gray = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2GRAY)
            shape = predictor(gray, faces[0])
            pts = shape_to_np(shape)

            leftEAR = eye_aspect_ratio(pts[42:48])
            rightEAR = eye_aspect_ratio(pts[36:42])
            result['left_eye_state'] = 'open' if leftEAR > EYE_AR_THRESH else 'closed'
            result['right_eye_state'] = 'open' if rightEAR > EYE_AR_THRESH else 'closed'

            mar = mouth_aspect_ratio(pts[48:60])
            result['mouth_state'] = 'open' if mar > MOUTH_AR_THRESH else 'closed'
            result['face_detected'] = True

        processing_time = (time.time() - start_time) * 1000
        print(f"Frame processed in {processing_time:.1f}ms")
        
        # Add processing time to the collection for CSV logging
        add_processing_time(processing_time)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify(error=f'Error: {str(e)}'), 500


@app.route('/')
def index():
    """Serve main UI if ESP32 is reachable, else show connection page."""
    # page = 'index.htm' if check_esp32_connection() else 'connection_check_page.htm'
    page = 'index.htm'
    return send_from_directory(STATIC_FOLDER, page)


if __name__ == '__main__':
    # Initialize CSV file and start the logging thread
    initialize_csv()
    
    # Start the CSV logging thread in daemon mode
    csv_thread = threading.Thread(target=save_average_processing_time, daemon=True)
    csv_thread.start()
    
    print(f"Server running on http://0.0.0.0:5000, serving {STATIC_FOLDER}")
    print(f"Processing times will be logged to: {CSV_FILE_PATH}")
    app.run(host='0.0.0.0', port=5000, debug=False)
