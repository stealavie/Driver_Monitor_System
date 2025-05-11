import cv2
import dlib
import numpy as np
import scipy.spatial.distance as dist
import base64
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import time
import shutil
import socket

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load the dlib's face detector and predictor
detector = dlib.get_frontal_face_detector()
predictor_path = os.path.join(os.path.dirname(__file__), "shape_predictor_68_face_landmarks.dat")
predictor = dlib.shape_predictor(predictor_path)

# Create a static folder if it doesn't exist
STATIC_FOLDER = os.path.join(os.path.dirname(__file__), "static")

# ESP32 AP settings
ESP32_IP = "192.168.4.1"
ESP32_PORT = 80

def check_esp32_connection():
    """Check if ESP32 is reachable by attempting to connect to its IP and port"""
    try:
        # Create a socket connection to ESP32
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)  # 1 second timeout
        result = sock.connect_ex((ESP32_IP, ESP32_PORT))
        sock.close()
        return result == 0  # Returns True if connection was successful
    except:
        return False

def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    ear = (A + B) / (2.0 * C)
    return ear

def compute_eye_aspect_ratios(landmarks):
    # Right eye: landmarks 36-41 
    rightEye = landmarks[36:42]
    # Left eye: landmarks 42-47
    leftEye = landmarks[42:48]
    # Compute EAR for both eyes
    leftEAR = eye_aspect_ratio(leftEye)
    rightEAR = eye_aspect_ratio(rightEye)
    return leftEAR, rightEAR

def compute_mouth_aspect_ratio(landmarks):
    A = dist.euclidean(landmarks[49], landmarks[59])
    B = dist.euclidean(landmarks[53], landmarks[55])
    C = dist.euclidean(landmarks[51], landmarks[57])
    D = dist.euclidean(landmarks[48], landmarks[54])
    mar = (A + B + C) / (3.0 * D)
    return mar

def process_frame(frame_data):
    # Convert base64 image to OpenCV format
    image_data = base64.b64decode(frame_data.split(',')[1])
    nparr = np.frombuffer(image_data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Process the frame for drowsiness detection
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = detector(gray)
    
    results = {
        "drowsy": False,
        "left_eye_state": "Unknown",
        "right_eye_state": "Unknown",
        "mouth_state": "Unknown"
    }
    
    for face in faces:
        shape = predictor(gray, face)
        landmarks = np.array([[p.x, p.y] for p in shape.parts()])
        
        if len(landmarks) != 68:
            continue
            
        left_ear, right_ear = compute_eye_aspect_ratios(landmarks)
        mar = compute_mouth_aspect_ratio(landmarks)
        
        avg_ear = (left_ear + right_ear) / 2.0
        
        # Determine states based on aspect ratios
        left_eye_state = "Open" if left_ear > 0.2 else "Closed"
        right_eye_state = "Open" if right_ear > 0.2 else "Closed"
        mouth_state = "Open" if mar > 0.75 else "Closed"
        
        # Check for drowsiness (both eyes closed)
        drowsy = left_eye_state == "Closed" and right_eye_state == "Closed"
        
        results = {
            "drowsy": drowsy,
            "left_eye_state": left_eye_state,
            "right_eye_state": right_eye_state,
            "mouth_state": mouth_state,
            "ear": float(avg_ear),
            "mar": float(mar)
        }
        
        # Only process the first face
        break
    
    return results

@app.route('/process_frame', methods=['POST'])
def process_frame_endpoint():
    data = request.get_json()
    
    if not data or 'frame' not in data:
        return jsonify({"error": "No frame data provided"}), 400
    
    try:
        results = process_frame(data['frame'])
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    # Check if ESP32 is connected
    if check_esp32_connection():
        # If connected, serve the main UI
        return send_from_directory(STATIC_FOLDER, 'index.htm')
    else:
        # If not connected, show the connection check page
        return send_from_directory(STATIC_FOLDER, 'connection_check_page.htm')

if __name__ == "__main__":
    print(f"Server running at http://localhost:5000/")
    print(f"UI files directory: {STATIC_FOLDER}")
    # Run the Flask app on port 5000
    app.run(host='0.0.0.0', port=5000, debug=False)