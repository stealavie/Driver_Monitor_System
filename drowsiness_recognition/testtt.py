import cv2
import time
import dlib
import joblib
import numpy as np
import scipy.spatial.distance as dist

# Load the SVM model and dlib's face detector and predictor
model = joblib.load('svm_drowsiness_model.pkl')
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
    rightEye = [(landmarks.part(i).x, landmarks.part(i).y) for i in range(36, 42)]
    # Left eye: landmarks 42-47
    leftEye = [(landmarks.part(i).x, landmarks.part(i).y) for i in range(42, 48)]
    leftEAR = eye_aspect_ratio(leftEye)
    rightEAR = eye_aspect_ratio(rightEye)
    return (leftEAR + rightEAR) / 2.0

def record_video(output_file='output.avi', duration=10, fps=20.0, frame_size=(640, 480)):
    # Open the default webcam 
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    # Define the codec and create VideoWriter object.
    # The 'XVID' codec is widely used. You can change it if needed.
    fourcc = cv2.VideoWriter_fourcc(*'XVID')
    out = cv2.VideoWriter(output_file, fourcc, fps, frame_size)

    print("Recording started. Press 'q' to stop.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame.")
            break

        # Resize the frame to the desired size
        frame = cv2.resize(frame, frame_size)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Ensure the image is 8-bit grayscale
        if gray.dtype == np.uint8:
            faces = detector(gray)
        else:
            print("Unsupported image type, must be 8bit gray or RGB image.")
            continue

        for face in faces:
            landmarks = predictor(gray, face)
            ear = compute_eye_aspect_ratios(landmarks)

            # Predict drowsiness (assuming label 1: drowsy, 0: non-drowsy)
            prediction = model.predict_proba(np.array([[ear]]))[0]
            drowsy_prob = prediction[1] 
            label_text = "Drowsy" if drowsy_prob >= 0.6 else "Non Drowsy"

            # Draw rectangle around the face
            cv2.rectangle(frame, (face.left(), face.top()), (face.right(), face.bottom()), (0, 255, 0), 2)
            # Put text label above the face rectangle
            cv2.putText(frame, label_text, (face.left(), face.top()-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
        # Write the frame into the file
        out.write(frame)

        # Display the live video feed in a window
        cv2.imshow('drowsiness detection', frame)

        # Check if the user pressed 'q' to quit early
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("Recording stopped by user.")
            break

    # Release resources
    cap.release()
    out.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    record_video(output_file='recorded_video.avi', duration=10, fps=20.0, frame_size=(640, 480))