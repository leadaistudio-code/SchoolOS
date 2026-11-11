/**
 * Robotics 101 reference sketches (Arduino Uno + L298N + two IR modules).
 * The single source for the code lab, the lesson downloads and the files in
 * arduino/robotics-101/, which `scripts/robotics101-sketches.ts` writes and
 * compiles with arduino-cli.
 *
 * Pin map: left IR D2, right IR D3, ENA D5, ENB D6, IN1 D8, IN2 D9, IN3 D10,
 * IN4 D11. Motor A (ENA, IN1, IN2) is the left motor; motor B is the right.
 */

export const PIN_MAP = [
  { signal: 'Left IR sensor OUT', pin: 'D2', name: 'LEFT_IR', note: 'Digital input' },
  { signal: 'Right IR sensor OUT', pin: 'D3', name: 'RIGHT_IR', note: 'Digital input' },
  { signal: 'L298N ENA (left motor speed)', pin: 'D5', name: 'ENA', note: 'PWM output (~)' },
  { signal: 'L298N ENB (right motor speed)', pin: 'D6', name: 'ENB', note: 'PWM output (~)' },
  { signal: 'L298N IN1 (left motor direction)', pin: 'D8', name: 'IN1', note: 'Digital output' },
  { signal: 'L298N IN2 (left motor direction)', pin: 'D9', name: 'IN2', note: 'Digital output' },
  { signal: 'L298N IN3 (right motor direction)', pin: 'D10', name: 'IN3', note: 'Digital output' },
  { signal: 'L298N IN4 (right motor direction)', pin: 'D11', name: 'IN4', note: 'Digital output' },
] as const

export const FIRST_PROGRAM = `// Robotics 101, Lesson 8: your first Arduino program
// Blinks the built-in LED and says hello on the Serial Monitor.
// Board: Arduino Uno. Nothing else needs to be connected.

int blinkCount = 0;          // a variable: a named box that holds a number

void setup() {
  // setup() runs once, when the board powers on or resets.
  pinMode(LED_BUILTIN, OUTPUT);   // pin 13 has a small LED on the board
  Serial.begin(9600);             // open the Serial Monitor at 9600 baud
  Serial.println("Hello! My robot brain is awake.");
}

void loop() {
  // loop() runs again and again, forever.
  digitalWrite(LED_BUILTIN, HIGH);  // LED on
  delay(500);                       // wait half a second (500 milliseconds)
  digitalWrite(LED_BUILTIN, LOW);   // LED off
  delay(500);

  blinkCount = blinkCount + 1;
  Serial.print("Blinks so far: ");
  Serial.println(blinkCount);
}
`

export const SENSOR_TEST = `// Robotics 101, Lesson 9: read both IR sensors
// Prints what each sensor sees on the Serial Monitor (9600 baud).
// Wiring: left IR OUT -> D2, right IR OUT -> D3, both VCC -> 5V, both GND -> GND.

const int LEFT_IR = 2;
const int RIGHT_IR = 3;

// Many IR modules output HIGH over black and LOW over white, but some are the
// other way round. Hold each sensor over your black tape: if the Serial Monitor
// says WHITE, change this to LOW.
const int ON_LINE = HIGH;

void setup() {
  pinMode(LEFT_IR, INPUT);
  pinMode(RIGHT_IR, INPUT);
  Serial.begin(9600);
  Serial.println("IR sensor test. Move the robot over the line.");
}

void loop() {
  int left = digitalRead(LEFT_IR);
  int right = digitalRead(RIGHT_IR);

  Serial.print("Left: ");
  Serial.print(left == ON_LINE ? "BLACK" : "WHITE");
  Serial.print("   Right: ");
  Serial.println(right == ON_LINE ? "BLACK" : "WHITE");

  delay(200);  // slow enough to read
}
`

export const MOTOR_TEST = `// Robotics 101, Lesson 10: test both motors
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
`

export const LINE_FOLLOWER = `// Robotics 101, Lesson 12: line-follower
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
`

export const SKETCHES = [
  { name: 'first_program', title: 'First program (blink and Serial)', lesson: 8, code: FIRST_PROGRAM },
  { name: 'ir_sensor_test', title: 'IR sensor test', lesson: 9, code: SENSOR_TEST },
  { name: 'motor_test', title: 'Motor test', lesson: 10, code: MOTOR_TEST },
  { name: 'line_follower', title: 'Line-follower', lesson: 12, code: LINE_FOLLOWER },
] as const
