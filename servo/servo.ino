#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
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

// Global Objects
AsyncWebServer server(8081);
AsyncWebSocket ws("/ws");
Servo radarServo;
WiFiManager wm;

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
  Serial.println("hello");
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
  state.lastMotorAction = millis();

  if (command == "forward") controlMotor(MOTOR_FORWARD, true);
  else if (command == "backward") controlMotor(MOTOR_BACKWARD, true);
  else if (command == "left") controlMotor(MOTOR_LEFT, true);
  else if (command == "right") controlMotor(MOTOR_RIGHT, true);
  else stopAllMotors();
}

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, 
                     AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_DATA) {
    handleWebSocketMessage(client, String((char*)data, len));
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

void initWebServer() {
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(LittleFS, "/index.html", "text/html");
  });
  
  server.serveStatic("/", LittleFS, "/")
    .setCacheControl("max-age=604800");
  
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
}

void setup() {
  Serial.begin(115200);
  LittleFS.begin(true);
  initHardware();
  
  wm.setConnectTimeout(180);
  wm.resetSettings();
  if (!wm.autoConnect("CarControllerAP")) {
    ESP.restart();
  }

  // Print network information
  if (WiFi.getMode() & WIFI_AP) {
    Serial.print("Configuration Portal IP: ");
    Serial.println(WiFi.softAPIP());
  }
  else {
    Serial.print("Connected to WiFi. Local IP: ");
    Serial.println(WiFi.localIP());
  }

  Serial.print("WebSocket Server URL: ws://");
  Serial.print(WiFi.getMode() & WIFI_AP ? WiFi.softAPIP() : WiFi.localIP());
  Serial.println("/ws");

  initWebServer();
  server.begin();
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