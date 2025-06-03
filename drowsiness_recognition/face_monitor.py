import cv2
import dlib
import numpy as np
from scipy.spatial import distance as dist

# --- Utility functions ---
def shape_to_np(shape, dtype="int"):
    """
    Convert a dlib shape object to a NumPy array of (x, y) coords
    """
    coords = np.zeros((68, 2), dtype=dtype)
    for i in range(68):
        coords[i] = (shape.part(i).x, shape.part(i).y)
    return coords


def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    return (A + B) / (2.0 * C)


def mouth_aspect_ratio(mouth):
    # mouth: points 48-59
    A = dist.euclidean(mouth[2], mouth[10])  # p50 - p58
    B = dist.euclidean(mouth[4], mouth[8])   # p52 - p56
    C = dist.euclidean(mouth[3], mouth[9])   # p51 - p57
    D = dist.euclidean(mouth[0], mouth[6])   # p49 - p55
    return (A + B + C) / (2.0 * D)

# --- Thresholds ---
EYE_AR_THRESH = 0.2
MOUTH_AR_THRESH = 0.9

# --- Main loop ---
def main():
    # Initialize dlib's face detector and shape predictor
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

    # Start video capture
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Cannot open camera")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        rgb = np.ascontiguousarray(rgb, dtype=np.uint8)
        print("dtype:", rgb.dtype, "shape:", rgb.shape)

        faces = detector(rgb, 0)

        # Default statuses
        left_status = "Left Eye: N/A"
        right_status = "Right Eye: N/A"
        mouth_status = "Mouth: N/A"

        for face in faces:
            shape = predictor(rgb, face)
            pts = shape_to_np(shape)

            # Eyes
            leftEye = pts[42:48]
            rightEye = pts[36:42]
            leftEAR = eye_aspect_ratio(leftEye)
            rightEAR = eye_aspect_ratio(rightEye)

            print(f"Left EAR: {leftEAR:.2f}, Right EAR: {rightEAR:.2f}")

            # Determine eye status
            left_status = f"Left Eye: {'Open' if leftEAR > EYE_AR_THRESH else 'Closed'}"
            right_status = f"Right Eye: {'Open' if rightEAR > EYE_AR_THRESH else 'Closed'}"

            # Mouth
            mouth = pts[48:60]
            mar = mouth_aspect_ratio(mouth)

            print(f"Mouth MAR: {mar:.2f}")
            mouth_status = f"Mouth: {'Open' if mar > MOUTH_AR_THRESH else 'Closed'}"

            # Draw bounding boxes
            ex, ey, ew, eh = cv2.boundingRect(np.concatenate((leftEye, rightEye)))
            cv2.rectangle(frame, (ex, ey), (ex+ew, ey+eh), (0, 255, 0), 2)
            mx, my, mw, mh = cv2.boundingRect(mouth)
            cv2.rectangle(frame, (mx, my), (mx+mw, my+mh), (255, 0, 0), 2)

        # Overlay statuses in top-left
        cv2.putText(frame, left_status, (10, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(frame, right_status, (10, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(frame, mouth_status, (10, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

        cv2.imshow('EAR & MAR Live', frame)

        # Break on 'q'
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()
