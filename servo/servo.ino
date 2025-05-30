#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// Hardware Configuration - CORRECTED GPIOs
#define MOTOR_LEFT        16
#define MOTOR_RIGHT       17
#define MOTOR_BACKWARD    19
#define MOTOR_FORWARD     18
#define ENA_PIN           26  
#define ENB_PIN           25
#define WS_AUTH_TOKEN     "SECURE_TOKEN_123"
#define MOTOR_TIMEOUT     1000  // ms

// Motor speed settings
#define DEFAULT_ENA_SPEED 150
#define SPORT_ENA_SPEED   200
#define DEFAULT_ENB_SPEED 80

// AP credentials
#define AP_SSID "ESP32_AP"
#define AP_PASSWORD "12345678"

#define STEERING_PULSE_MS 100  

// Motor control variables
int enaSpeed = DEFAULT_ENA_SPEED;
int enbSpeed = DEFAULT_ENB_SPEED;
bool sportModeEnabled = false;

// Motor states
bool motorForward = false;
bool motorBackward = false;
bool motorLeft = false;
bool motorRight = false;

unsigned long steeringPulseEndTime = 0;
bool steeringPulseActive = false;
int activePulsePin = 0;

struct SystemState {
  unsigned long lastMotorAction = 0;
};
SystemState state;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void initHardware() {
  pinMode(MOTOR_FORWARD, OUTPUT);
  pinMode(MOTOR_BACKWARD, OUTPUT);
  pinMode(MOTOR_LEFT, OUTPUT);
  pinMode(MOTOR_RIGHT, OUTPUT);
  pinMode(ENA_PIN, OUTPUT);
  pinMode(ENB_PIN, OUTPUT);

  analogWrite(ENA_PIN, 0);
  analogWrite(ENB_PIN, 0);
}

void controlMotor(uint8_t pin, bool state, bool isVertical) {
  digitalWrite(pin, state);
  analogWrite(isVertical ? ENA_PIN : ENB_PIN, state ? (isVertical ? enaSpeed : enbSpeed) : 0);
}

void stopAllMotors() {
  digitalWrite(MOTOR_FORWARD, LOW);
  digitalWrite(MOTOR_BACKWARD, LOW);
  digitalWrite(MOTOR_LEFT, LOW);
  digitalWrite(MOTOR_RIGHT, LOW);
  analogWrite(ENA_PIN, 0);
  analogWrite(ENB_PIN, 0);
  
  motorForward = motorBackward = motorLeft = motorRight = false;
}

void setDrivingMode(bool sportMode) {
  sportModeEnabled = sportMode;
  enaSpeed = sportMode ? SPORT_ENA_SPEED : DEFAULT_ENA_SPEED;
  
  if (motorForward || motorBackward) {
    analogWrite(ENA_PIN, enaSpeed);
  }
}

void handleWebSocketMessage(AsyncWebSocketClient *client, String message) {
  if (!message.startsWith(WS_AUTH_TOKEN)) {
    client->close(403, "Unauthorized");
    return;
  }

  String command = message.substring(message.indexOf('-')+1);
  state.lastMotorAction = millis();

  // Handle commands
  if(command.startsWith("driving mode: ")) {
    String mode = command.substring(13);
    if (mode == "sport") {
      setDrivingMode(true);
    } else if (mode == "normal") {
      setDrivingMode(false);
    }
  }
  else if (command.startsWith("Pressed: ")) {
  String btn = command.substring(9);
  if (btn == "btn-up" && !motorForward) {
    motorForward = true;
    controlMotor(MOTOR_FORWARD, true, true);
  } else if (btn == "btn-down" && !motorBackward) {
    motorBackward = true;
    controlMotor(MOTOR_BACKWARD, true, true);
  } else if ((btn == "btn-left" || btn == "btn-right") && !steeringPulseActive) {
    int pin = (btn == "btn-left") ? MOTOR_LEFT : MOTOR_RIGHT;
    Serial.println(btn);
    controlMotor(pin, true, false);
    activePulsePin = pin;
    steeringPulseActive = true;
    steeringPulseEndTime = millis() + STEERING_PULSE_MS;
  }
}
  else if (command.startsWith("Released: ")) {
    String btn = command.substring(10);
    if (btn == "btn-up") {
      motorForward = false;
      controlMotor(MOTOR_FORWARD, false, true);
    } else if (btn == "btn-down") {
      motorBackward = false;
      controlMotor(MOTOR_BACKWARD, false, true);
    }
  }
}

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, 
                     AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("Client %u connected\n", client->id());
  } else if (type == WS_EVT_DATA) {
    handleWebSocketMessage(client, String((char*)data, len));
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("Client %u disconnected\n", client->id());
    stopAllMotors();
  }
}

void setup() {
  Serial.begin(115200);
  initHardware();
  
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/html", R"(<html><body>
      <h1>Motor Control</h1>
      <p>Use WebSocket client to control</p>
    </body></html>)");
  });
  
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();
}

void loop() {
  // Check if we need to end a steering pulse
  if (steeringPulseActive && millis() >= steeringPulseEndTime) {
    controlMotor(activePulsePin, false, false);
    steeringPulseActive = false;
  }

  if (millis() - state.lastMotorAction > MOTOR_TIMEOUT) {
    stopAllMotors();
  }
  delay(10);
}