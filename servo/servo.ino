#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESP32Servo.h>

// Hardware Configuration
#define SERVO_PIN         27
#define TRIG_PIN          12
#define ECHO_PIN          14
#define MOTOR_FORWARD     16
#define MOTOR_BACKWARD    17
#define MOTOR_LEFT        18
#define MOTOR_RIGHT       19
#define WS_AUTH_TOKEN     "SECURE_TOKEN_123"
#define UPDATE_INTERVAL   50  // ms
#define SERVO_SPEED       1   // degrees per update
#define MOTOR_TIMEOUT     250 // ms

// Define AP credentials
#define AP_SSID "ESP32_AP"
#define AP_PASSWORD "12345678"

// Global Objects
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
Servo radarServo;

// System State
typedef struct {
  int currentAngle = 90;
  int sweepDir = 1;
  unsigned long lastUpdate = 0;
  unsigned long lastMotorAction = 0;
  volatile unsigned long echoStart = 0;
  volatile unsigned long echoEnd = 0;
  bool measuring = false;
} SystemState;

SystemState state;

// Motor Control
void controlMotor(uint8_t pin, bool state) {
  Serial.print("hello");
  digitalWrite(pin, state ? HIGH : LOW);
  analogWrite(pin, state ? 200 : 0); // PWM speed control
}

void stopAllMotors() {
  controlMotor(MOTOR_FORWARD, false);
  controlMotor(MOTOR_BACKWARD, false);
  controlMotor(MOTOR_LEFT, false);
  controlMotor(MOTOR_RIGHT, false);
}

// Non-blocking Ultrasonic Measurement
void IRAM_ATTR echoISR() {
  if (digitalRead(ECHO_PIN)) {
    state.echoStart = micros();
  } else {
    state.echoEnd = micros();
    state.measuring = false;
  }
}

int calculateDistance() {
  if (state.measuring) return -1;
  
  state.measuring = true;
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  while(state.measuring) { delayMicroseconds(10); }
  
  return (state.echoEnd - state.echoStart) * 0.034 / 2;
}

// WebSocket Handlers
void handleWebSocketMessage(AsyncWebSocketClient *client, String message) {
  if (!message.startsWith(WS_AUTH_TOKEN)) {
    client->close(403, "Unauthorized");
    return;
  }

  String command = message.substring(message.indexOf(':')+1);
  Serial.print(command);
  state.lastMotorAction = millis();

  if (command == "btn-up") controlMotor(MOTOR_FORWARD, true);
  else if (command == "btn-down") controlMotor(MOTOR_BACKWARD, true);
  else if (command == "btn-left") controlMotor(MOTOR_LEFT, true);
  else if (command == "btn-right") controlMotor(MOTOR_RIGHT, true);
  else stopAllMotors();
}

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, 
                     AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    // Send a status message to the client
    Serial.printf("Client connected");
    client->text("status:Connected to ESP32 WebSocket!");
  } else if (type == WS_EVT_DATA) {
    handleWebSocketMessage(client, String((char*)data, len));
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("Client %u disconnected\n", client->id());
  }
}

// Servo Control
void updateRadarPosition() {
  if (millis() - state.lastUpdate < UPDATE_INTERVAL) return;
  
  state.currentAngle += state.sweepDir * SERVO_SPEED;
  if (state.currentAngle >= 180 || state.currentAngle <= 0) {
    state.sweepDir *= -1;
  }
  
  radarServo.write(state.currentAngle);
  state.lastUpdate = millis();
}

// System Initialization
void initHardware() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ECHO_PIN), echoISR, CHANGE);

  pinMode(MOTOR_FORWARD, OUTPUT);
  pinMode(MOTOR_BACKWARD, OUTPUT);
  pinMode(MOTOR_LEFT, OUTPUT);
  pinMode(MOTOR_RIGHT, OUTPUT);
  
  radarServo.attach(SERVO_PIN);
  radarServo.write(state.currentAngle);
}

// HTML content for the server
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
  <h1>Hello World</h1>
  <p>Welcome to ESP32 Web Server</p>
</body>
</html>
)rawliteral";

void initWebServer() {
  // Short delay to ensure WiFi is stable
  delay(500);
  
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    // Serve the HTML directly instead of using LittleFS
    request->send(200, "text/html", index_html);
  });
  
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
}

void setup() {
  Serial.begin(115200);
  initHardware();
  
  // Start WiFi as an Access Point
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  IPAddress IP = WiFi.softAPIP();
  Serial.println("Access Point started");
  Serial.print("AP IP address: ");
  Serial.println(IP);

  // initialize web server after AP is started
  initWebServer();
  server.begin();
  
  Serial.println("HTTP server started");
}

void loop() {
  // Autonomous servo control
  updateRadarPosition();
  
  // Motor safety timeout
  if (millis() - state.lastMotorAction > MOTOR_TIMEOUT) {
    stopAllMotors();
  }

  // Send sensor data
  static unsigned long lastBroadcast = 0;
  if (millis() - lastBroadcast >= 100) {
    int distance = calculateDistance();
    String data = String(state.currentAngle) + "," + String(distance);
    ws.textAll(data);
    lastBroadcast = millis();
  }

  ws.cleanupClients();
}