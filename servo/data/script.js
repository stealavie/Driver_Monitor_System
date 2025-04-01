document.addEventListener('DOMContentLoaded', (event) => {
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height;
    const radius = 200;
    let websocket;
    let radarData = [];
    let sweepAngle = 0;

    // Properly declared function with connection state check
    const sendCommand = (command) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(`SECURE_TOKEN_123:${command}`);
        }
    };

    // Camera access - removed duplicate call
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            document.getElementById("user-camera").srcObject = stream;
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
            sendCommand(keyMap[event.key]);
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
            sendCommand("stop");
        }
    });

    function drawRadarBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, (radius / 4) * i, Math.PI, 2 * Math.PI);
            ctx.stroke();
        }
        ctx.strokeStyle = '#555';
        for (let angle = 0; angle <= 180; angle += 30) {
            const radian = (angle * Math.PI) / 180;
            const x = centerX + radius * Math.cos(radian);
            const y = centerY - radius * Math.sin(radian);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }

    function drawRadarSweep() {
        drawRadarBackground();
        radarData.forEach((data) => {
            const angle = data.angle;
            const distance = data.distance;
            if (distance < 200) {
                const radian = (angle * Math.PI) / 180;
                const x = centerX + (distance / 200) * radius * Math.cos(radian);
                const y = centerY - (distance / 200) * radius * Math.sin(radian);
                ctx.fillStyle = 'lime';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
        const sweepRadian = (sweepAngle * Math.PI) / 180;
        const sweepX = centerX + radius * Math.cos(sweepRadian);
        const sweepY = centerY - radius * Math.sin(sweepRadian);
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(sweepX, sweepY);
        ctx.stroke();
    }

    function updateSweep() {
        sweepAngle += 2;
        if (sweepAngle > 180) sweepAngle = 0;
        drawRadarSweep();
    }

    function connectWebSocket() {
        websocket = new WebSocket('ws://192.168.4.1/ws');
        
        // Added event handlers for better connection management
        websocket.onopen = () => {
            document.getElementById('status').textContent = "Connected";
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            document.getElementById('status').textContent = "Connection Error";
        };
        
        websocket.onmessage = (event) => {
            const message = event.data;

            // Check if the message is a status update
            if (message.startsWith("status:")) {
                const statusMessage = message.substring(7); 
                document.getElementById('status').textContent = statusMessage;
            } else {
                try {
                    // Handle radar data with error handling
                    console.log('Received radar data:', message);
                    if (message === "no_data") {
                        console.warn('No radar data received');
                        return;
                    }
                    let data;
                    if (message.includes(',')) {
                        // Parse "110,12" as CSV
                        const parts = message.split(',').map(Number);
                        data = { angle: parts[0], distance: parts[1] };
                    } else {
                        // Try JSON parsing
                        data = JSON.parse(message);
                    }

                    if (typeof data.angle !== 'number' || typeof data.distance !== 'number') {
                        console.error('Invalid radar data:', data);
                        return;
                    }
                    radarData.push({ angle: data.angle, distance: data.distance });
                    
                    // Limit array size for better performance
                    if (radarData.length > 180) {
                        radarData.shift();
                    }
                    
                    setTimeout(() => {
                        radarData = radarData.filter(d => d.angle !== data.angle);
                    }, 1000);
                } catch (e) {
                    console.error('Error parsing radar data:', e);
                }
            }
        };
        
        websocket.onclose = () => {
            document.getElementById('status').textContent = "Disconnected";
            setTimeout(connectWebSocket, 1000);
        };
    }

    function initRadar() {
        drawRadarBackground();
        connectWebSocket();
        setInterval(updateSweep, 50);
    }

    initRadar();
});