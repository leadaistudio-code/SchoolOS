// Robotics 101, Lesson 10: test both motors
// Runs a short, safe pattern: forward, stop, left, stop, right, stop, then waits.
// Put the robot on a stand or hold it with the wheels off the table first.
// Wiring (L298N): ENA D5, IN1 D8, IN2 D9 (left motor); ENB D6, IN3 D10, IN4 D11 (right motor).

const int ENA = 5;   // left motor speed (PWM)
const int IN1 = 8;
const int IN2 = 9;
const int ENB = 6;   // right motor speed (PWM)
const int IN3 = 10;
const int IN4 = 11;

const int SPEED = 150;  // 0 (stopped) to 255 (full speed)

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  stopMotors();
  Serial.begin(9600);
  Serial.println("Motor test starts in 3 seconds. Wheels off the table!");
  delay(3000);
}

void loop() {
  Serial.println("Forward");
  setMotors(SPEED, SPEED);
  delay(1000);
  stopMotors();
  delay(800);

  Serial.println("Turn left (right wheel only)");
  setMotors(0, SPEED);
  delay(800);
  stopMotors();
  delay(800);

  Serial.println("Turn right (left wheel only)");
  setMotors(SPEED, 0);
  delay(800);
  stopMotors();

  Serial.println("Done. Press RESET to run again.");
  while (true) {
    // stay stopped
  }
}

// Positive speed: forward. Negative: backward. 0: stop.
void setMotors(int leftSpeed, int rightSpeed) {
  driveOne(ENA, IN1, IN2, leftSpeed);
  driveOne(ENB, IN3, IN4, rightSpeed);
}

void driveOne(int enPin, int inA, int inB, int speed) {
  if (speed > 0) {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, LOW);
  } else if (speed < 0) {
    digitalWrite(inA, LOW);
    digitalWrite(inB, HIGH);
  } else {
    digitalWrite(inA, LOW);
    digitalWrite(inB, LOW);
  }
  analogWrite(enPin, constrain(abs(speed), 0, 255));
}

void stopMotors() {
  setMotors(0, 0);
}
