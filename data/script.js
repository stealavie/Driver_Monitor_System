document.addEventListener('DOMContentLoaded', (event) => {
    let websocket;
    const PYTHON_SERVER_URL = 'http://localhost:5000/process_frame';
    let processingActive = true;
    let lastFrameTime = 0;
    let frameCount = 0;
    let fpsUpdateInterval = null;
    let drowsinessAlertCount = 0;
    let drowsyThreshold = 3; // Number of consecutive drowsy frames to trigger alert
    let wsConnected = false; // Track connection status
    let currentDrivingMode = 'normal'; // Default driving mode

    // Properly declared function with connection state check
    const sendCommand = (command) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log("Sending command:", command);
            websocket.send(`SECURE_TOKEN_123-${command}`);
        } else {
            console.error("WebSocket not connected. Cannot send command:", command);
        }
    };

    // Driving mode selector event listeners
    document.getElementById('mode-shift').addEventListener('change', function() {
        // Cập nhật vị trí của gear-handle dựa trên giá trị
        this.setAttribute('value', this.value);
        
        if (parseInt(this.value) === 0) {
            currentDrivingMode = 'sport';
            console.log("Switching to Sport mode");
            sendCommand('driving mode: sport');
        } else {
            currentDrivingMode = 'normal';
            console.log("Switching to Normal mode");
            sendCommand('driving mode: normal');
        }
    });

    // Camera access
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            const videoElement = document.getElementById("user-camera");
            videoElement.srcObject = stream;
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                // Start processing frames once the video is playing
                initFaceMonitoring();
            };
        })
        .catch(err => {
            console.error("Cannot access camera:", err);
        });


    // Keyboard event handlers
    document.addEventListener("keydown", function (event) {
        let keyMap = {
            'w': 'btn-up',
            's': 'btn-down',
            'a': 'btn-left',
            'd': 'btn-right',
            'ArrowUp': 'btn-up',
            'ArrowDown': 'btn-down',
            'ArrowLeft': 'btn-left',
            'ArrowRight': 'btn-right'
        };
        if (keyMap[event.key]) {
            document.getElementById(keyMap[event.key]).classList.add("active");
            let command = "Pressed: " + keyMap[event.key];
            sendCommand(command);
        }
        
        // Handle C key for toggling driving mode
        if (event.key === 'c' || event.key === 'C') {
            const modeShift = document.getElementById('mode-shift');
            // Toggle value between 0 and 1
            const newValue = modeShift.value === '0' ? '1' : '0';
            modeShift.value = newValue;
            modeShift.setAttribute('value', newValue); // For CSS handle
            // Trigger the change event manually
            const changeEvent = new Event('change', { bubbles: true });
            modeShift.dispatchEvent(changeEvent);
        }
    });

    document.addEventListener("keyup", function (event) {
        let keyMap = {
            'w': 'btn-up',
            's': 'btn-down',
            'a': 'btn-left',
            'd': 'btn-right',
            'ArrowUp': 'btn-up',
            'ArrowDown': 'btn-down',
            'ArrowLeft': 'btn-left',
            'ArrowRight': 'btn-right'
        };
        if (keyMap[event.key]) {
            document.getElementById(keyMap[event.key]).classList.remove("active");
            let command = "Released: " + keyMap[event.key];
            sendCommand(command);
        } 
    });

    // WebSocket connection
    function connectWebSocket() {
        console.log("Attempting to connect to WebSocket...");
        websocket = new WebSocket('ws://192.168.4.1/ws');
        
        websocket.onopen = () => {
            console.log("WebSocket Connected");
            wsConnected = true;
            // Send a test message to ensure connection is working
            setTimeout(() => {
                sendCommand('connection-test');
            }, 500);
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            wsConnected = false;
        };
        
        websocket.onclose = () => {
            console.log("WebSocket Disconnected");
            wsConnected = false;
            setTimeout(connectWebSocket, 1000);
        };
    }

    // Initialize the FPS counter
    function initFPSCounter() {
        fpsUpdateInterval = setInterval(() => {
            const now = performance.now();
            const elapsed = now - lastFrameTime;
            if (elapsed > 0) {
                const fps = Math.round((frameCount * 1000) / elapsed);
                document.getElementById('fps-counter').textContent = fps;
                lastFrameTime = now;
                frameCount = 0;
            }
        }, 1000);
    }

    // Initialize face monitoring
    function initFaceMonitoring() {
        const video = document.getElementById('user-camera');
        const canvas = document.getElementById('processing-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;

        // Initialize FPS counter
        initFPSCounter();

        // Process frames at regular intervals
        const faceMonitorInterval = setInterval(() => {
            if (!processingActive) return;

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.9);
            frameCount++;

            // Send the frame to the Python server for processing
            fetch(PYTHON_SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ frame: imageData })
            })
            .then(response => response.json())
            .then(data => {
                // Update UI with drowsiness detection results
                updateDriverStatus(data);
            })
            .catch(error => {
                console.error('Error processing frame:', error);
            });
        }, 150); // Process frame every 150ms (approximately 6-7 FPS)

        // Cleanup function
        return () => {
            clearInterval(faceMonitorInterval);
            clearInterval(fpsUpdateInterval);
        };
    }

    // Update UI with drowsiness detection results
    function updateDriverStatus(data) {
        // Get DOM elements
        const leftEyeStatus = document.getElementById('left-eye-status');
        const rightEyeStatus = document.getElementById('right-eye-status');
        const mouthStatus = document.getElementById('mouth-status');
        const drowsinessAlert = document.getElementById('drowsiness-alert');

        // Update eye and mouth status
        leftEyeStatus.textContent = data.left_eye_state;
        leftEyeStatus.className = data.left_eye_state.toLowerCase();

        rightEyeStatus.textContent = data.right_eye_state;
        rightEyeStatus.className = data.right_eye_state.toLowerCase();

        mouthStatus.textContent = data.mouth_state;
        mouthStatus.className = data.mouth_state.toLowerCase();

        // Handle drowsiness alerts
        if (data.drowsy) {
            drowsinessAlertCount++;
            
            if (drowsinessAlertCount >= drowsyThreshold) {
                drowsinessAlert.textContent = "Cảnh báo có dấu hiệu buồn ngủ!";
                drowsinessAlert.className = "alert";
                
                // Send alert to ESP32
                sendCommand("alert-drowsy");
            }
        } else {
            drowsinessAlertCount = 0;
            drowsinessAlert.textContent = "Tài xế tỉnh táo";
            drowsinessAlert.className = "";
        }
    }

    // Initialize WebSocket connection
    connectWebSocket();
});