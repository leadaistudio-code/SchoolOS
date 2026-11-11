import { FIRST_PROGRAM, MOTOR_TEST, SENSOR_TEST } from '@/lib/lms/robotics101-sketches'
import type { ModuleDef } from './types'

export const MODULE_3: ModuleDef = {
  key: 'm3',
  title: 'Program the robot',
  summary: 'Write Arduino programs that read the sensors, drive the motors and follow the line.',
  lessons: [
    {
      slug: 'r101-08-first-program',
      title: 'Your first Arduino program',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'r101-v08',
      content: {
        version: 1,
        stage: 'practise',
        intro:
          'An Arduino program is called a sketch. Every sketch has two parts: setup(), which runs once, and loop(), which runs forever. Here is how to write, upload and run your first one.',
        objectives: [
          'Explain what setup() and loop() do',
          'Use a variable to store a number',
          'Use pinMode, digitalWrite, delay and Serial.println',
          'Upload a sketch and read the Serial Monitor',
        ],
        blocks: [
          { type: 'diagram', name: 'loop', caption: 'setup() runs once. loop() runs again and again.' },
          {
            type: 'code',
            language: 'arduino',
            code: FIRST_PROGRAM,
            caption: 'Read the comments: anything after // is a note for humans. The Arduino ignores it.',
            download: 'first_program.ino',
          },
          {
            type: 'text',
            heading: 'Upload it',
            body: '1. Install the free **Arduino IDE** from arduino.cc on a computer.\n2. Plug the Arduino Uno in with its USB cable.\n3. Choose **Tools → Board → Arduino Uno** and **Tools → Port** (the one that appears when you plug in).\n4. Paste the sketch and click **Upload** (the right arrow).\n5. Open **Tools → Serial Monitor** and set it to **9600 baud**.\n\nThe small LED marked **L** blinks, and the Serial Monitor counts the blinks.',
          },
          {
            type: 'code-lab',
            id: 'lab-first',
            title: 'Code lab: first program',
            tasks: [
              {
                id: 't1',
                kind: 'fill',
                level: 1,
                title: 'Fill in the blank',
                prompt: 'Make the LED stay on for one whole second.',
                code: 'digitalWrite(LED_BUILTIN, HIGH);\ndelay({{ms}});\ndigitalWrite(LED_BUILTIN, LOW);',
                blanks: [{ id: 'ms', answers: ['1000'], hint: 'delay() counts in milliseconds. 1 second = 1000 milliseconds.', width: 6 }],
                explanation: 'delay(1000) pauses for 1000 milliseconds, which is one second.',
              },
              {
                id: 't2',
                kind: 'fill',
                level: 1,
                title: 'Which function runs once?',
                prompt: 'Fill in the name of the function that runs only once, at power on.',
                code: 'void {{fn}}() {\n  pinMode(LED_BUILTIN, OUTPUT);\n  Serial.begin(9600);\n}',
                blanks: [{ id: 'fn', answers: ['setup'], hint: 'It sets things up before the main loop starts.', width: 7 }],
                explanation: 'setup() runs once. Pin modes and Serial.begin belong there.',
              },
              {
                id: 't3',
                kind: 'predict',
                level: 2,
                title: 'Predict the output',
                prompt: 'The sketch has been running for 3 seconds. Each blink takes 1 second. What is the last line on the Serial Monitor?',
                code: 'Serial.print("Blinks so far: ");\nSerial.println(blinkCount);',
                choices: [
                  { id: 'a', text: 'Blinks so far: 3', correct: true, feedback: 'Right: one line per blink, and three blinks have finished.' },
                  { id: 'b', text: 'Blinks so far: 1', correct: false, feedback: 'blinkCount goes up by one every time loop() runs.' },
                  { id: 'c', text: 'blinkCount', correct: false, feedback: 'Without quotes, println prints the variable’s value, not its name.' },
                ],
                explanation: 'Each pass through loop() adds 1 to blinkCount and prints it.',
                expected: 'Hello! My robot brain is awake.\nBlinks so far: 1\nBlinks so far: 2\nBlinks so far: 3',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'Common mistakes',
            body: '- Forgetting the **semicolon** ; at the end of a line.\n- Writing **Setup** with a capital S. Arduino code is case-sensitive.\n- The Serial Monitor shows rubbish: set it to **9600 baud** to match Serial.begin(9600).',
          },
        ],
        summary: [
          'setup() runs once; loop() repeats forever.',
          'A variable is a named box that holds a value.',
          'digitalWrite sets a pin HIGH or LOW; delay waits in milliseconds.',
          'Serial.println sends text to the Serial Monitor at 9600 baud.',
        ],
        next: 'Next, read your IR sensors and see their values on the Serial Monitor.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which part of a sketch runs again and again?',
            multiple: false,
            options: [
              { id: 'a', text: 'loop()', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'setup()', correct: false, feedback: 'setup() runs only once.' },
              { id: 'c', text: 'The comments', correct: false, feedback: 'Comments are notes. They never run.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'How long does delay(250) wait?',
            multiple: false,
            options: [
              { id: 'a', text: 'A quarter of a second', correct: true, feedback: 'Yes: 250 milliseconds.' },
              { id: 'b', text: '250 seconds', correct: false, feedback: 'delay() counts milliseconds.' },
              { id: 'c', text: '2.5 seconds', correct: false, feedback: '2.5 seconds would be delay(2500).' },
            ],
          },
          {
            id: 'q3',
            prompt: 'What does digitalWrite(LED_BUILTIN, HIGH) do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Turns the built-in LED on', correct: true, feedback: 'Right. HIGH puts 5 V on the pin.' },
              { id: 'b', text: 'Reads the LED', correct: false, feedback: 'Reading uses digitalRead.' },
              { id: 'c', text: 'Makes the LED brighter forever', correct: false, feedback: 'It switches it on; brightness control needs PWM.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-09-read-sensors',
      title: 'Read the IR sensors',
      kind: 'INTERACTIVE',
      minutes: 15,
      replaces: ['Reading the IR sensor'],
      videoId: 'r101-v09',
      content: {
        version: 1,
        stage: 'test',
        intro:
          'Now connect your program to the real world. You will read each IR sensor with digitalRead, print what it sees, and find out which value your sensors give over black.',
        objectives: [
          'Use pinMode(pin, INPUT) and digitalRead',
          'Print sensor values on the Serial Monitor',
          'Calibrate: find your sensor’s value over black and set ON_LINE',
        ],
        blocks: [
          {
            type: 'code',
            language: 'arduino',
            code: SENSOR_TEST,
            caption: 'Upload this, open the Serial Monitor at 9600 baud, and slide the robot slowly across the line by hand.',
            download: 'ir_sensor_test.ino',
          },
          {
            type: 'steps',
            title: 'Calibrate your sensors',
            steps: [
              { title: 'Both on white', body: 'Place the robot on plain white floor. Both should read WHITE, and each module’s small LED should be in the same state.' },
              { title: 'Left on black', body: 'Slide the robot so only the left sensor is over the tape. The Serial Monitor should say Left: BLACK.' },
              { title: 'If it says WHITE over black', body: 'Your modules use the opposite polarity. Change const int ON_LINE = HIGH; to LOW, upload again and re-check.', tip: 'This is normal. Not every module agrees.' },
              { title: 'Adjust the knob if needed', body: 'If a sensor never changes, turn its blue knob slowly until its LED switches exactly at the edge of the tape.' },
              { title: 'Right on black', body: 'Repeat with the right sensor. Note your ON_LINE value: you will use it in Lesson 12.' },
            ],
          },
          {
            type: 'code-lab',
            id: 'lab-sensors',
            title: 'Code lab: sensors',
            tasks: [
              {
                id: 't1',
                kind: 'pins',
                level: 1,
                title: 'Match the pins',
                prompt: 'Fill in the pin numbers from the course pin map.',
                code: 'const int LEFT_IR = {{l}};\nconst int RIGHT_IR = {{r}};',
                blanks: [
                  { id: 'l', answers: ['2', 'D2'], hint: 'Left IR is on D2.', width: 3 },
                  { id: 'r', answers: ['3', 'D3'], hint: 'Right IR is on D3.', width: 3 },
                ],
                explanation: 'Left IR OUT goes to D2 and right IR OUT to D3.',
              },
              {
                id: 't2',
                kind: 'fill',
                level: 2,
                title: 'Read a sensor',
                prompt: 'Complete the line that reads the left sensor.',
                code: 'int left = {{fn}}(LEFT_IR);',
                blanks: [{ id: 'fn', answers: ['digitalRead'], hint: 'Writing uses digitalWrite. Reading uses…', width: 12 }],
                explanation: 'digitalRead returns HIGH or LOW from an input pin.',
              },
              {
                id: 't3',
                kind: 'predict',
                level: 2,
                title: 'Predict the Serial Monitor',
                prompt: 'ON_LINE is HIGH. The left sensor reads HIGH and the right reads LOW. What is printed?',
                code: 'Serial.print(left == ON_LINE ? "BLACK" : "WHITE");',
                choices: [
                  { id: 'a', text: 'Left: BLACK   Right: WHITE', correct: true, feedback: 'Right: HIGH equals ON_LINE, so the left sees black.' },
                  { id: 'b', text: 'Left: WHITE   Right: BLACK', correct: false, feedback: 'Check which sensor read HIGH.' },
                  { id: 'c', text: 'Left: HIGH   Right: LOW', correct: false, feedback: 'The sketch prints BLACK or WHITE, not HIGH or LOW.' },
                ],
                explanation: 'A reading equal to ON_LINE prints BLACK.',
                expected: 'Left: BLACK   Right: WHITE',
              },
            ],
          },
        ],
        summary: [
          'Sensor pins are INPUTs; read them with digitalRead.',
          'Serial.print shows what the robot senses.',
          'Calibrate: set ON_LINE to the value your sensors give over black.',
        ],
        next: 'Next, control the motors from code and learn how PWM sets their speed.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which line sets up the left sensor pin correctly?',
            multiple: false,
            options: [
              { id: 'a', text: 'pinMode(LEFT_IR, INPUT);', correct: true, feedback: 'Correct: sensors are inputs.' },
              { id: 'b', text: 'pinMode(LEFT_IR, OUTPUT);', correct: false, feedback: 'The sensor sends a signal in, so the pin must be an INPUT.' },
              { id: 'c', text: 'digitalWrite(LEFT_IR, HIGH);', correct: false, feedback: 'That writes to the pin. You need to read it.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'Over black tape your sensor prints WHITE. What should you change?',
            multiple: false,
            hint: 'Remember polarity.',
            options: [
              { id: 'a', text: 'Swap ON_LINE between HIGH and LOW', correct: true, feedback: 'Yes. Your module uses the opposite polarity.' },
              { id: 'b', text: 'Buy a new sensor', correct: false, feedback: 'Reversed output is normal. Just change ON_LINE.' },
              { id: 'c', text: 'Use thinner tape', correct: false, feedback: 'The tape is not the problem.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'At what speed must the Serial Monitor be set for Serial.begin(9600)?',
            multiple: false,
            options: [
              { id: 'a', text: '9600 baud', correct: true, feedback: 'Correct. They must match.' },
              { id: 'b', text: '115200 baud', correct: false, feedback: 'That would show rubbish characters.' },
              { id: 'c', text: 'Any speed', correct: false, feedback: 'Both sides must use the same speed.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-10-control-motors',
      title: 'Control the motors with code',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'r101-v10',
      content: {
        version: 1,
        stage: 'practise',
        intro:
          'Two kinds of signal drive each motor. Direction pins (IN1 to IN4) choose which way it turns. A speed pin (ENA or ENB) uses PWM to choose how fast.',
        objectives: [
          'Set motor direction with IN1–IN4',
          'Set motor speed with analogWrite and PWM',
          'Make the robot go forward, turn left, turn right and stop',
        ],
        blocks: [
          { type: 'diagram', name: 'pwm', caption: 'PWM: the pin switches on and off very fast. More “on” time means more speed.' },
          {
            type: 'text',
            heading: 'Direction and speed',
            body: '| IN1 | IN2 | Left motor |\n| --- | --- | --- |\n| HIGH | LOW | Forward |\n| LOW | HIGH | Backward |\n| LOW | LOW | Stop |\n\nIN3 and IN4 do the same for the right motor.\n\nSpeed comes from **analogWrite(ENA, value)**, where value is 0 (stopped) to 255 (full speed). This only works on pins marked **~** on the Uno, such as D5 and D6.',
          },
          {
            type: 'code',
            language: 'arduino',
            code: MOTOR_TEST,
            caption: 'Wheels off the table before you upload this.',
            download: 'motor_test.ino',
          },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'A wheel spins backwards?',
            body: 'Swap the two wires of that motor at the L298N terminals, or swap HIGH and LOW for its IN pins in setMotors. Both fix it.',
          },
          {
            type: 'code-lab',
            id: 'lab-motors',
            title: 'Code lab: motors',
            tasks: [
              {
                id: 't1',
                kind: 'pins',
                level: 1,
                title: 'Speed pins',
                prompt: 'Fill in the PWM pins for the two motors.',
                code: 'const int ENA = {{ena}};  // left motor speed\nconst int ENB = {{enb}};  // right motor speed',
                blanks: [
                  { id: 'ena', answers: ['5', 'D5'], width: 3, hint: 'ENA is on D5.' },
                  { id: 'enb', answers: ['6', 'D6'], width: 3, hint: 'ENB is on D6.' },
                ],
                explanation: 'D5 and D6 are PWM pins (marked ~), so analogWrite can set speed on them.',
              },
              {
                id: 't2',
                kind: 'fill',
                level: 2,
                title: 'Half speed',
                prompt: 'Set the left motor to about half speed.',
                code: 'analogWrite(ENA, {{v}});',
                blanks: [{ id: 'v', answers: ['127', '128', '125', '130'], hint: 'Full speed is 255. Half of that is about…', width: 4 }],
                explanation: '255 is full speed, so about 127 or 128 is half.',
              },
              {
                id: 't3',
                kind: 'complete',
                level: 3,
                title: 'Challenge: turn left',
                prompt: 'Make the robot turn left by slowing the left wheel and keeping the right wheel at full drive speed. Fill in both speeds.',
                code: '// setMotors(leftSpeed, rightSpeed)\nsetMotors({{l}}, {{r}});',
                blanks: [
                  { id: 'l', answers: ['0', '40', '50', '60'], width: 4, hint: 'The inside wheel of the turn is the slow one.' },
                  { id: 'r', answers: ['150', '200', '255', '180'], width: 4, hint: 'The outside wheel drives the turn.' },
                ],
                explanation: 'To turn left, the left wheel goes slow (or stops) and the right wheel stays fast.',
                expected: 'The robot curves to the left.',
              },
            ],
          },
          { type: 'motor-lab', id: 'motor-lab-2' },
        ],
        summary: [
          'IN pins choose direction; EN pins choose speed.',
          'analogWrite(pin, 0–255) sets speed using PWM on ~ pins.',
          'Turning means making one wheel slower than the other.',
        ],
        next: 'Next, combine sensors and motors into the line-following algorithm.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'IN1 is HIGH and IN2 is LOW. What does the left motor do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Runs forward', correct: true, feedback: 'Correct, per the direction table.' },
              { id: 'b', text: 'Runs backward', correct: false, feedback: 'Backward is IN1 LOW, IN2 HIGH.' },
              { id: 'c', text: 'Stops', correct: false, feedback: 'Stop is both LOW.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'What does analogWrite(ENB, 0) do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Stops the right motor', correct: true, feedback: 'Right: zero duty means no power.' },
              { id: 'b', text: 'Runs the right motor at full speed', correct: false, feedback: 'Full speed is 255.' },
              { id: 'c', text: 'Reverses the right motor', correct: false, feedback: 'Direction is set by IN3 and IN4.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'Why must ENA and ENB be on pins marked ~?',
            multiple: false,
            options: [
              { id: 'a', text: 'Only those pins can do PWM with analogWrite', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'They give more current', correct: false, feedback: 'All pins give the same small current.' },
              { id: 'c', text: 'It does not matter', correct: false, feedback: 'On a non-PWM pin the motor would be only fully on or off.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-11-algorithm',
      title: 'The line-following algorithm',
      kind: 'INTERACTIVE',
      minutes: 18,
      videoId: 'r101-v11',
      content: {
        version: 1,
        stage: 'experiment',
        intro:
          'An algorithm is a set of rules for solving a problem. The line-following algorithm needs just four rules, one for each combination of the two sensors. Learn them, then test them in the simulator.',
        objectives: [
          'Write the four line-following rules as IF / ELSE',
          'Complete the truth table for two sensors',
          'Test the algorithm in the simulator and fix a broken version',
        ],
        blocks: [
          { type: 'diagram', name: 'flowchart', caption: 'The decision the robot makes on every pass of loop().' },
          { type: 'truth-table', id: 'truth-table' },
          {
            type: 'text',
            heading: 'From rules to code',
            body: '```\nif (!leftOnLine && !rightOnLine) {\n  // forward\n} else if (leftOnLine && !rightOnLine) {\n  // turn left\n} else if (!leftOnLine && rightOnLine) {\n  // turn right\n} else {\n  // both on black: stop\n}\n```\n\n**&&** means AND. **!** means NOT. So `!leftOnLine && rightOnLine` reads: “the left does not see the line, and the right does.”',
          },
          { type: 'line-sim', id: 'sim-tutorial', mode: 'explore', tutorial: true },
          {
            type: 'code-lab',
            id: 'lab-algorithm',
            title: 'Code lab: the algorithm',
            tasks: [
              {
                id: 't1',
                kind: 'condition',
                level: 2,
                title: 'Fix the condition',
                prompt: 'This rule should turn RIGHT when only the right sensor sees black. Fix the condition.',
                code: 'else if ({{a}} && {{b}}) {\n  setMotors(BASE_SPEED, TURN_SPEED);  // turn right\n}',
                blanks: [
                  { id: 'a', answers: ['!leftOnLine', '! leftOnLine', 'leftOnLine == false', '!leftonline'], width: 13, hint: 'The left sensor must NOT see the line: put ! in front of leftOnLine.' },
                  { id: 'b', answers: ['rightOnLine', 'rightOnLine == true', 'rightonline'], width: 13, hint: 'The right sensor DOES see the line, so no ! here.' },
                ],
                explanation: '!leftOnLine && rightOnLine: left on white, right on black. Turn right.',
              },
              {
                id: 't2',
                kind: 'complete',
                level: 3,
                title: 'Complete the algorithm',
                prompt: 'Fill in the wheel speeds for each rule. Use BASE_SPEED for a driving wheel and TURN_SPEED for a slowed wheel.',
                code: 'if (!leftOnLine && !rightOnLine) {\n  setMotors({{f1}}, {{f2}});   // forward\n} else if (leftOnLine && !rightOnLine) {\n  setMotors({{l1}}, {{l2}});   // turn left\n} else if (!leftOnLine && rightOnLine) {\n  setMotors({{r1}}, {{r2}});   // turn right\n} else {\n  setMotors(0, 0);             // stop\n}',
                blanks: [
                  { id: 'f1', answers: ['BASE_SPEED'], width: 11 },
                  { id: 'f2', answers: ['BASE_SPEED'], width: 11 },
                  { id: 'l1', answers: ['TURN_SPEED'], width: 11, hint: 'Turning left: the left wheel slows.' },
                  { id: 'l2', answers: ['BASE_SPEED'], width: 11 },
                  { id: 'r1', answers: ['BASE_SPEED'], width: 11 },
                  { id: 'r2', answers: ['TURN_SPEED'], width: 11, hint: 'Turning right: the right wheel slows.' },
                ],
                explanation: 'Forward: both wheels fast. Left: left slow, right fast. Right: left fast, right slow.',
              },
            ],
          },
          { type: 'line-sim', id: 'sim-experiments', mode: 'experiments' },
        ],
        summary: [
          'Two sensors give four combinations, so four rules.',
          'Neither on line: forward. Left on line: turn left. Right on line: turn right. Both: stop.',
          'In code: if / else if / else, with && (AND) and ! (NOT).',
          'Swapping left and right makes the robot steer away from the line.',
        ],
        next: 'Next, put the full program on your robot and make it follow a real track.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'The right sensor sees black and the left sees white. What should the robot do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Turn right', correct: true, feedback: 'Correct: the line has moved under the right side.' },
              { id: 'b', text: 'Turn left', correct: false, feedback: 'That steers away from the line.' },
              { id: 'c', text: 'Stop', correct: false, feedback: 'Stop is for both sensors on black.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'Both sensors see white. What should the robot do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Go forward', correct: true, feedback: 'Yes: the line is between the sensors.' },
              { id: 'b', text: 'Spin round', correct: false, feedback: 'All is well. Keep going.' },
              { id: 'c', text: 'Stop', correct: false, feedback: 'The robot is on track. No need to stop.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'What does && mean in Arduino code?',
            multiple: false,
            options: [
              { id: 'a', text: 'AND: both must be true', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'OR: either can be true', correct: false, feedback: 'OR is ||.' },
              { id: 'c', text: 'NOT', correct: false, feedback: 'NOT is !.' },
            ],
          },
          {
            id: 'q4',
            prompt: 'A robot steers away from the line every time it reaches a bend. What is the most likely bug?',
            multiple: false,
            hint: 'Try the broken algorithm in the simulator.',
            options: [
              { id: 'a', text: 'The left and right turn rules are swapped', correct: true, feedback: 'Yes. Swap them back.' },
              { id: 'b', text: 'The battery is too strong', correct: false, feedback: 'That would make it fast, not steer the wrong way.' },
              { id: 'c', text: 'The line is too black', correct: false, feedback: 'A dark line is good.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
  ],
}
