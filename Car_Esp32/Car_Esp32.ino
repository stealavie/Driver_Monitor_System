#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "skibidi";
const char* password = "!!!!!!!!";

WebServer server(8081);

// Define motor control pins for L298N
const int mainMotor_forward = 18;
const int mainMotor_backward = 19;
const int navigateMotor_left = 16;
const int navigateMotor_right = 17;

void handleForward() {
  digitalWrite(mainMotor_forward, HIGH);
  server.send(200, "text/plain", "Forward");
}


void handleBackward() {
  digitalWrite(mainMotor_backward, HIGH);
  server.send(200, "text/plain", "Backward");
}

void handleStop() {
  digitalWrite(mainMotor_forward, LOW);
  digitalWrite(mainMotor_backward, LOW);
  digitalWrite(navigateMotor_left, LOW);
  digitalWrite(navigateMotor_right, LOW);
  server.send(200, "text/plain", "Stop");
}

void handleLeft() {
  digitalWrite(navigateMotor_left, HIGH);
  server.send(200, "text/plain", "Left");
}

void handleRight() {
  digitalWrite(navigateMotor_right, HIGH);
  server.send(200, "text/plain", "Right");
}

void setup() {
  Serial.begin(9600);
  // Setup motor control pins
  pinMode(mainMotor_forward, OUTPUT);
  pinMode(mainMotor_backward, OUTPUT);
  pinMode(navigateMotor_left, OUTPUT);
  pinMode(navigateMotor_right, OUTPUT);

  digitalWrite(mainMotor_forward, LOW);
  digitalWrite(mainMotor_backward, LOW);
  digitalWrite(navigateMotor_left, LOW);
  digitalWrite(navigateMotor_right, LOW);

  // Start WiFi in AP mode
  WiFi.softAP(ssid, password);
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // Define endpoints
  server.on("/forward", handleForward);
  server.on("/stop", handleStop);
  server.on("/backward", handleBackward);
  server.on("/left", handleLeft);
  server.on("/right", handleRight);
  
  server.begin();
}

void loop() {
  server.handleClient();
}
