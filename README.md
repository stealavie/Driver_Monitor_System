# Hệ thống phát hiện tài xế ngủ gật & điều khiển xe 🚘

**Người trợ lý giữ an toàn cho bạn trên mọi nẻo đường**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Framework: Flask](https://img.shields.io/badge/Framework-Flask-green.svg)](https://flask.palletsprojects.com/)
[![Library: OpenCV](https://img.shields.io/badge/Library-OpenCV-orange.svg)](https://opencv.org/)

Dự án này là một hệ thống toàn diện sử dụng thị giác máy tính để theo dõi trạng thái của tài xế theo thời gian thực. Bằng cách phân tích hình ảnh từ camera, hệ thống có khả năng phát hiện các dấu hiệu của sự mệt mỏi và ngủ gật như nhắm mắt kéo dài hoặc ngáp, từ đó đưa ra cảnh báo kịp thời bằng âm thanh và hình ảnh để đảm bảo an toàn cho người lái.

## 🎥 Demo

[https://github.com/stealavie/Driver_Monitor_System/issues/1#issue-3134301059](https://github.com/user-attachments/assets/009065f2-5ae4-4973-8478-ca242ac92624)

## ✨ Tính Năng Nổi Bật

- 👁️ **Phát hiện ngủ gật thời gian thực**: Sử dụng thuật toán phân tích tỷ lệ khung hình mắt (EAR) và miệng (MAR) để xác định trạng thái tỉnh táo của tài xế.
- 🔊 **Cảnh báo đa phương thức**: Tự động phát âm thanh cảnh báo (`alarm.wav`) và hiển thị cảnh báo trực quan trên giao diện khi phát hiện dấu hiệu nguy hiểm.
- 🚗 **Giao diện điều khiển xe**: Tích hợp giao diện web cho phép người dùng gửi lệnh điều khiển (tiến, lùi, trái, phải) tới xe (thông qua ESP32).
- 🌐 **Giao diện giám sát trên Web**: Toàn bộ hệ thống được quản lý và theo dõi qua một giao diện web trực quan, dễ sử dụng tại `http://127.0.0.1:5000`.
- 🔌 **Tích hợp phần cứng ESP32**: Được thiết kế để kết nối và giao tiếp với module ESP32-CAM, đóng vai trò cầu nối giữa phần mềm và phần cứng của xe.
- ✅ **Kiểm tra kết nối**: Tự động kiểm tra và thông báo trạng thái kết nối với ESP32 trước khi khởi động các tính năng chính.

## 🛠️ Công Nghệ Sử Dụng

- **Backend**:
  - **Python**: Ngôn ngữ lập trình chính.
  - **Flask**: Một micro web framework để xây dựng máy chủ backend.
  - **OpenCV**: Thư viện xử lý hình ảnh và video, dùng để đọc và xử lý frame từ camera.
  - **Dlib**: Cung cấp mô hình học máy `shape_predictor_68_face_landmarks` để nhận diện các điểm mốc trên khuôn mặt.
  - **Scipy**: Hỗ trợ các tính toán khoảng cách trong thuật toán EAR và MAR.
- **Frontend**:
  - **HTML/CSS/JavaScript**: Xây dựng giao diện người dùng web.
- **Phần cứng**:
  - **ESP32-CAM**: Module chịu trách nhiệm điều khiển xe và có thể là nguồn cung cấp hình ảnh.

## 🚀 Cài đặt & Khởi chạy

### Yêu cầu
- Python 3.10.x
- Git

### Hướng dẫn cài đặt

1.  **Clone a repository về máy**
    ```bash
    git clone <your-repository-link>
    cd <repository-folder>
    ```

2.  **Tạo và kích hoạt môi trường ảo (Virtual Environment)**
    
    Đây là bước quan trọng để tránh xung đột thư viện giữa các dự án.
    ```bash
    # Tạo môi trường ảo
    python -m venv venv
    
    # Kích hoạt trên Windows
    venv\Scripts\activate.bat
    
    # Kích hoạt trên macOS/Linux
    source venv/bin/activate
    ```

3.  **Cài đặt các thư viện cần thiết**

    File `requirements.txt` chứa tất cả các thư viện Python cần thiết.
    ```bash
    pip install -r requirements.txt
    ```

4.  **Cài đặt thư viện `dlib`**

    Dự án yêu cầu một phiên bản `dlib` cụ thể tương thích với Python 3.10.
    ```bash
    python -m pip install dlib-19.22.99-cp310-cp310-win_amd64.whl
    ```
    *LƯU Ý: Nếu bạn sử dụng phiên bản Python khác, bạn sẽ cần tìm file `.whl` của `dlib` tương ứng.*

### Chạy chương trình

1.  **Kết nối với ESP32**

    Bật nguồn xe, sau đó kết nối máy tính của bạn vào mạng Wi-Fi có tên **"ESP32_AP"** với mật khẩu là **"12345678"**.

2.  **Khởi chạy máy chủ Web**

    Chạy file `web_monitor_server.py` để khởi động backend và giao diện người dùng.
    ```bash
    python web_monitor_server.py
    ```

3.  **Truy cập ứng dụng**

    Mở trình duyệt web và truy cập vào địa chỉ sau để bắt đầu sử dụng:
    [http://127.0.0.1:5000](http://127.0.0.1:5000)

## 📂 Cấu Trúc Dự Án
```
.
├── README.md                   # File README
├── web_monitor_server.py       # File Flask server chính, xử lý logic backend
├── requirements.txt            # Danh sách các thư viện Python
├── shape_predictor_68_face_landmarks.dat # Model của Dlib để nhận diện khuôn mặt
├── dlib-19.22.99-cp310-cp310-win_amd64.whl # File cài đặt Dlib
├── static/                     # Thư mục chứa tài nguyên frontend
│   ├── index.htm               # Trang giao diện chính
│   ├── style.css               # File CSS cho giao diện
│   ├── script.js               # File JavaScript xử lý logic frontend
│   ├── alarm.wav               # Âm thanh cảnh báo
│   └── ...
└── CameraWebServer/            # (Có thể) chứa mã nguồn cho ESP32-CAM
```

## 🐛 Xử lý sự cố (Troubleshooting)

- **Lỗi `ModuleNotFoundError: No module named '...'`**:
  - Đảm bảo bạn đã kích hoạt môi trường ảo (`venv`) trước khi chạy ứng dụng.
  - Chạy lại lệnh `pip install -r requirements.txt` để chắc chắn rằng tất cả thư viện đã được cài đặt.

- **Camera không hoạt động**:
  - Kiểm tra xem camera đã được kết nối đúng cách và không bị ứng dụng nào khác sử dụng.
  - Đảm bảo bạn đã cấp quyền cho trình duyệt truy cập camera.

- **Không thể kết nối tới ESP32**:
  - Kiểm tra lại xem bạn đã kết nối đúng vào mạng Wi-Fi của ESP32 chưa.
  - Xác nhận địa chỉ IP của ESP32 trong file `web_monitor_server.py` (`ESP32_IP = "192.168.4.1"`) là chính xác.
