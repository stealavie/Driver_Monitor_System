// Global variables
let websocket;
const PYTHON_SERVER_URL = 'http://localhost:5000/process';
let processingActive = true;
let wsConnected = false; // Track connection status
let currentDrivingMode = 'normal'; // Default driving mode

// Drowsiness detection variables
let eyesClosedStartTime = null;
let eyesClosedDuration = 0;
let mouthOpenStartTime = null;
let mouthOpenDuration = 0;
let mouthDisappearStartTime = null;
let mouthDisappearDuration = 0;
let lastEyeState = { left: 'open', right: 'open' };
let alarmAudio = null;
let alarmActive = false;

// Latency measurement variables
let latencyMeasurements = [];
let currentLatency = 0;
let averageLatency = 0;
let maxLatency = 0;
let commandTimestamps = new Map(); // Track command send times
let latencyDisplayEnabled = true;

// Global functions for latency measurement
function calculateLatency(startTime) {
    const endTime = performance.now();
    const latency = endTime - startTime;
    
    // Store latency measurement
    latencyMeasurements.push(latency);
    
    // Keep only last 100 measurements for performance
    if (latencyMeasurements.length > 100) {
        latencyMeasurements.shift();
    }
    
    // Update latency statistics
    currentLatency = latency;
    averageLatency = latencyMeasurements.reduce((sum, val) => sum + val, 0) / latencyMeasurements.length;
    maxLatency = Math.max(maxLatency, latency);
    
    // Update UI display
    updateLatencyDisplay();
    
    console.log(`Command latency: ${latency.toFixed(2)}ms (avg: ${averageLatency.toFixed(2)}ms)`);
    
    return latency;
}

function updateLatencyDisplay() {
    const latencyElement = document.getElementById('latency-display');
    if (latencyElement && latencyDisplayEnabled) {
        latencyElement.innerHTML = `
            <div class="latency-stats">
                <span>Current: ${currentLatency.toFixed(1)}ms</span>
                <span>Average: ${averageLatency.toFixed(1)}ms</span>
                <span>Max: ${maxLatency.toFixed(1)}ms</span>
            </div>
        `;
    }
}

function resetLatencyStats() {
    latencyMeasurements = [];
    currentLatency = 0;
    averageLatency = 0;
    maxLatency = 0;
    updateLatencyDisplay();
    console.log('Latency statistics reset');
}

function getLatencyStats() {
    return {
        current: currentLatency,
        average: averageLatency,
        max: maxLatency,
        count: latencyMeasurements.length,
        measurements: [...latencyMeasurements]
    };
}

// Global function for button onclick handlers
function sendPingCommand() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const startTime = performance.now();
        const pingId = `ping_${Date.now()}`;
        
        commandTimestamps.set(pingId, startTime);
        
        // Send ping command
        websocket.send(`SECURE_TOKEN_123-ping:${pingId}`);
        
        console.log("Ping sent:", pingId);
    } else {
        console.error("WebSocket not connected. Cannot send ping.");
    }
}

document.addEventListener('DOMContentLoaded', (event) => {

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
    }    // Initialize alarm on page load
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
    });    // Enhanced sendCommand function with latency measurement
    const sendCommand = (command) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const startTime = performance.now();
            const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store timestamp for this command
            commandTimestamps.set(commandId, startTime);
            
            console.log("Sending command:", command);
            
            // Send command with ID for tracking
            const fullCommand = `SECURE_TOKEN_123-${command}`;
            websocket.send(fullCommand);
            
            // Set timeout to measure latency even without explicit response
            setTimeout(() => {
                if (commandTimestamps.has(commandId)) {
                    calculateLatency(startTime);
                    commandTimestamps.delete(commandId);
                }
            }, 50); // Assume command processed within 50ms if no explicit response
            
        } else {
            console.error("WebSocket not connected. Cannot send command:", command);
        }
    };

    // Driving mode selector event listeners
    document.getElementById('mode-shift').addEventListener('change', function () {
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
        }        // Handle C key for toggling driving mode
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

        // Handle P key for ping test
        if (event.key === 'p' || event.key === 'P') {
            sendPingCommand();
        }

        // Handle L key for latency display toggle
        if (event.key === 'l' || event.key === 'L') {
            latencyDisplayEnabled = !latencyDisplayEnabled;
            if (!latencyDisplayEnabled) {
                const latencyElement = document.getElementById('latency-display');
                if (latencyElement) latencyElement.innerHTML = '';
            } else {
                updateLatencyDisplay();
            }
            console.log(`Latency display ${latencyDisplayEnabled ? 'enabled' : 'disabled'}`);
        }

        // Handle R key for reset latency stats
        if (event.key === 'r' || event.key === 'R') {
            resetLatencyStats();
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
    });    // WebSocket connection
    function connectWebSocket() {
        console.log("Attempting to connect to WebSocket...");
        websocket = new WebSocket('ws://192.168.4.1/ws');        websocket.onopen = () => {
            console.log("WebSocket Connected");
            wsConnected = true;
            // Send a test ping to measure initial latency
            setTimeout(() => {
                sendPingCommand();
                // Start periodic latency tests every 10 seconds
                setInterval(() => {
                    if (wsConnected) {
                        sendPingCommand();
                    }
                }, 10000);
            }, 500);
        };

        websocket.onmessage = (event) => {
            console.log('Received message:', event.data);
            
            // Handle ping responses for latency measurement
            if (event.data.includes('pong:')) {
                const pingId = event.data.split('pong:')[1];
                const timestampKey = `ping_${pingId}`;
                
                if (commandTimestamps.has(timestampKey)) {
                    const startTime = commandTimestamps.get(timestampKey);
                    calculateLatency(startTime);
                    commandTimestamps.delete(timestampKey);
                }
            }
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

        let isProcessing = false;

        function processFrame() {
            if (!processingActive || isProcessing) return;

            isProcessing = true;
            const startTime = Date.now();

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.75);

            fetch(PYTHON_SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ frame: imageData })
            })
                .then(response => response.json())
                .then(data => {
                    updateDriverStatus(data);
                    const processingTime = Date.now() - startTime;
                    console.log(`Processing time: ${processingTime}ms`);

                    // Schedule next frame with adaptive delay
                    const nextDelay = Math.max(30 - processingTime, 10);
                    setTimeout(processFrame, nextDelay);
                })
                .catch(error => {
                    console.error('Error processing frame:', error);
                    setTimeout(processFrame, 100); // Retry after error
                })
                .finally(() => {
                    isProcessing = false;
                });
        }

        // Start processing
        processFrame();

        // Return cleanup function
        return () => {
            processingActive = false;
        };
    }
    // Update UI with drowsiness detection results
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
        let alarmTriggered = false;

        // Check eye closure conditions
        const anyEyeClosed = data.left_eye_state === 'closed' || data.right_eye_state === 'closed';

        // Track eyes closed for 2+ seconds
        if (anyEyeClosed) {
            if (eyesClosedStartTime === null) {
                eyesClosedStartTime = currentTime;
            }
            eyesClosedDuration = currentTime - eyesClosedStartTime;

            if (eyesClosedDuration >= 2000) { // 2 seconds
                alarmTriggered = true;
                console.log("Alarm: Eyes closed for 2+ seconds");
            }
        } else {
            eyesClosedStartTime = null;
            eyesClosedDuration = 0;
        }

        // Track mouth open for 2+ seconds
        if (data.mouth_state === 'open') {
            if (mouthOpenStartTime === null) {
                mouthOpenStartTime = currentTime;
            }
            mouthOpenDuration = currentTime - mouthOpenStartTime;

            if (mouthOpenDuration >= 2000) { // 2 seconds
                alarmTriggered = true;
                console.log("Alarm: Mouth open for 2+ seconds");
            }
        } else {
            mouthOpenStartTime = null;
            mouthOpenDuration = 0;
        }

        // Track mouth disappear (no detection) for 2+ seconds
        if (data.mouth_state === 'Không có thông tin') {
            if (mouthDisappearStartTime === null) {
                mouthDisappearStartTime = currentTime;
            }
            mouthDisappearDuration = currentTime - mouthDisappearStartTime;

            if (mouthDisappearDuration >= 2000) { // 2 seconds
                alarmTriggered = true;
                console.log("Alarm: Mouth disappeared for 2+ seconds");
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
            document.body.classList.add('warning-active');

            // Send alert to ESP32
            sendCommand("alert-drowsy");
        } else {
            drowsinessAlert.textContent = "Tài xế tỉnh táo";
            drowsinessAlert.className = "";
            stopAlarm();
            document.body.classList.remove('warning-active');
        }

        // Update last states for comparison
        lastEyeState.left = data.left_eye_state;
        lastEyeState.right = data.right_eye_state;
        lastMouthState = data.mouth_state;

        // Debug information
        if (eyesClosedDuration > 0) {
            console.log(`Eyes closed duration: ${eyesClosedDuration}ms`);
        }
        if (mouthOpenDuration > 0) {
            console.log(`Mouth open duration: ${mouthOpenDuration}ms`);
        }
        if (mouthDisappearDuration > 0) {
            console.log(`Mouth disappear duration: ${mouthDisappearDuration}ms`);
        }
    }    // Initialize WebSocket connection
    connectWebSocket();
});
