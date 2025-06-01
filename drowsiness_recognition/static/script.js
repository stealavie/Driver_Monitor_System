document.addEventListener('DOMContentLoaded', (event) => {
    let websocket;
    const PYTHON_SERVER_URL = 'http://localhost:5000/process';
    let processingActive = true;
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
    document.getElementById('mode-normal').addEventListener('change', function() {
        if (this.checked) {
            currentDrivingMode = 'normal';
            console.log("Switching to Normal mode");
            sendCommand('driving mode: normal');
        }
    });

    document.getElementById('mode-sport').addEventListener('change', function() {
        if (this.checked) {
            currentDrivingMode = 'sport';
            console.log("Switching to Sport mode");
            sendCommand('driving mode: sport');
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

    // Initialize face monitoring
    function initFaceMonitoring() {
        const video = document.getElementById('user-camera');
        const canvas = document.getElementById('processing-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;

        // Process frames at regular intervals
        const faceMonitorInterval = setInterval(() => {
            if (!processingActive) return;

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.9);

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
        leftEyeStatus.textContent = data.left_eye;
        // leftEyeStatus.className = data.left_eye.toLowerCase();

        rightEyeStatus.textContent = data.right_eye;
        // rightEyeStatus.className = data.right_eye.toLowerCase();

        mouthStatus.textContent = data.mouth;
        // mouthStatus.className = data.mouth.toLowerCase();

        // // Handle drowsiness alerts
        // if (data.drowsy) {
        //     drowsinessAlertCount++;
            
        //     if (drowsinessAlertCount >= drowsyThreshold) {
        //         drowsinessAlert.textContent = "Cảnh báo có dấu hiệu buồn ngủ!";
        //         drowsinessAlert.className = "alert";
                
        //         // Send alert to ESP32
        //         sendCommand("alert-drowsy");
        //     }
        // } else {
        //     drowsinessAlertCount = 0;
        //     drowsinessAlert.textContent = "Tài xế tỉnh táo";
        //     drowsinessAlert.className = "";
        // }
    }

    // Initialize WebSocket connection
    connectWebSocket();
});
