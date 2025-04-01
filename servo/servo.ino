#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESP32Servo.h>

// Hardware Configuration
#define TRIG_PIN          2
#define ECHO_PIN          4
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

int servoPin = 5;

struct SystemState {
  unsigned long echoStart = 0;
  unsigned long echoEnd = 0;
  bool measuring = false;
  unsigned long lastMotorAction = 0;
};
SystemState state;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
Servo radarServo;

// Motor Control
void controlMotor(uint8_t pin, bool stateVal) {
  digitalWrite(pin, stateVal ? HIGH : LOW);
}

void stopAllMotors() {
  controlMotor(MOTOR_FORWARD, false);
  controlMotor(MOTOR_BACKWARD, false);
  controlMotor(MOTOR_LEFT, false);
  controlMotor(MOTOR_RIGHT, false);
}

int calculateDistance() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    if (duration == 0) return -1; // No echo received
    return duration / 2 / 29.412;
}

// WebSocket Handlers
void handleWebSocketMessage(AsyncWebSocketClient *client, String message) {
  if (!message.startsWith(WS_AUTH_TOKEN)) {
    client->close(403, "Unauthorized");
    return;
  }

  String command = message.substring(message.indexOf(':')+1);
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
    Serial.println("Client connected");
    client->text("status:Connected to ESP32 WebSocket!");
  } else if (type == WS_EVT_DATA) {
    handleWebSocketMessage(client, String((char*)data, len));
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("Client %u disconnected\n", client->id());
  }
}

void initHardware() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(MOTOR_FORWARD, OUTPUT);
  pinMode(MOTOR_BACKWARD, OUTPUT);
  pinMode(MOTOR_LEFT, OUTPUT);
  pinMode(MOTOR_RIGHT, OUTPUT);
  stopAllMotors();
  
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  radarServo.setPeriodHertz(50);
  radarServo.attach(servoPin, 1000, 2000);
}

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
  static int servoPos = 0;
  static bool increasing = true;
  static unsigned long lastUpdate = 0;

  if (millis() - lastUpdate > UPDATE_INTERVAL) {
    lastUpdate = millis();
    radarServo.write(servoPos);

    int distance = calculateDistance();
    String data = String(servoPos) + "," + String(distance);
    Serial.println(data);
    ws.textAll(data);
    ws.cleanupClients();

    if (increasing) {
      servoPos++;
      if (servoPos >= 180) increasing = false;
    } else {
      servoPos--;
      if (servoPos <= 0) increasing = true;
    }
  }

  if (millis() - state.lastMotorAction > MOTOR_TIMEOUT) {
    stopAllMotors();
  }
}
