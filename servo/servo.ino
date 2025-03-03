#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "LittleFS.h"
#include <Arduino_JSON.h>
#include <ESP32Servo.h>

// WiFi credentials
const char* ssid = "Viet Bac"; // Replace with your WiFi SSID
const char* password = "!vietbac123"; // Replace with your WiFi password

// Define pins for motor DC
const int mainMotor_forward = 16;
const int mainMotor_backward = 17;
const int navigateMotor_left = 18;
const int navigateMotor_right = 19;

// Define pins for the ultrasonic sensor
const int trigPin = 12;
const int echoPin = 14;

// Create AsyncWebServer object on port 8081
AsyncWebServer server(8081);

// Create a WebSocket object
AsyncWebSocket ws("/ws");

// Json Variable to Hold Sensor Readings
JSONVar readings;

// Variables for ultrasonic sensor
long duration;
int distanceInCM;

// Create a Servo object
Servo radarServo;

// Timer variables
unsigned long lastTime = 0;
unsigned long timerDelay = 50; // 50ms delay for smooth servo movement

// Initialize LittleFS
void initLittleFS() {
  if (!LittleFS.begin(true)) {
    Serial.println("An error has occurred while mounting LittleFS");
    return;
  }
  Serial.println("LittleFS mounted successfully");
}

// Initialize WiFi
void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi ..");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(1000);
  }
  Serial.println("\nConnected to WiFi");
  Serial.println(WiFi.localIP());
}

// Function to measure distance using the ultrasonic sensor
int measureDistance() {
  // Clear the trigPin
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  // Trigger the ultrasonic pulse
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Measure the duration of the echo pulse
  duration = pulseIn(echoPin, HIGH);

  // Calculate the distance in centimeters
  int distance = duration * 0.034 / 2;

  // Return the measured distance
  return distance;
}

// Get Sensor Readings and return JSON object
String getSensorReadings(int angle, int distance) {
  readings["angle"] = angle;
  readings["distance"] = distance;
  String jsonString = JSON.stringify(readings);
  return jsonString;
}

// Notify WebSocket clients with the sensor readings
void notifyClients(String sensorReadings) {
  ws.textAll(sensorReadings);
}

// Car Motion Handlers
// void handleForward() {
//   digitalWrite(mainMotor_forward, HIGH);
//   Serial.println("Moving Forward");
// }

// void handleBackward() {
//   digitalWrite(mainMotor_backward, HIGH);
//   Serial.println("Moving Backward");
// }

// void handleStop() {
//   digitalWrite(mainMotor_forward, LOW);
//   digitalWrite(mainMotor_backward, LOW);
//   digitalWrite(navigateMotor_left, LOW);
//   digitalWrite(navigateMotor_right, LOW);
//   Serial.println("Stopping");
// }

// void handleLeft() {
//   digitalWrite(navigateMotor_left, HIGH);
//   Serial.println("Turning Left");
// }

// void handleRight() {
//   digitalWrite(navigateMotor_right, HIGH);
//   Serial.println("Turning Right");
// }

// WebSocket event handler
void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;
    // case WS_EVT_DATA: {
    //   String command = String((char*)data);
    //   Serial.println("Received command: " + command);

    //   if (command == "forward") {
    //     handleForward();
    //   } else if (command == "backward") {
    //     handleBackward();
    //   } else if (command == "left") {
    //     handleLeft();
    //   } else if (command == "right") {
    //     handleRight();
    //   } else if (command == "stop") {
    //     handleStop();
    //   }
    //   break;
    // }
    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      break;
  }
}

void initWebSocket() {
  ws.onEvent(onEvent);
  server.addHandler(&ws);
}

void setup() {
  // Set up ultrasonic sensor pins
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  // // Setup motor control pins
  // pinMode(mainMotor_forward, OUTPUT);
  // pinMode(mainMotor_backward, OUTPUT);
  // pinMode(navigateMotor_left, OUTPUT);
  // pinMode(navigateMotor_right, OUTPUT);

  // digitalWrite(mainMotor_forward, LOW);
  // digitalWrite(mainMotor_backward, LOW);
  // digitalWrite(navigateMotor_left, LOW);
  // digitalWrite(navigateMotor_right, LOW);

  // Start serial communication
  Serial.begin(115200);

  // Attach the servo to pin 27
  radarServo.attach(27);

  // Initialize WiFi, LittleFS, and WebSocket
  initWiFi();
  initLittleFS();
  initWebSocket();

  // Web Server Root URL
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(LittleFS, "/index.html", "text/html");
  });

  server.serveStatic("/", LittleFS, "/");

  // Start server
  server.begin();
}

void loop() {
  // Sweep the servo from 0 to 180 degrees
  for (int angle = 0; angle <= 180; angle++) {
    radarServo.write(angle); // Move servo to the current angle
    delay(50); // Small delay for smooth movement

    // Measure distance at the current angle
    distanceInCM = measureDistance();

    // Get sensor readings in JSON format
    String sensorReadings = getSensorReadings(angle, distanceInCM);

    // // Print the sensor readings to the Serial Monitor
    // Serial.println(sensorReadings);

    // Notify WebSocket clients with the sensor readings
    notifyClients(sensorReadings);
  }

  // Sweep the servo back from 180 to 0 degrees
  for (int angle = 180; angle >= 0; angle--) {
    radarServo.write(angle); // Move servo to the current angle
    delay(50); // Small delay for smooth movement

    // Measure distance at the current angle
    distanceInCM = measureDistance();

    // Get sensor readings in JSON format
    String sensorReadings = getSensorReadings(angle, distanceInCM);

    // // Print the sensor readings to the Serial Monitor
    // Serial.println(sensorReadings);

    // Notify WebSocket clients with the sensor readings
    notifyClients(sensorReadings);
  }

  // Clean up WebSocket clients
  ws.cleanupClients();
}