// Robotics 101, Lesson 8: your first Arduino program
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
