// Robotics 101, Lesson 9: read both IR sensors
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
