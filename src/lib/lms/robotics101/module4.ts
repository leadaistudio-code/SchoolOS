import { LINE_FOLLOWER } from '@/lib/lms/robotics101-sketches'
import type { ModuleDef } from './types'

export const MODULE_4: ModuleDef = {
  key: 'm4',
  title: 'Build, test and improve',
  summary: 'Run the full program, fix common problems, complete the final challenge and earn your certificate.',
  lessons: [
    {
      slug: 'r101-12-make-it-follow',
      title: 'Make your robot follow the line',
      kind: 'INTERACTIVE',
      minutes: 17,
      videoId: 'r101-v12',
      content: {
        version: 1,
        stage: 'test',
        intro:
          'Everything comes together. Upload the full line-follower program, make a test track, and run your robot. Then tune the speed until it is smooth and reliable.',
        objectives: [
          'Make a safe test track',
          'Upload and run the full line-follower program',
          'Tune BASE_SPEED and TURN_SPEED for your track',
        ],
        blocks: [
          {
            type: 'steps',
            title: 'Make a test track',
            steps: [
              { title: 'Choose a surface', body: 'A large white chart paper, flex sheet or a light, smooth floor. Avoid shiny tiles in bright sunlight.' },
              { title: 'Lay the line', body: 'Use black electrical (insulation) tape, about 18 to 25 mm wide. Start with a large oval with gentle curves.', tip: 'Press the tape down flat. Bubbles and creases confuse the sensors.' },
              { title: 'Keep it clear', body: 'Leave at least 15 cm of white around the line, and keep the track away from table edges.' },
            ],
          },
          {
            type: 'code',
            language: 'arduino',
            code: LINE_FOLLOWER,
            caption: 'Set ON_LINE to the value you found in Lesson 9 before uploading.',
            download: 'line_follower.ino',
          },
          {
            type: 'checklist',
            id: 'first-run',
            title: 'Before the first run',
            items: [
              { id: 'r1', text: 'ON_LINE matches my calibration from Lesson 9' },
              { id: 'r2', text: 'The motor test (Lesson 10) makes both wheels go forward' },
              { id: 'r3', text: 'Batteries are charged' },
              { id: 'r4', text: 'The robot starts with the line between its two sensors' },
              { id: 'r5', text: 'An adult is nearby for the first run' },
            ],
          },
          {
            type: 'text',
            heading: 'Tune it',
            body: 'Start slow. Set **BASE_SPEED** to about 120 and see if the robot completes a lap. Then raise it by 10 or 20 at a time.\n\n- **Wobbles a lot on straights:** turns are too sharp. Raise TURN_SPEED a little.\n- **Runs off on curves:** it is too fast for its turns. Lower BASE_SPEED, or lower TURN_SPEED so turns are sharper.\n- **Cannot get round a 90° corner:** set TURN_SPEED to 0, or a negative number such as -80, so the inside wheel stops or spins backwards. This is a **pivot turn**.\n- **Stops at a cross line you want it to drive over:** set STOP_WHEN_BOTH to false.\n\nTry the same changes in the simulator first: it uses the same rules.',
          },
          { type: 'line-sim', id: 'sim-challenge', mode: 'challenge' },
        ],
        summary: [
          'Use 18–25 mm black tape on a smooth white surface.',
          'Start slow, then raise the speed in small steps.',
          'Tuning is a balance: faster runs need sharper, quicker turns.',
        ],
        next: 'Next, solve the most common problems like a real robotics engineer.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Your robot completes the track slowly. What is the best way to make it faster?',
            multiple: false,
            options: [
              { id: 'a', text: 'Raise BASE_SPEED in small steps and test each time', correct: true, feedback: 'Correct. Change one thing at a time.' },
              { id: 'b', text: 'Set BASE_SPEED to 255 straight away', correct: false, feedback: 'Too big a jump. It will probably fly off the first curve.' },
              { id: 'c', text: 'Remove a sensor', correct: false, feedback: 'It needs both sensors to steer.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'Which surface is best for a test track?',
            multiple: false,
            options: [
              { id: 'a', text: 'Matt white chart paper with black tape', correct: true, feedback: 'Yes: strong contrast, no glare.' },
              { id: 'b', text: 'A dark carpet', correct: false, feedback: 'Black tape on a dark surface has very little contrast.' },
              { id: 'c', text: 'Shiny tiles in direct sunlight', correct: false, feedback: 'Sunlight and glare confuse IR sensors.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'Your robot misses the sharp 90° corner every time. Which change should you try?',
            multiple: false,
            hint: 'Think about what the inner wheel does during a turn.',
            options: [
              { id: 'a', text: 'Set TURN_SPEED to 0 or a negative number such as -80 so it pivots', correct: true, feedback: 'Yes. A stopped or reversing inner wheel turns much more tightly.' },
              { id: 'b', text: 'Raise BASE_SPEED to 255', correct: false, feedback: 'Faster makes sharp corners harder, not easier.' },
              { id: 'c', text: 'Move the sensors further back', correct: false, feedback: 'Sensors at the back see the corner even later.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-13-troubleshooting',
      title: 'Fix common robot problems',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'r101-v13',
      content: {
        version: 1,
        stage: 'improve',
        intro:
          'Every engineer’s robot misbehaves at first. Good engineers find the cause step by step. Solve these missions to learn the most common faults and how to fix them.',
        objectives: [
          'Diagnose a problem from its symptom',
          'Check one thing at a time',
          'Fix the six most common line-follower faults',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'The engineer’s method',
            body: '1. **Describe** exactly what happens.\n2. **Guess** one likely cause.\n3. **Test** just that one thing.\n4. **Fix** it, then test again.\n\nAlways unplug the battery before changing any wires.',
          },
          {
            type: 'missions',
            id: 'missions',
            title: 'Troubleshooting missions',
            missions: [
              {
                id: 'm1',
                symptom: 'Nothing happens at all. No wheel moves, no LEDs on the motor driver.',
                options: [
                  { id: 'a', text: 'The battery is flat, or the switch is off', correct: true, feedback: 'Most likely. No LED on the driver means it has no power.' },
                  { id: 'b', text: 'The turn rules are swapped', correct: false, feedback: 'Swapped rules would still make wheels move.' },
                  { id: 'c', text: 'The tape is too wide', correct: false, feedback: 'The robot would still try to move.' },
                ],
                fix: 'Check the switch, charge or replace the batteries, and check battery + to 12V/VS and − to GND on the L298N.',
              },
              {
                id: 'm2',
                symptom: 'One wheel spins backwards when the robot should go forward.',
                options: [
                  { id: 'a', text: 'That motor’s two wires are the wrong way round', correct: true, feedback: 'Yes. Swapping them reverses the motor.' },
                  { id: 'b', text: 'The sensor is broken', correct: false, feedback: 'Sensors do not decide a motor’s direction.' },
                  { id: 'c', text: 'The Arduino is upside down', correct: false, feedback: 'Orientation does not change direction.' },
                ],
                fix: 'Unplug the battery and swap that motor’s two wires at the L298N terminal. Or swap HIGH and LOW for its IN pins in the code.',
              },
              {
                id: 'm3',
                symptom: 'Motors twitch or run randomly, even with the right code.',
                options: [
                  { id: 'a', text: 'No common ground between the Arduino and the L298N', correct: true, feedback: 'Classic cause. Signals mean nothing without a shared ground.' },
                  { id: 'b', text: 'BASE_SPEED is too low', correct: false, feedback: 'Low speed is slow, not random.' },
                  { id: 'c', text: 'The castor is loose', correct: false, feedback: 'That affects driving, not motor signals.' },
                ],
                fix: 'Connect an L298N GND to an Arduino GND pin.',
              },
              {
                id: 'm4',
                symptom: 'The robot always steers away from the line at the first bend.',
                options: [
                  { id: 'a', text: 'The left and right turns are swapped in code or wiring', correct: true, feedback: 'Yes. The fix is to swap them back.' },
                  { id: 'b', text: 'The robot is too slow', correct: false, feedback: 'A slow robot still steers the right way.' },
                  { id: 'c', text: 'The tape is too black', correct: false, feedback: 'Darker tape is better.' },
                ],
                fix: 'Check the sensor wires (left OUT on D2, right on D3) and the turn rules. Try it in the simulator’s “Fix the algorithm” experiment.',
              },
              {
                id: 'm5',
                symptom: 'The robot drives straight across the line as if it cannot see it.',
                options: [
                  { id: 'a', text: 'The sensors need calibrating, or ON_LINE is wrong', correct: true, feedback: 'Right. Check the Serial Monitor over black.' },
                  { id: 'b', text: 'The wheels are too big', correct: false, feedback: 'Wheel size does not affect sensing.' },
                  { id: 'c', text: 'The USB cable is too short', correct: false, feedback: 'Not related to sensing.' },
                ],
                fix: 'Run the sensor test from Lesson 9. Adjust each blue knob, check the sensor height (5–10 mm), and set ON_LINE to match.',
              },
              {
                id: 'm6',
                symptom: 'It follows straight parts, but overshoots and loses the line on curves.',
                options: [
                  { id: 'a', text: 'It is going too fast for its turns', correct: true, feedback: 'Yes: lower BASE_SPEED or make turns sharper.' },
                  { id: 'b', text: 'The program has no loop()', correct: false, feedback: 'Then it would not work at all.' },
                  { id: 'c', text: 'The sensors are too close to the floor', correct: false, feedback: 'At 5–10 mm that is correct.' },
                ],
                fix: 'Lower BASE_SPEED by 20, or lower TURN_SPEED (try 0, or -80 for a pivot turn) so it turns more sharply. Test after each change.',
              },
            ],
          },
          { type: 'line-sim', id: 'sim-debug', mode: 'experiments' },
        ],
        summary: [
          'Describe, guess, test, fix: one change at a time.',
          'No power: check the battery and switch. Random motors: check common ground.',
          'Wrong direction: swap that motor’s wires. Ignores the line: calibrate.',
          'Loses the line on curves: slow down or turn more sharply.',
        ],
        next: 'Next: the final challenge. Show what your robot can do.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Your robot works on straight lines but flies off every curve. What do you try first?',
            multiple: false,
            options: [
              { id: 'a', text: 'Lower BASE_SPEED a little and test again', correct: true, feedback: 'Yes: one small change, then test.' },
              { id: 'b', text: 'Rewire everything', correct: false, feedback: 'It works on straights, so the wiring is probably fine.' },
              { id: 'c', text: 'Replace the Arduino', correct: false, feedback: 'The Arduino is clearly working.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'What is the safest first step before fixing a wiring fault?',
            multiple: false,
            options: [
              { id: 'a', text: 'Unplug the battery', correct: true, feedback: 'Always.' },
              { id: 'b', text: 'Run the motors to see the fault better', correct: false, feedback: 'Never change wires with power on.' },
              { id: 'c', text: 'Shake the robot', correct: false, feedback: 'That will not help, and could loosen more wires.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'The Serial Monitor says BLACK for both sensors, even over white paper. What is the likely cause?',
            multiple: false,
            hint: 'Both sensors agree, and they are wrong in the same way.',
            options: [
              { id: 'a', text: 'The sensors are too sensitive or too high: adjust the knobs and the height', correct: true, feedback: 'Right. That is a calibration problem.' },
              { id: 'b', text: 'The left and right motors are swapped', correct: false, feedback: 'Motors do not change what the sensors read.' },
              { id: 'c', text: 'The battery is too full', correct: false, feedback: 'A full battery is fine.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-14-final-challenge',
      title: 'Final challenge: show your robot',
      kind: 'PROJECT',
      minutes: 20,
      replaces: ['Project: follow the line'],
      videoId: 'r101-v14',
      body: [
        '# The challenge',
        '',
        'Make your robot complete a full lap of a track with at least **two curves**, without leaving the line and without being touched.',
        '',
        '# Choose your pathway',
        '',
        '**Physical robot.** Upload a photo of your robot and your track, paste your final code, and share a short video link (Google Drive, YouTube unlisted). Or ask your teacher to watch a run and confirm it.',
        '',
        '**No kit? Virtual pathway.** Complete the S-curve and sharp-turns tracks in the simulator below. Your results are attached to your submission automatically. Paste the rules you used and explain one change you made to improve your robot.',
        '',
        '# What your teacher looks for',
        '',
        '- The robot follows the whole track (or the simulator shows both tracks finished)',
        '- Your code uses the correct pins and the four rules',
        '- You can explain one problem you fixed and how',
        '- Safe working: wiring checked, battery unplugged when changing wires',
      ].join('\n'),
      content: {
        version: 1,
        stage: 'demonstrate',
        intro:
          'This is your moment. Show that your robot can follow a line all by itself. Work through the ten steps, then hand in your evidence for your teacher to review.',
        objectives: [
          'Complete a full lap of a track with two or more curves',
          'Hand in evidence: photo, code and video, a teacher-witnessed run, or simulator results',
          'Explain one problem you solved',
        ],
        blocks: [
          {
            type: 'checklist',
            id: 'capstone-steps',
            title: 'Ten steps to the finish',
            items: [
              { id: 'c1', text: 'Assemble the robot', detail: 'Lesson 6' },
              { id: 'c2', text: 'Connect the components', detail: 'Lesson 7, with an adult’s wiring check' },
              { id: 'c3', text: 'Test the sensors', detail: 'Lesson 9: both read BLACK over the tape' },
              { id: 'c4', text: 'Test the motors', detail: 'Lesson 10: both go forward' },
              { id: 'c5', text: 'Upload the line-following program', detail: 'Lesson 12' },
              { id: 'c6', text: 'Calibrate the sensors', detail: 'ON_LINE set, knobs adjusted' },
              { id: 'c7', text: 'Run the robot on the track' },
              { id: 'c8', text: 'Fix any problems', detail: 'Lesson 13 missions' },
              { id: 'c9', text: 'Improve speed or reliability' },
              { id: 'c10', text: 'Record and submit your result' },
            ],
          },
          {
            type: 'callout',
            tone: 'teacher',
            title: 'For the teacher',
            body: 'Approve when the evidence shows a full lap (or both simulator tracks finished) and the student can explain one fix. Ask for changes with a clear next step if not. Students can resubmit as many times as needed.',
          },
          { type: 'line-sim', id: 'sim-capstone', mode: 'challenge' },
        ],
        summary: [
          'Finish a lap with at least two curves, untouched.',
          'Submit a photo, code and video, a teacher-witnessed run, or simulator results.',
          'Your teacher reviews it; you can improve and resubmit.',
        ],
        next: 'Last step: the final assessment, your badge and your certificate.',
      },
    },
    {
      slug: 'r101-15-final-assessment',
      title: 'Final assessment and celebration',
      kind: 'QUIZ',
      minutes: 15,
      passPercent: 80,
      content: {
        version: 1,
        stage: 'demonstrate',
        intro: 'Ten questions on everything you have learned. You need 80% to pass, and you can try again as many times as you like. Your best score counts.',
        objectives: ['Show what you know about sensors, motors, wiring and code', 'Earn the Line-Follower Champion badge and your certificate'],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Where next?',
            body: 'After this course, try **AI for Young Builders** or an obstacle-avoiding robot with an ultrasonic sensor. Everything you learned here, Sense, Think, Act, carries over.',
          },
        ],
        summary: [
          'You built, wired, programmed, tested and improved a real robot.',
          'Sense, think, act: the same loop runs inside warehouse robots, drones and self-driving cars.',
        ],
        next: 'You have finished Robotics 101. Download your certificate from your learning page.',
      },
      quiz: {
        questions: [
          {
            id: 'f1',
            prompt: 'What are the three steps every robot repeats?',
            multiple: false,
            options: [
              { id: 'a', text: 'Sense, Think, Act', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Build, Paint, Sell', correct: false, feedback: 'Those are not robot steps.' },
              { id: 'c', text: 'Start, Stop, Start', correct: false, feedback: 'Think about what a robot does with information.' },
            ],
          },
          {
            id: 'f2',
            prompt: 'An IR sensor over black tape receives…',
            multiple: false,
            options: [
              { id: 'a', text: 'Less reflected light than over white', correct: true, feedback: 'Yes: black absorbs IR.' },
              { id: 'b', text: 'More reflected light than over white', correct: false, feedback: 'White reflects more.' },
              { id: 'c', text: 'The same light', correct: false, feedback: 'Then it could not tell them apart.' },
            ],
          },
          {
            id: 'f3',
            prompt: 'Which pin does the right IR sensor connect to in the reference kit?',
            multiple: false,
            options: [
              { id: 'a', text: 'D3', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'D2', correct: false, feedback: 'D2 is the left sensor.' },
              { id: 'c', text: 'D6', correct: false, feedback: 'D6 is ENB, the right motor’s speed.' },
            ],
          },
          {
            id: 'f4',
            prompt: 'Why is a motor driver needed?',
            multiple: false,
            options: [
              { id: 'a', text: 'Arduino pins cannot supply the current motors need', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'It programs the Arduino', correct: false, feedback: 'The IDE does that over USB.' },
              { id: 'c', text: 'It makes the sensors work', correct: false, feedback: 'Sensors connect to the Arduino.' },
            ],
          },
          {
            id: 'f5',
            prompt: 'The left wheel is slower than the right. The robot…',
            multiple: false,
            options: [
              { id: 'a', text: 'Curves left', correct: true, feedback: 'Correct: towards the slower wheel.' },
              { id: 'b', text: 'Curves right', correct: false, feedback: 'It curves towards the slower wheel.' },
              { id: 'c', text: 'Goes straight', correct: false, feedback: 'Only equal speeds go straight.' },
            ],
          },
          {
            id: 'f6',
            prompt: 'What does analogWrite(ENA, 255) do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Left motor at full speed', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Left motor stopped', correct: false, feedback: '0 is stopped.' },
              { id: 'c', text: 'Reads the left sensor', correct: false, feedback: 'Sensors are read with digitalRead.' },
            ],
          },
          {
            id: 'f7',
            prompt: 'Only the left sensor sees black. The robot should…',
            multiple: false,
            options: [
              { id: 'a', text: 'Turn left', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Turn right', correct: false, feedback: 'That steers away from the line.' },
              { id: 'c', text: 'Go faster', correct: false, feedback: 'It needs to steer back to the line.' },
            ],
          },
          {
            id: 'f8',
            prompt: 'Which code is the robot’s “turn right” rule?',
            multiple: false,
            options: [
              { id: 'a', text: 'if (!leftOnLine && rightOnLine)', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'if (leftOnLine && !rightOnLine)', correct: false, feedback: 'That is the turn-left rule.' },
              { id: 'c', text: 'if (leftOnLine && rightOnLine)', correct: false, feedback: 'That is both on black.' },
            ],
          },
          {
            id: 'f9',
            prompt: 'Motors twitch randomly although the code is right. Most likely cause?',
            multiple: false,
            options: [
              { id: 'a', text: 'Missing common ground', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'The tape is too wide', correct: false, feedback: 'That would not make motors twitch.' },
              { id: 'c', text: 'The robot is too light', correct: false, feedback: 'Weight does not change signals.' },
            ],
          },
          {
            id: 'f10',
            prompt: 'Which of these are safe practice? Choose all that are correct.',
            multiple: true,
            options: [
              { id: 'a', text: 'Unplug the battery before changing wires', correct: true, feedback: 'Yes.' },
              { id: 'b', text: 'Have an adult check the wiring before first power', correct: true, feedback: 'Yes.' },
              { id: 'c', text: 'Power motors from the Arduino 5V pin', correct: false, feedback: 'Never: motors need the driver and battery.' },
            ],
          },
        ],
      },
    },
  ],
}
