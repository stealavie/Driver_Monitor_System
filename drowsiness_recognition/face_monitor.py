# https://www.irjet.net/archives/V9/i5/IRJET-V9I5633.pdf

import cv2
import time
import dlib
import numpy as np
import scipy.spatial.distance as dist
import os

# Load the SVM model and dlib's face detector and predictor
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    ear = (A + B) / (2.0 * C)
    return ear

def compute_eye_aspect_ratios(landmarks):
    # Right eye: landmarks 36-41 
    rightEye = landmarks[36:42]  # Right eye: landmarks 36-41
    # Left eye: landmarks 42-47
    leftEye = landmarks[42:48]  # Left eye: landmarks 42-47
    # Compute EAR for both eyes
    leftEAR = eye_aspect_ratio(leftEye)
    rightEAR = eye_aspect_ratio(rightEye)
    return leftEAR, rightEAR

def compute_mouth_aspect_ratio(landmarks):
    A = dist.euclidean(landmarks[49], landmarks[59]) # 49 for left upper lip, 59 left lower lip
    B = dist.euclidean(landmarks[53], landmarks[55]) # 53 for right upper lip, 55 right lower lip
    C = dist.euclidean(landmarks[51], landmarks[57]) # 48 for center upper lip, 57 center lower of lip
    D = dist.euclidean(landmarks[48], landmarks[54]) # 48 for left corner of mouth, 54 right corner of mouth
    mar = (A + B + C) / (3.0 * D)
    return mar

def compute_bbox_coordinate(landmarks):
    # Left eye: landmarks 36-41
    left_eye_points = landmarks[36:42]
    left_x = [p[0] for p in left_eye_points]
    left_y = [p[1] for p in left_eye_points]
    left_min_x, left_max_x = min(left_x), max(left_x)
    left_min_y, left_max_y = min(left_y), max(left_y)
    left_eye_rect = (left_min_x, left_min_y, left_max_x - left_min_x, left_max_y - left_min_y)

    # Right eye: landmarks 42-47
    right_eye_points = landmarks[42:48]
    right_x = [p[0] for p in right_eye_points]
    right_y = [p[1] for p in right_eye_points]
    right_min_x, right_max_x = min(right_x), max(right_x)
    right_min_y, right_max_y = min(right_y), max(right_y)
    right_eye_rect = (right_min_x, right_min_y, right_max_x - right_min_x, right_max_y - right_min_y)

    # Mouth: landmarks 48-67
    mouth_points = landmarks[48:68]
    mouth_x = [p[0] for p in mouth_points]
    mouth_y = [p[1] for p in mouth_points]
    mouth_min_x, mouth_max_x = min(mouth_x), max(mouth_x)
    mouth_min_y, mouth_max_y = min(mouth_y), max(mouth_y)
    mouth_rect = (mouth_min_x, mouth_min_y, mouth_max_x - mouth_min_x, mouth_max_y - mouth_min_y)

    return left_eye_rect, right_eye_rect, mouth_rect

def record_video(frame_size=(640, 480)):
    cap = cv2.VideoCapture("10.mov")  # Use 0 for webcam or provide a video file path
    if not cap.isOpened():
        print("Error: Could not open video.")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break  # Stop when video ends

        frame = cv2.resize(frame, frame_size)
        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        faces = detector(gray)
        for face in faces:
            landmarks = predictor(gray, face)
            landmarks = np.array([[p.x, p.y] for p in landmarks.parts()])
            if len(landmarks) != 68:
                continue

            left_ear, right_ear = compute_eye_aspect_ratios(landmarks)
            mar = compute_mouth_aspect_ratio(landmarks)

            left_eye_state = "Opened Eyes" if left_ear > 0.1 else "Closed Eyes"
            right_eye_state = "Opened Eyes" if right_ear > 0.1 else "Closed Eyes"
            mouth_state = "Opened Mouth" if mar > 0.75 else "Closed Mouth"

            # Calculate bounding boxes using all relevant landmarks
            (left_eye_x, left_eye_y, left_eye_w, left_eye_h), \
            (right_eye_x, right_eye_y, right_eye_w, right_eye_h), \
            (mouth_x, mouth_y, mouth_w, mouth_h) = compute_bbox_coordinate(landmarks)

            # Draw bounding boxes and labels
            cv2.rectangle(frame, (left_eye_x, left_eye_y), (left_eye_x + left_eye_w, left_eye_y + left_eye_h), (0, 255, 0), 2)
            cv2.rectangle(frame, (right_eye_x, right_eye_y), (right_eye_x + right_eye_w, right_eye_y + right_eye_h), (0, 255, 0), 2)
            cv2.rectangle(frame, (mouth_x, mouth_y), (mouth_x + mouth_w, mouth_y + mouth_h), (0, 255, 0), 2)
            cv2.putText(frame, left_eye_state, (left_eye_x, left_eye_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, right_eye_state, (right_eye_x, right_eye_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, mouth_state, (mouth_x, mouth_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.imshow("Frame", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):  # Press 'q' to quit
                break
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    record_video(frame_size=(640, 480))