document.addEventListener('DOMContentLoaded', (event) => {
    let websocket;
    const PYTHON_SERVER_URL = 'http://localhost:5000/process';
    let processingActive = true;
    let drowsinessAlertCount = 0;
    let drowsyThreshold = 3; // Number of consecutive drowsy frames to trigger alert
    let wsConnected = false; // Track connection status
    let currentDrivingMode = 'normal'; // Default driving mode

    // Drowsiness detection variables
    let eyesClosedStartTime = null;
    let eyesClosedDuration = 0;
    let blinkStartTime = null;
    let blinkDuration = 0;
    let consecutiveBlinkCount = 0;
    let mouthOpenStartTime = null;
    let mouthOpenDuration = 0;
    let mouthDisappearStartTime = null;
    let mouthDisappearDuration = 0;
    let lastEyeState = { left: 'open', right: 'open' };
    let lastMouthState = 'closed';
    let alarmAudio = null;
    let alarmActive = false;

    // Initialize alarm audio
    function initAlarm() {
        alarmAudio = new Audio('static/alarm.wav');
        alarmAudio.loop = true;
        alarmAudio.volume = 0.8;
    }

    // Play alarm
    function playAlarm() {
        if (!alarmActive && alarmAudio) {
            alarmActive = true;
            alarmAudio.play().catch(e => console.error('Alarm play error:', e));
        }
    }

    // Stop alarm
    function stopAlarm() {
        if (alarmActive && alarmAudio) {
            alarmActive = false;
            alarmAudio.pause();
            alarmAudio.currentTime = 0;
        }
    }

    // Initialize alarm on page load
    initAlarm();

    // Help modal functionality
    const helpButton = document.getElementById('help-button');
    const helpModal = document.getElementById('help-modal');
    const closeModal = document.getElementById('close-modal');

    // Show modal when help button is clicked
    helpButton.addEventListener('click', () => {
        helpModal.classList.add('show');
    });

    // Close modal when close button is clicked
    closeModal.addEventListener('click', () => {
        helpModal.classList.remove('show');
    });

    // Close modal when clicking outside modal content
    window.addEventListener('click', (event) => {
        if (event.target === helpModal) {
            helpModal.classList.remove('show');
        }
    });

    // Close modal with Escape key
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && helpModal.classList.contains('show')) {
            helpModal.classList.remove('show');
        }
    });

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
    }    // Update UI with drowsiness detection results
    function updateDriverStatus(data) {
        // Get DOM elements
        const leftEyeStatus = document.getElementById('left-eye-status');
        const rightEyeStatus = document.getElementById('right-eye-status');
        const mouthStatus = document.getElementById('mouth-status');
        const drowsinessAlert = document.getElementById('drowsiness-alert');

        // Update eye and mouth status display
        leftEyeStatus.textContent = data.left_eye_state;
        rightEyeStatus.textContent = data.right_eye_state;
        mouthStatus.textContent = data.mouth_state;

        const currentTime = Date.now();
        const frameInterval = 150; // ms between frames
        let alarmTriggered = false;

        // Check eye closure conditions
        const bothEyesClosed = data.left_eye_state === 'closed' && data.right_eye_state === 'closed';
        const anyEyeClosed = data.left_eye_state === 'closed' || data.right_eye_state === 'closed';

        // Track eyes closed for 3+ seconds
        if (bothEyesClosed) {
            if (eyesClosedStartTime === null) {
                eyesClosedStartTime = currentTime;
            }
            eyesClosedDuration = currentTime - eyesClosedStartTime;
            
            if (eyesClosedDuration >= 3000) { // 3 seconds
                alarmTriggered = true;
                console.log("Alarm: Eyes closed for 3+ seconds");
            }
        } else {
            eyesClosedStartTime = null;
            eyesClosedDuration = 0;
        }

        // Track continuous blinking for 10+ seconds
        const eyeStateChanged = (data.left_eye_state !== lastEyeState.left) || 
                               (data.right_eye_state !== lastEyeState.right);
        
        if (eyeStateChanged && anyEyeClosed) {
            consecutiveBlinkCount++;
            if (blinkStartTime === null) {
                blinkStartTime = currentTime;
            }
            blinkDuration = currentTime - blinkStartTime;
            
            // If blinking continuously for 10+ seconds
            if (blinkDuration >= 10000 && consecutiveBlinkCount >= 10) { // 10 seconds with many blinks
                alarmTriggered = true;
                console.log("Alarm: Continuous blinking for 10+ seconds");
            }
        } else if (!anyEyeClosed && eyeStateChanged) {
            // Reset blink tracking if eyes are fully open and state changed
            if (blinkDuration < 10000) {
                blinkStartTime = null;
                blinkDuration = 0;
                consecutiveBlinkCount = 0;
            }
        }

        // Track mouth open for 3+ seconds
        if (data.mouth_state === 'open') {
            if (mouthOpenStartTime === null) {
                mouthOpenStartTime = currentTime;
            }
            mouthOpenDuration = currentTime - mouthOpenStartTime;
            
            if (mouthOpenDuration >= 3000) { // 3 seconds
                alarmTriggered = true;
                console.log("Alarm: Mouth open for 3+ seconds");
            }
        } else {
            mouthOpenStartTime = null;
            mouthOpenDuration = 0;
        }

        // Track mouth disappear (no detection) for 3+ seconds
        if (data.mouth_state === 'Không có thông tin') {
            if (mouthDisappearStartTime === null) {
                mouthDisappearStartTime = currentTime;
            }
            mouthDisappearDuration = currentTime - mouthDisappearStartTime;
            
            if (mouthDisappearDuration >= 3000) { // 3 seconds
                alarmTriggered = true;
                console.log("Alarm: Mouth disappeared for 3+ seconds");
            }
        } else {
            mouthDisappearStartTime = null;
            mouthDisappearDuration = 0;
        }

        // Handle alarm state
        if (alarmTriggered) {
            drowsinessAlert.textContent = "CẢNH BÁO! Phát hiện dấu hiệu buồn ngủ!";
            drowsinessAlert.className = "alert";
            playAlarm();
            
            // Send alert to ESP32
            sendCommand("alert-drowsy");
        } else {
            drowsinessAlert.textContent = "Tài xế tỉnh táo";
            drowsinessAlert.className = "";
            stopAlarm();
        }

        // Update last states for comparison
        lastEyeState.left = data.left_eye_state;
        lastEyeState.right = data.right_eye_state;
        lastMouthState = data.mouth_state;

        // Debug information
        if (eyesClosedDuration > 0) {
            console.log(`Eyes closed duration: ${eyesClosedDuration}ms`);
        }
        if (blinkDuration > 0) {
            console.log(`Blink duration: ${blinkDuration}ms, count: ${consecutiveBlinkCount}`);
        }
        if (mouthOpenDuration > 0) {
            console.log(`Mouth open duration: ${mouthOpenDuration}ms`);
        }
        if (mouthDisappearDuration > 0) {
            console.log(`Mouth disappear duration: ${mouthDisappearDuration}ms`);
        }
    }

    // Initialize WebSocket connection
    connectWebSocket();
});