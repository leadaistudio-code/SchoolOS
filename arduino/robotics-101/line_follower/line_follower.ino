// Robotics 101, Lesson 12: line-follower
// Two IR sensors either side of a black line; an L298N drives two DC motors.
// Pins: left IR D2, right IR D3, ENA D5, ENB D6, IN1 D8, IN2 D9, IN3 D10, IN4 D11.

const int LEFT_IR = 2;
const int RIGHT_IR = 3;
const int ENA = 5;
const int IN1 = 8;
const int IN2 = 9;
const int ENB = 6;
const int IN3 = 10;
const int IN4 = 11;

// Calibrate in Lesson 9: the value a sensor reads over the black line.
const int ON_LINE = HIGH;

// Tune these in Lesson 12. Lower is easier to control; higher is faster.
const int BASE_SPEED = 150;  // straight driving (0 to 255)
const int TURN_SPEED = 40;   // inner wheel while turning; 0 or negative (e.g. -80) for sharp corners

// What to do when both sensors see black: STOP at a finish line,
// or keep going to cross a junction or a sharp corner.
const bool STOP_WHEN_BOTH = true;

void setup() {
  pinMode(LEFT_IR, INPUT);
  pinMode(RIGHT_IR, INPUT);
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  setMotors(0, 0);
  Serial.begin(9600);
  delay(2000);  // two seconds to put the robot on the track
}

void loop() {
  bool leftOnLine = digitalRead(LEFT_IR) == ON_LINE;
  bool rightOnLine = digitalRead(RIGHT_IR) == ON_LINE;

  if (!leftOnLine && !rightOnLine) {
    // Line between the sensors: go straight.
    setMotors(BASE_SPEED, BASE_SPEED);
  } else if (leftOnLine && !rightOnLine) {
    // Line under the left sensor: turn left by slowing the left wheel.
    setMotors(TURN_SPEED, BASE_SPEED);
  } else if (!leftOnLine && rightOnLine) {
    // Line under the right sensor: turn right by slowing the right wheel.
    setMotors(BASE_SPEED, TURN_SPEED);
  } else {
    // Both on black: a cross line or the finish.
    if (STOP_WHEN_BOTH) {
      setMotors(0, 0);
    } else {
      setMotors(BASE_SPEED, BASE_SPEED);
    }
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
