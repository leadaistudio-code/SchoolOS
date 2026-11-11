import { cp, type VideoDef } from '@/lib/lms/video/engine'
import { ROBOTICS_SERIES } from './narration'

export * from '@/lib/lms/video/engine'

/**
 * Robotics 101 instructional videos. Timing, captions and scripts come from the
 * shared engine in src/lib/lms/video; this file is the content.
 */

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 'v01',
    lessonSlug: 'r101-01-welcome',
    number: 1,
    title: 'Welcome to Robotics 101',
    summary: ['You will build a robot that follows a black line', 'Fifteen short lessons in four modules', 'No kit? The simulator covers every step'],
    next: 'Understanding robots: sense, think, act.',
    scenes: [
      { kind: 'title', kicker: 'Course introduction', title: 'Build a robot that follows a line', say: 'Hello and welcome! In this course you will build a small robot that can follow a black line on the floor, all by itself.', chapter: 'What you will build' },
      { kind: 'sim', title: 'This is our goal', track: 'oval', algorithm: { baseSpeed: 130, turnStyle: 'pivot' }, say: 'Here is the robot you will build, shown in our simulator. It has two eyes underneath that look at the floor. When the line bends, the robot turns to follow it. Nobody is steering it. The robot decides on its own.' },
      { kind: 'points', title: 'Line-followers in real life', items: ['Warehouse robots carrying parcels', 'Hospital robots delivering medicines', 'Factory carts moving car parts'], say: 'Robots like this are used in real life. Warehouse robots follow lines to carry parcels. Some hospitals use them to deliver medicines, and factories use them to move parts from one machine to the next.' },
      { kind: 'steps', title: 'Your journey', items: ['Meet your robot', 'How the robot works', 'Program the robot', 'Build, test and improve'], say: 'The course has four modules. First, you meet your robot. Next, you learn how its parts work. Then you write the program. Finally, you build it, test it and make it better.', chapter: 'How the course works' },
      { kind: 'points', title: 'Every lesson', items: ['Watch a short video', 'Try it in an activity or simulator', 'Check what you learned', 'Build and test'], say: 'Every lesson follows the same pattern. You watch a short video, try an activity or the simulator, check what you learned with a few questions, and then build and test.' },
      { kind: 'points', title: 'No robot kit? No problem', items: ['Every lesson works in the browser', 'Use the line-following simulator', 'Finish the course on the virtual pathway'], say: 'Do not worry if you do not have a robot kit yet. Every lesson works in your browser, and the simulator lets you test the same ideas. You can even complete the final challenge on the virtual pathway.' },
      { kind: 'points', title: 'Stay safe', items: ['Ask an adult before using batteries', 'Never short the battery wires', 'Unplug power before changing wires', 'Keep fingers away from spinning wheels'], say: 'Safety first. Always ask an adult before you use batteries. Never let the battery wires touch each other. Unplug the power before you change any wires, and keep your fingers away from the wheels when the motors are running.', chapter: 'Safety' },
      { kind: 'title', kicker: 'Ready?', title: 'Let us begin', say: 'By the end, you will have a working robot, a certificate, and six badges to collect along the way. Let us begin!' },
    ],
    checkpoints: [
      cp('v01-cp1', 5, 'You do not have a robot kit. Can you still do this course?', [
        ['Yes, using the simulator and the virtual pathway', true, 'Right. Every lesson works in the browser.'],
        ['No, you must buy a kit first', false, 'Not needed. The simulator lets you test the same ideas.'],
      ], 'The simulator and the virtual pathway let you finish without a kit. If you get a kit later, you can build the real robot too.'),
    ],
  },
  {
    id: 'v02',
    lessonSlug: 'r101-02-sense-think-act',
    number: 2,
    title: 'Understanding robots: sense, think, act',
    summary: ['Robots sense, think and act', 'Then they repeat, many times a second', 'Our robot: IR sensors, Arduino, motors'],
    next: 'Exploring the hardware in your kit.',
    scenes: [
      { kind: 'title', kicker: 'Big idea', title: 'What makes a machine a robot?', say: 'A fan spins and a toaster gets hot, but they are not robots. So what makes a machine a robot? Let us find out.', chapter: 'What is a robot?' },
      { kind: 'diagram', title: 'Sense, think, act', diagram: 'sense-think-act', steps: 4, say: 'Every robot does three things. First it senses: it collects information about the world. Then it thinks: a small computer decides what to do. Then it acts: it moves or makes something happen. And then it does it all again.' },
      { kind: 'points', title: 'You do this too', items: ['Sense: your eyes see a ball coming', 'Think: your brain decides to catch it', 'Act: your hands move to catch it'], say: 'You do this every day. When a friend throws you a ball, your eyes sense it, your brain thinks about where it will land, and your hands act to catch it.' },
      { kind: 'diagram', title: 'Our robot', diagram: 'sense-think-act', steps: 4, zoom: { x: 320, y: 170, scale: 1.12 }, say: 'Our line-follower works the same way. Its infrared sensors sense the floor. The Arduino board thinks and chooses a direction. The motors act and turn the wheels.', chapter: 'Our line-follower' },
      { kind: 'diagram', title: 'Again and again', diagram: 'loop', steps: 2, say: 'The robot repeats this loop very fast, hundreds of times every second. That is why it can react the moment the line bends.' },
      { kind: 'points', title: 'Robot or not?', items: ['Automatic door: senses you, decides, opens', 'Remote-control car: a person does the thinking', 'Smart washing machine: senses the load, chooses a cycle'], say: 'Try this. An automatic door senses you, decides, and opens, so it behaves like a robot. A remote-control car is different, because a person does the thinking for it.' },
    ],
    checkpoints: [
      cp('v02-cp1', 3, 'Which part of our robot does the thinking?', [
        ['The Arduino board', true, 'Yes. It reads the sensors and decides.'],
        ['The motors', false, 'Motors act. They do not decide anything.'],
        ['The IR sensors', false, 'Sensors sense. The Arduino decides.'],
      ], 'Sensors sense, the Arduino thinks, and the motors act.'),
    ],
  },
  {
    id: 'v03',
    lessonSlug: 'r101-03-kit',
    number: 3,
    title: 'Exploring the hardware',
    summary: ['Arduino Uno: the brain', 'Two IR sensors: the eyes', 'L298N and two motors: the muscles', 'Battery pack: the energy'],
    next: 'How an IR sensor sees the line.',
    scenes: [
      { kind: 'title', kicker: 'Your kit', title: 'Meet the parts', say: 'Let us open the kit and meet every part. Each one has a job, and you will learn all of them.', chapter: 'The brain' },
      { kind: 'parts', title: 'The brain', items: [{ name: 'Arduino Uno', job: 'Runs your program and makes decisions' }, { name: 'USB cable', job: 'Uploads the program from the computer' }], say: 'This is the Arduino Uno, the brain of the robot. It runs the program you write. The USB cable connects it to a computer so you can upload that program.' },
      { kind: 'parts', title: 'The eyes', items: [{ name: 'IR sensor module (×2)', job: 'Sees whether the floor below is black or white' }], say: 'These are the infrared sensor modules, the eyes of the robot. You need two of them, one on the left and one on the right. They tell the Arduino whether they see black or white.', chapter: 'Eyes and muscles' },
      { kind: 'parts', title: 'The muscles', items: [{ name: 'L298N motor driver', job: 'Gives the motors enough power' }, { name: 'DC gear motors (×2)', job: 'Turn the wheels' }, { name: 'Wheels and castor', job: 'Carry the robot smoothly' }], say: 'The L298N motor driver is like a strong helper. The Arduino is too weak to power motors directly, so the driver does it. The two motors turn the wheels, and a small castor wheel at the front keeps the robot balanced.' },
      { kind: 'parts', title: 'Energy and body', items: [{ name: 'Battery pack (7.4 V)', job: 'Powers the motors and the Arduino' }, { name: 'Switch', job: 'Turns the robot on and off safely' }, { name: 'Chassis', job: 'The body that holds everything' }, { name: 'Jumper wires', job: 'Connect the parts together' }], say: 'The battery pack gives energy, and the switch lets you turn everything off safely. The chassis is the body that holds all the parts, and jumper wires carry signals between them.', chapter: 'Energy and body' },
      { kind: 'diagram', title: 'How they connect', diagram: 'wiring', steps: 5, say: 'Here is how everything connects. Sensors send information to the Arduino. The Arduino sends commands to the motor driver. The driver powers the motors. You will wire this yourself in lesson seven.' },
    ],
    checkpoints: [
      cp('v03-cp1', 3, 'Why do we need the L298N motor driver?', [
        ['The Arduino cannot power motors by itself', true, 'Correct. The driver supplies the current the motors need.'],
        ['It stores the program', false, 'The program lives on the Arduino.'],
        ['It sees the line', false, 'That is the IR sensors.'],
      ], 'An Arduino pin gives only a tiny current. The L298N switches the battery power to the motors when the Arduino tells it to.'),
    ],
  },
  {
    id: 'v04',
    lessonSlug: 'r101-04-ir-sensors',
    number: 4,
    title: 'How an IR sensor sees the line',
    summary: ['White reflects infrared; black absorbs it', 'The module turns that into HIGH or LOW', 'Adjust the knob to calibrate'],
    next: 'How motors and the motor driver work.',
    scenes: [
      { kind: 'title', kicker: 'Sensors', title: 'Seeing without eyes', say: 'How can a robot see a black line? It uses invisible light called infrared. Your TV remote uses the same kind of light.', chapter: 'Infrared light' },
      { kind: 'diagram', title: 'Two tiny parts', diagram: 'ir-reflect', steps: 1, say: 'Each sensor module has two small parts. One is an infrared light, which shines down at the floor. The other is a receiver, which measures how much light bounces back.' },
      { kind: 'diagram', title: 'White reflects', diagram: 'ir-reflect', steps: 2, zoom: { x: 170, y: 200, scale: 1.25 }, say: 'Over a white floor, most of the light bounces back. The receiver sees a lot of light, so the sensor says: white.', chapter: 'White and black' },
      { kind: 'diagram', title: 'Black absorbs', diagram: 'ir-reflect', steps: 3, zoom: { x: 470, y: 200, scale: 1.25 }, say: 'Over a black line, the black surface soaks up most of the light. Very little comes back, so the sensor says: black.' },
      { kind: 'points', title: 'From light to a signal', items: ['A lot of light back → one signal', 'Very little light back → the other signal', 'Many modules: black = HIGH, white = LOW', 'Some modules are the other way round'], say: 'The module turns this into a simple digital signal, either HIGH or LOW. On many modules, black gives HIGH and white gives LOW. Some are the other way round, so you will test yours in lesson nine.', chapter: 'HIGH and LOW' },
      { kind: 'points', title: 'Calibrate it', items: ['Turn the small blue knob slowly', 'Watch the little LED on the module', 'Height above floor: about 5–10 mm'], say: 'Each module has a small blue knob. Turning it changes how much light counts as white. Hold the sensor about five to ten millimetres above the floor and turn the knob until the LED changes exactly when you cross the line.', chapter: 'Calibration' },
      { kind: 'sim', title: 'Two eyes, one line', track: 'straight', algorithm: { baseSpeed: 110 }, say: 'Our robot uses two sensors, one either side of the line. When both see white, the line is safely between them. Watch the sensor dots as the robot drives.' },
    ],
    checkpoints: [
      cp('v04-cp1', 3, 'What happens when the sensor is above a black surface?', [
        ['Most of the infrared light is absorbed, so little comes back', true, 'Exactly. Black soaks up infrared light.'],
        ['More light bounces back than from white', false, 'It is the opposite: white reflects more.'],
        ['The sensor turns off', false, 'It stays on. It just receives less light.'],
      ], 'Black absorbs infrared light, so the receiver gets very little back. The module compares that to the level you set with the knob and reports black.'),
    ],
  },
  {
    id: 'v05',
    lessonSlug: 'r101-05-motors',
    number: 5,
    title: 'How motors and the motor driver work',
    summary: ['IN pins set direction', 'EN pins set speed with PWM', 'Different wheel speeds steer the robot'],
    next: 'Building the robot body.',
    scenes: [
      { kind: 'title', kicker: 'Motors', title: 'Making the wheels move', say: 'Our robot has two motors, one for each wheel. Let us see how the Arduino controls their direction and speed.', chapter: 'Direction' },
      { kind: 'diagram', title: 'The H-bridge', diagram: 'h-bridge', steps: 1, say: 'Inside the L298N are switches arranged like the letter H. That is called an H-bridge. Two control pins decide which way the current flows through the motor.' },
      { kind: 'diagram', title: 'Flip the direction', diagram: 'h-bridge', steps: 2, say: 'If IN1 is HIGH and IN2 is LOW, the motor spins forward. Swap them, and it spins backward. If both are LOW, the motor stops.' },
      { kind: 'diagram', title: 'Speed with PWM', diagram: 'pwm', steps: 3, say: 'The enable pin sets the speed. The Arduino switches it on and off very fast. This is called PWM. On most of the time means fast. On only a little of the time means slow. Speed goes from 0 to 255.', chapter: 'Speed' },
      { kind: 'diagram', title: 'Steering with two wheels', diagram: 'differential', steps: 3, say: 'Our robot has no steering wheel. It turns by driving its wheels at different speeds. Both wheels the same speed: straight ahead. Left wheel slower: the robot curves left. Right wheel slower: it curves right.', chapter: 'Steering' },
      { kind: 'sim', title: 'Watch the wheel speeds', track: 'curve', algorithm: { baseSpeed: 120 }, say: 'Watch the left and right motor numbers on the panel. When the line curves, one wheel slows down and the robot turns towards the line.' },
    ],
    checkpoints: [
      cp('v05-cp1', 4, 'The left wheel is slower than the right wheel. Which way does the robot turn?', [
        ['Left', true, 'Yes. The robot curves towards the slower wheel.'],
        ['Right', false, 'The robot turns towards the slower side, which is left.'],
        ['It goes straight', false, 'Only equal speeds go straight.'],
      ], 'With differential drive, the robot always turns towards the slower wheel.'),
    ],
  },
  {
    id: 'v06',
    lessonSlug: 'r101-06-build-body',
    number: 6,
    title: 'Building the robot body',
    summary: ['Motors at the back, castor at the front', 'Sensors at the front, about 5–10 mm above the floor', 'Keep wires tidy and away from wheels'],
    next: 'Wiring the electronics safely.',
    scenes: [
      { kind: 'title', kicker: 'Build', title: 'Assemble the chassis', say: 'Time to build. Clear your table, keep the screws in a small bowl, and ask an adult to help with the screwdriver.', chapter: 'Get ready' },
      { kind: 'diagram', title: 'The plan', diagram: 'chassis', steps: 3, say: 'Here is the plan from above. The two motors go at the back. The castor goes at the front. The sensors sit at the very front, looking down.' },
      { kind: 'steps', title: 'Step by step', items: ['Fix both motors to the chassis with brackets', 'Push the wheels onto the motor shafts', 'Screw the castor wheel under the front', 'Mount the Arduino and the L298N on top', 'Fix the battery holder and the switch'], diagram: 'chassis', say: 'First fix both motors with their brackets. Push the wheels onto the shafts. Screw the castor under the front. Mount the Arduino and the motor driver on top, then fix the battery holder and the switch.', chapter: 'Assembly' },
      { kind: 'points', title: 'Mount the sensors', items: ['At the front, facing down', 'About 5–10 mm above the floor', 'Spaced a little wider than the line', 'Left sensor on the robot\'s left'], say: 'Mount the two sensors at the front, facing down, about five to ten millimetres above the floor. Space them a little wider than your black line, so the line fits between them.', chapter: 'Sensors' },
      { kind: 'sim', title: 'Why spacing matters', track: 'curve', algorithm: { baseSpeed: 120 }, say: 'If the sensors are too close together, both see the line at once. If they are too far apart, the robot wobbles before it notices a turn. A gap a little wider than the line works well.' },
      { kind: 'points', title: 'Check before wiring', items: ['Wheels spin freely, nothing rubs', 'Robot sits level on all three wheels', 'No loose screws', 'Battery switch is OFF'], say: 'Before you wire anything, check that the wheels spin freely, the robot sits level, nothing is loose, and the battery switch is off.' },
    ],
    checkpoints: [
      cp('v06-cp1', 3, 'Where should the IR sensors be mounted?', [
        ['At the front, facing down, close to the floor', true, 'Correct. They need to look at the line just ahead of the wheels.'],
        ['On top, facing up', false, 'They must see the floor, not the ceiling.'],
        ['At the back, behind the wheels', false, 'At the back, the robot would react too late.'],
      ], 'Front-mounted sensors see the line before the wheels reach it, which gives the robot time to turn.'),
    ],
  },
  {
    id: 'v07',
    lessonSlug: 'r101-07-electronics',
    number: 7,
    title: 'Wiring the electronics safely',
    summary: ['Sensors: OUT to D2 and D3', 'Driver: ENA D5, ENB D6, IN1–IN4 on D8–D11', 'All grounds connected together'],
    next: 'Your first Arduino program.',
    scenes: [
      { kind: 'title', kicker: 'Safety first', title: 'Wire it with the power off', say: 'Before you touch a single wire, switch the battery off. Ask an adult to check your wiring before you turn the power on.', chapter: 'Safety' },
      { kind: 'diagram', title: 'The pin map', diagram: 'pin-map', steps: 3, say: 'Here are the pins we use. The left sensor goes to pin 2 and the right sensor to pin 3. The motor driver uses pins 5 and 6 for speed, and pins 8, 9, 10 and 11 for direction.', chapter: 'Pin map' },
      { kind: 'diagram', title: 'Sensors', diagram: 'wiring', steps: 1, zoom: { x: 160, y: 180, scale: 1.2 }, say: 'Each sensor has three pins. VCC goes to 5 volts, GND goes to ground, and OUT goes to its Arduino pin: left to D2, right to D3.', chapter: 'Sensors' },
      { kind: 'diagram', title: 'Motor driver signals', diagram: 'wiring', steps: 3, say: 'Now the motor driver. ENA to D5 and ENB to D6. IN1 to D8, IN2 to D9, IN3 to D10 and IN4 to D11. Motor A is the left motor, and motor B is the right motor.', chapter: 'Motor driver' },
      { kind: 'diagram', title: 'Power', diagram: 'wiring', steps: 5, say: 'The battery goes to the motor driver through the switch: red to 12 volts, black to ground. Then connect the driver ground to the Arduino ground. All grounds must be joined, or the signals will not work.' },
      { kind: 'points', title: 'The adult check', items: ['Red and black battery wires are not swapped', 'No bare wires touching', 'Every ground is connected', 'Switch is OFF until the check is done'], say: 'Now ask an adult to check four things: the battery wires are the right way round, no bare wires touch, every ground is connected, and the switch stays off until the check is done.' },
    ],
    checkpoints: [
      cp('v07-cp1', 1, 'Which Arduino pin does the left IR sensor connect to?', [
        ['D2', true, 'Right: left sensor D2, right sensor D3.'],
        ['D5', false, 'D5 is ENA, the left motor speed.'],
        ['D8', false, 'D8 is IN1, a motor direction pin.'],
      ], 'Left IR → D2, right IR → D3. ENA D5, ENB D6, IN1–IN4 on D8–D11.'),
    ],
  },
  {
    id: 'v08',
    lessonSlug: 'r101-08-first-program',
    number: 8,
    title: 'Your first Arduino program',
    summary: ['setup() runs once; loop() runs forever', 'Every instruction ends with a semicolon', 'Verify, then upload'],
    next: 'Reading the IR sensors in code.',
    scenes: [
      { kind: 'title', kicker: 'Arduino IDE', title: 'Talking to your robot', say: 'Now you will write your first program. Programs for Arduino are called sketches. You write them in the Arduino IDE, which is free.', chapter: 'The Arduino IDE' },
      { kind: 'steps', title: 'Get ready', items: ['Install the Arduino IDE', 'Plug in the Arduino with the USB cable', 'Tools → Board → Arduino Uno', 'Tools → Port → the Arduino port'], say: 'Install the Arduino IDE and plug in the board with the USB cable. Under Tools, choose the board Arduino Uno, and then choose the port your Arduino is on.' },
      { kind: 'code', title: 'Two special parts', code: 'void setup() {\n  // runs once, when the robot starts\n}\n\nvoid loop() {\n  // runs again and again, forever\n}', highlight: [[1, 3], [5, 7]], say: 'Every sketch has two parts. setup runs once, when the robot switches on. loop runs again and again, forever. Remember sense, think, act? That happens inside loop.', chapter: 'setup and loop' },
      { kind: 'code', title: 'Blink the built-in light', code: 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}', highlight: [[2, 2], [6, 7], [8, 9]], say: 'Here is a tiny program. pinMode makes pin 13 an output. In the loop, we switch the light on, wait half a second, switch it off, and wait again. Every instruction ends with a semicolon.' },
      { kind: 'steps', title: 'Verify and upload', items: ['Click the tick to verify', 'Fix any red error messages', 'Click the arrow to upload', 'Watch the light blink'], say: 'Click the tick to check your code. If you see a red error, read it carefully: it is often a missing semicolon or bracket. Then click the arrow to upload, and watch the light blink.', chapter: 'Upload' },
    ],
    checkpoints: [
      cp('v08-cp1', 2, 'Which part of a sketch runs again and again?', [
        ['loop()', true, 'Yes. loop() repeats forever.'],
        ['setup()', false, 'setup() runs only once at the start.'],
      ], 'setup() runs once; loop() repeats for as long as the robot has power.'),
    ],
  },
  {
    id: 'v09',
    lessonSlug: 'r101-09-read-sensors',
    number: 9,
    title: 'Reading the IR sensors',
    summary: ['digitalRead() gives HIGH or LOW', 'The Serial Monitor shows what the robot sees', 'Set ON_LINE to match your sensors'],
    next: 'Controlling the motors in code.',
    scenes: [
      { kind: 'title', kicker: 'Sense', title: 'What does the robot see?', say: 'Before the robot can follow a line, we must be sure it can see the line. In this video, you will read both sensors and print what they see.', chapter: 'digitalRead' },
      { kind: 'code', title: 'Name the pins', code: 'const int LEFT_IR = 2;\nconst int RIGHT_IR = 3;\nconst int ON_LINE = HIGH;', highlight: [[1, 2], [3, 3]], say: 'First we give the pins names. LEFT_IR is pin 2 and RIGHT_IR is pin 3. ON_LINE says which value means black. For many sensors it is HIGH.' },
      { kind: 'code', title: 'Read and print', code: 'void loop() {\n  int left = digitalRead(LEFT_IR);\n  int right = digitalRead(RIGHT_IR);\n\n  Serial.print("Left: ");\n  Serial.print(left == ON_LINE ? "BLACK" : "WHITE");\n  Serial.print("   Right: ");\n  Serial.println(right == ON_LINE ? "BLACK" : "WHITE");\n\n  delay(200);\n}', highlight: [[2, 3], [5, 8], [10, 10]], say: 'digitalRead reads a pin and gives HIGH or LOW. Then we print BLACK or WHITE for each sensor. The short delay slows the printing down so you can read it.' },
      { kind: 'serial', title: 'Serial Monitor', lines: ['Left: WHITE   Right: WHITE', 'Left: WHITE   Right: WHITE', 'Left: BLACK   Right: WHITE', 'Left: BLACK   Right: WHITE', 'Left: WHITE   Right: WHITE', 'Left: WHITE   Right: BLACK'], say: 'Upload the sketch and open the Serial Monitor at 9600 baud. Slide the robot slowly across the line. You should see the left sensor say BLACK, then the right one.', chapter: 'Test it' },
      { kind: 'points', title: 'Wrong way round?', items: ['Black shows WHITE? Change ON_LINE to LOW', 'Always BLACK or always WHITE? Turn the knob', 'Nothing printed? Check the baud rate is 9600'], say: 'If black shows as WHITE, your module is the other way round: change ON_LINE to LOW. If a sensor never changes, adjust its knob. If nothing prints, check the baud rate.', chapter: 'Fix it' },
    ],
    checkpoints: [
      cp('v09-cp1', 3, 'Your sensor is over black tape but the Serial Monitor says WHITE. What is the simplest fix?', [
        ['Change ON_LINE to LOW', true, 'Yes. Your module reports black as LOW.'],
        ['Buy a new sensor', false, 'The sensor works. It just uses the opposite signal.'],
        ['Use a thicker line', false, 'Width is not the problem here.'],
      ], 'Modules differ. ON_LINE tells the program which value means black on your sensor.'),
    ],
  },
  {
    id: 'v10',
    lessonSlug: 'r101-10-control-motors',
    number: 10,
    title: 'Programming the motors',
    summary: ['setMotors(left, right) drives both wheels', 'Positive forward, negative backward, 0 stop', 'Test with the robot lifted off the table'],
    next: 'The line-following algorithm.',
    scenes: [
      { kind: 'title', kicker: 'Act', title: 'Make it move', say: 'Now let us make the robot move. Before you upload, lift the robot so the wheels are off the table. That way it cannot drive off the edge.', chapter: 'One motor' },
      { kind: 'code', title: 'Drive one motor', code: 'void driveOne(int enPin, int inA, int inB, int speed) {\n  if (speed > 0) {\n    digitalWrite(inA, HIGH);\n    digitalWrite(inB, LOW);\n  } else if (speed < 0) {\n    digitalWrite(inA, LOW);\n    digitalWrite(inB, HIGH);\n  } else {\n    digitalWrite(inA, LOW);\n    digitalWrite(inB, LOW);\n  }\n  analogWrite(enPin, constrain(abs(speed), 0, 255));\n}', highlight: [[2, 4], [5, 7], [8, 10], [12, 12]], say: 'This helper drives one motor. A positive speed sets the direction pins for forward. A negative speed reverses them. Zero stops the motor. analogWrite then sets the speed using PWM.' },
      { kind: 'code', title: 'Both wheels at once', code: 'void setMotors(int leftSpeed, int rightSpeed) {\n  driveOne(ENA, IN1, IN2, leftSpeed);\n  driveOne(ENB, IN3, IN4, rightSpeed);\n}', highlight: [[1, 1], [2, 2], [3, 3]], say: 'setMotors drives both wheels with one line of code. Motor A, on ENA, IN1 and IN2, is the left wheel. Motor B, on ENB, IN3 and IN4, is the right wheel.', chapter: 'Both motors' },
      { kind: 'diagram', title: 'Try these', diagram: 'differential', steps: 3, say: 'Try setMotors 150, 150 to go straight. Try 40, 150 to curve left. Try 150, 40 to curve right. And 0, 0 to stop.' },
      { kind: 'points', title: 'Wheel spinning backwards?', items: ['Swap that motor\'s two wires at the driver', 'Or swap its IN pins in the code', 'Test again, wheels lifted'], say: 'If a wheel spins backwards when it should go forward, swap that motor\'s two wires at the motor driver, then test again with the wheels lifted.', chapter: 'Fix direction' },
    ],
    checkpoints: [
      cp('v10-cp1', 3, 'Which command makes the robot curve to the right?', [
        ['setMotors(150, 40)', true, 'Yes. The right wheel is slower, so it curves right.'],
        ['setMotors(40, 150)', false, 'That slows the left wheel, so it curves left.'],
        ['setMotors(0, 0)', false, 'That stops both wheels.'],
      ], 'The robot turns towards the slower wheel. A slower right wheel means a right turn.'),
    ],
  },
  {
    id: 'v11',
    lessonSlug: 'r101-11-algorithm',
    number: 11,
    title: 'The line-following algorithm',
    summary: ['Four sensor cases, four actions', 'Turn towards the sensor that sees black', 'if / else if / else in code'],
    next: 'Uploading and testing on a real track.',
    scenes: [
      { kind: 'title', kicker: 'Think', title: 'Teach the robot to decide', say: 'An algorithm is a set of clear steps to solve a problem. Our robot needs one simple algorithm to follow the line.', chapter: 'Four cases' },
      { kind: 'truth', title: 'Four possible readings', say: 'Two sensors, each black or white, give only four cases. Both white: the line is between them, go straight. Left sees black: the line is going left, turn left. Right sees black: turn right. Both black: a cross line or the finish, so stop.' },
      { kind: 'diagram', title: 'As a flowchart', diagram: 'flowchart', steps: 4, say: 'Here is the same idea as a flowchart. Read the sensors, check the cases one by one, set the motors, and go back to the start.' },
      { kind: 'code', title: 'In code', code: 'if (!leftOnLine && !rightOnLine) {\n  setMotors(BASE_SPEED, BASE_SPEED);\n} else if (leftOnLine && !rightOnLine) {\n  setMotors(TURN_SPEED, BASE_SPEED);\n} else if (!leftOnLine && rightOnLine) {\n  setMotors(BASE_SPEED, TURN_SPEED);\n} else {\n  setMotors(0, 0);\n}', highlight: [[1, 2], [3, 4], [5, 6], [7, 9]], say: 'In code, we use if, else if and else. Each block matches one row of the table. Turning left means slowing the left wheel to TURN_SPEED.', chapter: 'The code' },
      { kind: 'sim', title: 'The algorithm in action', track: 's-curve', algorithm: { baseSpeed: 120 }, say: 'Here is the algorithm running in the simulator on an S-shaped track. Watch the decision panel switch between forward, left and right.', chapter: 'Watch it work' },
      { kind: 'sim', title: 'Rules swapped by mistake', track: 'curve', algorithm: { baseSpeed: 120, swapped: true }, say: 'Now watch what happens if the left and right rules are swapped by mistake. The robot turns away from the line and gets lost. This is a very common bug.' },
    ],
    checkpoints: [
      cp('v11-cp1', 1, 'The right sensor sees black and the left sees white. What should the robot do?', [
        ['Turn right', true, 'Yes. Turn towards the sensor that sees black.'],
        ['Turn left', false, 'That would steer away from the line.'],
        ['Stop', false, 'Stop is for both sensors on black.'],
      ], 'The line has moved under the right sensor, so the robot turns right to bring it back between the sensors.'),
    ],
  },
  {
    id: 'v12',
    lessonSlug: 'r101-12-make-it-follow',
    number: 12,
    title: 'Uploading and testing',
    summary: ['Make a safe test track', 'Start slow, then tune BASE_SPEED and TURN_SPEED', 'Change one thing at a time'],
    next: 'Troubleshooting your robot.',
    scenes: [
      { kind: 'title', kicker: 'Test', title: 'The big moment', say: 'This is the big moment: your robot follows a real line. Let us make a good track first.', chapter: 'Make a track' },
      { kind: 'points', title: 'A good test track', items: ['Black electrical tape, about 2 cm wide', 'On a white chart sheet or light floor', 'Start with gentle curves', 'Keep it away from table edges'], say: 'Use black electrical tape about two centimetres wide on white chart paper or a light floor. Start with gentle curves, and keep the track away from table edges.' },
      { kind: 'steps', title: 'Upload and run', items: ['Upload line_follower.ino with the USB cable', 'Unplug USB, switch the battery ON', 'Place the robot with the line between the sensors', 'Wait two seconds: it starts by itself'], say: 'Upload the line-follower sketch. Unplug the USB cable and switch the battery on. Place the robot with the line between the sensors. After two seconds it starts by itself.', chapter: 'Run it' },
      { kind: 'sim', title: 'Too fast for sharp corners', track: 'sharp', algorithm: { baseSpeed: 150, turnStyle: 'gentle' }, say: 'On sharp corners, a gentle turn may not be enough. The robot runs off the corner. Watch what happens.', chapter: 'Tune it' },
      { kind: 'sim', title: 'Pivot turns fix it', track: 'sharp', algorithm: { baseSpeed: 110, turnStyle: 'pivot' }, say: 'Now we set TURN_SPEED to minus 80, so the inner wheel spins backwards. The robot pivots around the corner and stays on the line.' },
      { kind: 'points', title: 'Tuning rules', items: ['Change one value at a time', 'Lower BASE_SPEED if it overshoots', 'Lower TURN_SPEED (even negative) for sharp corners', 'Write down what you changed'], say: 'When tuning, change one value at a time and write it down. If the robot overshoots, lower BASE_SPEED. If it misses sharp corners, lower TURN_SPEED, even below zero.' },
    ],
    checkpoints: [
      cp('v12-cp1', 3, 'Your robot runs off sharp corners. What should you try first?', [
        ['Lower TURN_SPEED, even to a negative value', true, 'Yes. A slower or reversing inner wheel turns more sharply.'],
        ['Raise BASE_SPEED', false, 'Faster usually makes corners harder.'],
        ['Remove one sensor', false, 'The robot needs both sensors.'],
      ], 'A lower or negative TURN_SPEED makes the robot pivot, which tightens its turns.'),
    ],
  },
  {
    id: 'v13',
    lessonSlug: 'r101-13-troubleshooting',
    number: 13,
    title: 'Troubleshooting like an engineer',
    summary: ['Observe, guess, test one change, repeat', 'Most problems: wiring, calibration, or speed', 'Use the Serial Monitor to see what the robot sees'],
    next: 'The final challenge.',
    scenes: [
      { kind: 'title', kicker: 'Improve', title: 'Every robot needs fixing', say: 'Real engineers spend a lot of time fixing things. That is normal. Here is how to troubleshoot like an engineer.', chapter: 'The method' },
      { kind: 'steps', title: 'The engineer\'s method', items: ['Observe: what exactly happens?', 'Guess the cause', 'Change one thing', 'Test again and record it'], say: 'First observe carefully: what exactly happens? Then make a guess about the cause. Change only one thing, test again, and write down what happened.' },
      { kind: 'points', title: 'Robot does nothing', items: ['Is the battery charged and switched on?', 'Are all grounds connected?', 'Did the upload finish without errors?'], say: 'If the robot does nothing at all, check the battery and the switch, check that every ground is connected, and make sure the upload finished without errors.', chapter: 'Common problems' },
      { kind: 'points', title: 'Spins in circles', items: ['One motor is wired backwards', 'Swap that motor\'s two wires', 'Test each wheel with motor_test.ino'], say: 'If the robot spins in circles, one motor is probably wired backwards. Swap that motor\'s two wires and test each wheel with the motor test sketch.' },
      { kind: 'sim', title: 'Turns away from the line', track: 'curve', algorithm: { baseSpeed: 120, swapped: true }, say: 'If the robot turns away from the line, the left and right sensors or rules are swapped. Swap the sensor wires on D2 and D3, or swap the two turning rules in the code.' },
      { kind: 'sim', title: 'Stops for no reason', track: 'curve', settings: { sensitivity: 0.95 }, algorithm: { baseSpeed: 120 }, say: 'If the robot stops on a plain curve, both sensors may think they see black. They are too sensitive. Turn the knobs until white reads as white, then test again.' },
      { kind: 'serial', title: 'Ask the robot', lines: ['Left: BLACK   Right: BLACK', 'Left: BLACK   Right: BLACK', 'Left: BLACK   Right: BLACK'], say: 'The Serial Monitor is your best friend. If both sensors say BLACK over white paper, you have found the problem: calibration.', chapter: 'Use the Serial Monitor' },
    ],
    checkpoints: [
      cp('v13-cp1', 4, 'The robot always turns away from the line. What is the most likely cause?', [
        ['Left and right are swapped', true, 'Yes. Swap the sensor wires or the turning rules.'],
        ['The battery is full', false, 'A full battery is good.'],
        ['The line is too straight', false, 'Straight lines are the easiest.'],
      ], 'Turning away from the line means the robot thinks left is right. Swap the sensor wires on D2/D3 or the two turning rules.'),
    ],
  },
  {
    id: 'v14',
    lessonSlug: 'r101-14-final-challenge',
    number: 14,
    title: 'The final challenge',
    summary: ['Complete the track from start to finish', 'Hand in a photo, your code and a video, or use the simulator', 'Your teacher reviews it'],
    next: 'The final assessment, then your certificate.',
    scenes: [
      { kind: 'title', kicker: 'Demonstrate', title: 'Show what your robot can do', say: 'You have built it, programmed it and tuned it. Now it is time to show what your robot can do.', chapter: 'The challenge' },
      { kind: 'points', title: 'The challenge track', items: ['Start square, then gentle curves', 'An S-bend', 'At least one sharp corner', 'A finish line across the track'], say: 'Your challenge track has a start, some gentle curves, an S-bend, at least one sharp corner, and a black finish line across the track where the robot should stop.' },
      { kind: 'sim', title: 'A full run', track: 's-curve', algorithm: { baseSpeed: 160, turnStyle: 'pivot' }, say: 'Here is a full run in the simulator with pivot turns. Smooth, steady, and on the line all the way to the end.' },
      { kind: 'steps', title: 'Three ways to hand it in', items: ['Built it: photo, code and a video link', 'Teacher watched it run in class', 'No kit: finish the S-curve and sharp-turn tracks in the simulator'], say: 'There are three ways to hand in your project. If you built it, add a photo, your code and a video link. If your teacher watched it run, choose that option. If you have no kit, finish the S-curve and sharp-turns tracks in the simulator.', chapter: 'Hand it in' },
      { kind: 'points', title: 'How it is judged', items: ['Follows the line from start to finish', 'Handles curves and a sharp corner', 'Clean, commented code', 'You explain one problem you fixed'], say: 'Your teacher looks at four things. Does it follow the line to the end? Does it handle the curves and the corner? Is your code clean? And can you explain one problem you fixed?' },
      { kind: 'title', kicker: 'Well done', title: 'You are a robot engineer', say: 'After your teacher approves it, take the final assessment to earn your certificate and the Line-Follower Champion badge. Well done, engineer!' },
    ],
    checkpoints: [
      cp('v14-cp1', 3, 'You do not have a kit. How can you hand in the final challenge?', [
        ['Finish the S-curve and sharp-turns tracks in the simulator', true, 'Yes. Your simulator results are recorded as evidence.'],
        ['You cannot', false, 'The virtual pathway is there for exactly this.'],
      ], 'The virtual pathway records your finished simulator runs as evidence for your teacher.'),
    ],
  },
]

export const VIDEOS: VideoDef[] = RAW.map((v) => ({ ...v, series: ROBOTICS_SERIES }))

/** Lessons refer to videos as `r101-v04`; the files are named `v04`. */
export function videoById(id: string | undefined) {
  const key = id?.replace(/^r101-/, '')
  return key ? VIDEOS.find((v) => v.id === key) : undefined
}
