#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// Hardware Configuration
#define MOTOR_LEFT        16
#define MOTOR_RIGHT       17
#define MOTOR_BACKWARD    18
#define MOTOR_FORWARD     19
#define ENA_PIN           32  // PWM pin for enA (forward/backward speed)
#define ENB_PIN           35  // PWM pin for enB (left/right speed)
#define WS_AUTH_TOKEN     "SECURE_TOKEN_123"
#define UPDATE_INTERVAL   200  // 200ms to reduce load
#define MOTOR_TIMEOUT     250  // ms

// Motor speed settings
#define DEFAULT_ENA_SPEED 100  // Default speed for forward/backward
#define SPORT_ENA_SPEED   150  // Sport mode speed for forward/backward
#define DEFAULT_ENB_SPEED 80   // Default speed for left/right 
#define MAX_SPEED         255

// Define AP credentials
#define AP_SSID "ESP32_AP"
#define AP_PASSWORD "12345678"

// Communication settings
#define MIN_SEND_INTERVAL 150  // At least 150ms between data sends

int enaSpeed = DEFAULT_ENA_SPEED;
int enbSpeed = DEFAULT_ENB_SPEED;
bool sportModeEnabled = false;

// Motor state flags
bool motorForward = false;
bool motorBackward = false;
bool motorLeft = false;
bool motorRight = false;

// Frame rate tracking
unsigned long frameCount = 0;
unsigned long lastFrameTime = 0;
bool clientConnected = false;
unsigned long lastDataSent = 0;

struct SystemState {
  unsigned long lastMotorAction = 0;
};
SystemState state;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// Motor Control with analogWrite
void initHardware() {
  // Setup motor control pins
  pinMode(MOTOR_FORWARD, OUTPUT);
  pinMode(MOTOR_BACKWARD, OUTPUT);
  pinMode(MOTOR_LEFT, OUTPUT);
  pinMode(MOTOR_RIGHT, OUTPUT);
  pinMode(ENA_PIN, OUTPUT);
  pinMode(ENB_PIN, OUTPUT);

  analogWrite(ENA_PIN, enaSpeed);
  analogWrite(ENB_PIN, enbSpeed);

  // Test left motor
  Serial.println("Testing left motor...");
  controlLeftRight(MOTOR_LEFT, true);
  delay(1000);
  controlLeftRight(MOTOR_LEFT, false);
  
  // Test right motor
  Serial.println("Testing right motor...");
  controlLeftRight(MOTOR_RIGHT, true);
  delay(1000);
  controlLeftRight(MOTOR_RIGHT, false);

  // Test forward motor
  Serial.println("Testing forward motor...");
  controlForwardBackward(MOTOR_FORWARD, true);
  delay(1000);
  controlForwardBackward(MOTOR_FORWARD, false);

  // Test backward motor
  Serial.println("Testing backward motor...");
  controlForwardBackward(MOTOR_BACKWARD, true);
  delay(1000);
  controlForwardBackward(MOTOR_BACKWARD, false);

  stopAllMotors();
}

void controlForwardBackward(uint8_t pin, bool stateVal) {
  digitalWrite(pin, stateVal ? HIGH : LOW);
  if (stateVal) {
    analogWrite(ENA_PIN, enaSpeed);
  }
}

void controlLeftRight(uint8_t pin, bool stateVal) {
  digitalWrite(pin, stateVal ? HIGH : LOW);
  if (stateVal) {
    analogWrite(ENB_PIN, enbSpeed);
  }
}

void stopAllMotors() {
  controlForwardBackward(MOTOR_FORWARD, false);
  controlForwardBackward(MOTOR_BACKWARD, false);
  controlLeftRight(MOTOR_LEFT, false);
  controlLeftRight(MOTOR_RIGHT, false);
  // Ensure PWM output is zero
  analogWrite(ENA_PIN, 0);
  analogWrite(ENB_PIN, 0);
  
  // Reset motor state flags
  motorForward = false;
  motorBackward = false;
  motorLeft = false;
  motorRight = false;
}

// Calculate simulated camera FPS
float calculateFPS() {
  unsigned long currentTime = millis();
  frameCount++;
  
  if (currentTime - lastFrameTime >= 1000) {
    float fps = frameCount * 1000.0 / (currentTime - lastFrameTime);
    frameCount = 0;
    lastFrameTime = currentTime;
    return fps;
  }
  
  return 0; // Don't update FPS if less than 1 second has passed
}

// Handle driving mode changes
void setDrivingMode(bool sportMode) {
  sportModeEnabled = sportMode;
  
  if (sportMode) {
    enaSpeed = SPORT_ENA_SPEED;
    Serial.println("Sport mode activated");
  } else {
    enaSpeed = DEFAULT_ENA_SPEED;
    Serial.println("Normal mode activated");
  }
  
  // Apply new speed settings to active motors
  if (motorForward || motorBackward) {
    analogWrite(ENA_PIN, enaSpeed);
  }
}

// WebSocket Handlers
void handleWebSocketMessage(AsyncWebSocketClient *client, String message) {
  if (!message.startsWith(WS_AUTH_TOKEN)) {
    client->close(403, "Unauthorized");
    return;
  }

  String command = message.substring(message.indexOf('-')+1);
  state.lastMotorAction = millis();
  
  // Log received command to Serial monitor
  Serial.print("Received command: ");
  Serial.println(command);

  // Handle driving mode settings
  if (command == "mode-sport") {
    setDrivingMode(true);
  } else if (command == "mode-normal") {
    setDrivingMode(false);
  } 
  // Handle movement commands
  else if (command.startsWith("Pressed: ")) {
    // remove "Pressed: " prefix
    String buttonPressed = command.substring(9);
    
    if(buttonPressed == "btn-up"){
      if(!motorForward) {
        motorForward = true;
        controlForwardBackward(MOTOR_FORWARD, true);
      }
    } else if(buttonPressed == "btn-down"){
      if(!motorBackward) {
        motorBackward = true;
        controlForwardBackward(MOTOR_BACKWARD, true);
      }
    } else if(buttonPressed == "btn-left"){
      if(!motorLeft) {
        motorLeft = true;
        controlLeftRight(MOTOR_LEFT, true);
      }
    } else if(buttonPressed == "btn-right"){
      if(!motorRight) {
        motorRight = true;
        controlLeftRight(MOTOR_RIGHT, true);
      }
    } else {
      Serial.println("Unknown button pressed: " + buttonPressed);
    }
  }
  else if (command.startsWith("Released: ")) {
    // remove "Released: " prefix
    String buttonReleased = command.substring(10);
    
    if(buttonReleased == "btn-up"){
      motorForward = false;
      controlForwardBackward(MOTOR_FORWARD, false);
    } else if(buttonReleased == "btn-down"){
      motorBackward = false;
      controlForwardBackward(MOTOR_BACKWARD, false);
    } else if(buttonReleased == "btn-left"){
      motorLeft = false;
      controlLeftRight(MOTOR_LEFT, false);
    } else if(buttonReleased == "btn-right"){
      motorRight = false;
      controlLeftRight(MOTOR_RIGHT, false);
    } 
  }
  else if (command == "alert-drowsy") {
    // Handle drowsiness alert
    Serial.println("ALERT: Driver drowsiness detected!");
    // Add any alert functionality here
  }
  else if (command == "connection-test") {
    Serial.println("Connection test received");
    client->text("status:Connection established");
  }
}

// Send data safely over WebSocket
void sendDataSafely(String data) {
  if (!clientConnected || ws.count() == 0) {
    return; // Don't send if no clients
  }
  
  // Limit send rate
  unsigned long currentTime = millis();
  if (currentTime - lastDataSent < MIN_SEND_INTERVAL) {
    return;
  }
  
  lastDataSent = currentTime;
  
  try {
    ws.textAll(data);
  } catch (...) {
    // Ignore errors if they occur
    Serial.println("Error sending data");
  }
}

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, 
                        AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
    client->text("status:Connected to ESP32 WebSocket!");
    clientConnected = true;
  } else if (type == WS_EVT_DATA) {
    handleWebSocketMessage(client, String((char*)data, len));
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    if (ws.count() == 0) {
      clientConnected = false;
    }
  } else if (type == WS_EVT_ERROR) {
    Serial.printf("WebSocket error %u: %s\n", client->id(), (char*)data);
  }
}

// HTML for the basic web interface
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE HTML><html>
<head>
  <title>ESP32 Web Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial; text-align: center; margin:0px auto; padding-top: 30px; }
    h1 { color: #0F3376; padding: 2vh; }
  </style>
</head>
<body>
  <h1>ESP32 Motor Control</h1>
  <p>Trang chính của WebSocket server. Sử dụng trang web ngoài để kết nối WebSocket.</p>
  <p>WebSocket Address: ws://[ESP32_IP]/ws</p>
</body>
</html>
)rawliteral";

void initWebServer() {
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/html", index_html);
  });
  
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
}

void setup() {
  Serial.begin(115200);
  
  initHardware();
  
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  initWebServer();
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  static unsigned long lastUpdate = 0;
  static float fps = 0.0;

  if (millis() - lastUpdate > UPDATE_INTERVAL) {
    lastUpdate = millis();
    
    if (clientConnected) {
      // Simulate a new frame from the camera only when clients are connected
      frameCount++;
      
      // Get FPS values on a 1-second cycle
      float currentFPS = calculateFPS();
      if (currentFPS > 0) {
        fps = currentFPS;
      }

      if (fps > 0) {
        String fpsData = "fps:" + String(fps);
        sendDataSafely(fpsData);
      }
    }
    
    ws.cleanupClients();
  }

  // Safety timeout - stop motors if no commands received recently
  if (millis() - state.lastMotorAction > MOTOR_TIMEOUT) {
    stopAllMotors();
  }
  
  // Small delay to prevent loop() from running too fast
  delay(10);
}
