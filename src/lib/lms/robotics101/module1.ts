import type { ModuleDef } from './types'

export const MODULE_1: ModuleDef = {
  key: 'm1',
  title: 'Meet your robot',
  summary: 'What a robot is, how every robot senses, thinks and acts, and the parts in your kit.',
  replaces: 'How robots work',
  lessons: [
    {
      slug: 'r101-01-welcome',
      title: 'Welcome to Robotics 101',
      kind: 'INTERACTIVE',
      minutes: 12,
      videoId: 'r101-v01',
      content: {
        version: 1,
        stage: 'watch',
        intro:
          'In this course you will build a robot that follows a black line all by itself, with no remote control. By the end you will know how its sensors see, how its motors move, and how to write the program that connects them.',
        objectives: [
          'Say what makes a machine a robot',
          'Spot robots in everyday life in India',
          'Know the five safety rules for this course',
          'Know what you will build by the end',
        ],
        blocks: [
          {
            type: 'text',
            heading: 'What is a robot?',
            body: 'A robot is a machine that can **sense** the world around it, **decide** what to do, and **act** on its own. A ceiling fan is not a robot: it spins whether or not anyone is in the room. An automatic door at a metro station is closer: it senses a person, decides to open, and moves.\n\nThe line-follower you will build does all three. Two small sensors look at the floor, a tiny computer called an Arduino decides which way to steer, and two motors turn the wheels.',
          },
          {
            type: 'callout',
            tone: 'life',
            title: 'Robots around you',
            body: 'Robots sort parcels in warehouses, help doctors in surgery, explore the Moon (the Pragyan rover from Chandrayaan-3 drove on the lunar surface in 2023) and carry goods around factories by following lines painted on the floor, just like yours will.',
          },
          {
            type: 'sort',
            id: 'robot-or-not',
            title: 'Robot or not?',
            prompt: 'Sort each machine. Ask yourself: does it sense something and decide for itself?',
            bins: [
              { id: 'robot', label: 'Robot' },
              { id: 'not', label: 'Not a robot' },
            ],
            items: [
              { id: 'vacuum', text: 'Robot vacuum cleaner', bin: 'robot', why: 'It senses walls and dirt and decides where to clean next.' },
              { id: 'fan', text: 'Ceiling fan', bin: 'not', why: 'It spins at the speed you set. It does not sense or decide anything.' },
              { id: 'rover', text: 'Pragyan Moon rover', bin: 'robot', why: 'It sensed the ground with cameras and instruments and moved carefully across it.' },
              { id: 'bicycle', text: 'Bicycle', bin: 'not', why: 'A person does all the sensing, deciding and pedalling.' },
              { id: 'door', text: 'Automatic sliding door', bin: 'robot', why: 'A simple robot: it senses a person and decides to open. Some people call this automation; it has all three parts.' },
              { id: 'mixer', text: 'Kitchen mixer', bin: 'not', why: 'It runs only while you press the switch. No sensing, no deciding.' },
              { id: 'linebot', text: 'Warehouse line-following cart', bin: 'robot', why: 'It senses a line on the floor and steers to stay on it, just like your robot.' },
              { id: 'torch', text: 'Torch', bin: 'not', why: 'It turns on when you press the button. Nothing more.' },
            ],
          },
          {
            type: 'text',
            heading: 'What you will build',
            body: 'Your robot is a small two-wheeled car. Under its nose are two IR (infrared) sensors that can tell black tape from a white floor. An **Arduino Uno** reads them, and an **L298N motor driver** powers two motors. You will build it, wire it, program it, test it and then improve it.',
          },
          { type: 'diagram', name: 'chassis', caption: 'Your line-follower from above: sensors at the front, wheels at the back.' },
          {
            type: 'callout',
            tone: 'safety',
            title: 'Five safety rules for every lesson',
            body: '1. **Unplug the battery** before you touch or change any wire.\n2. **An adult checks your wiring** before you connect the battery for the first time.\n3. **Never power motors from the Arduino pins or its 5V pin.** Motors get power from the motor driver and battery.\n4. **Wheels off the table** when you test motors, so the robot cannot run off the edge.\n5. **If anything gets hot, smells or smokes:** unplug the battery at once and tell an adult.',
          },
          {
            type: 'check',
            id: 'safety-1',
            prompt: 'You want to move a wire on your robot. What do you do first?',
            options: [
              { id: 'a', text: 'Unplug the battery', correct: true, feedback: 'Yes. No power means no short circuits and no surprise wheel spins.' },
              { id: 'b', text: 'Ask the robot to stop', correct: false, feedback: 'The robot does what its program says, and the power is still on. Unplug the battery first.' },
              { id: 'c', text: 'Move it quickly while it runs', correct: false, feedback: 'Never change wires with power on. A loose wire can touch the wrong pin and damage the board.' },
            ],
            explanation: 'Always remove power before changing any connection.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'No kit yet?',
            body: 'You can still finish this course. Every build lesson has a virtual version in the simulator, and the final challenge has a virtual pathway your teacher can approve.',
          },
        ],
        summary: [
          'A robot senses, decides and acts on its own.',
          'Robots are all around us, from warehouse carts to Moon rovers.',
          'You will build a two-wheeled robot that follows a black line.',
          'Unplug the battery before changing wires, and get an adult to check your wiring.',
        ],
        next: 'Next, you will look inside a robot’s “brain” and learn the Sense, Think, Act loop that every robot follows.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which of these is a robot?',
            multiple: false,
            hint: 'Look for a machine that senses something and decides what to do by itself.',
            options: [
              { id: 'a', text: 'A cart that follows a line on a factory floor', correct: true, feedback: 'Right. It senses the line and steers by itself.' },
              { id: 'b', text: 'A pedal sewing machine', correct: false, feedback: 'A person controls every movement. It does not sense or decide.' },
              { id: 'c', text: 'A table lamp', correct: false, feedback: 'It only turns on and off when you press the switch.' },
            ],
            explanation: 'A robot senses its surroundings, decides what to do, and acts on its own.',
          },
          {
            id: 'q2',
            prompt: 'Where must the motors get their power from?',
            multiple: false,
            hint: 'Arduino pins are for small signals only.',
            options: [
              { id: 'a', text: 'The battery, through the motor driver', correct: true, feedback: 'Correct. The driver switches battery power to the motors.' },
              { id: 'b', text: 'The Arduino 5V pin', correct: false, feedback: 'Motors draw far more current than the Arduino can give and can damage it.' },
              { id: 'c', text: 'An Arduino digital pin', correct: false, feedback: 'A digital pin gives only a tiny current, enough for a signal, never for a motor.' },
            ],
            explanation: 'The Arduino sends signals; the motor driver and battery do the heavy work.',
          },
          {
            id: 'q3',
            prompt: 'Something on your robot starts to smell hot. What should you do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Unplug the battery and tell an adult', correct: true, feedback: 'Exactly right. Remove power first, then get help.' },
              { id: 'b', text: 'Keep testing to see what happens', correct: false, feedback: 'Heat or smell means something is wrong. Stop at once.' },
              { id: 'c', text: 'Pour water on it', correct: false, feedback: 'Never put water on electronics. Unplug the battery and tell an adult.' },
            ],
            explanation: 'Heat, smell or smoke: unplug the battery and tell an adult.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-02-sense-think-act',
      title: 'How do robots think? Sense, Think, Act',
      kind: 'INTERACTIVE',
      minutes: 14,
      replaces: ['Sense, think, act'],
      videoId: 'r101-v02',
      content: {
        version: 1,
        stage: 'understand',
        intro:
          'Every robot, from a toy to a Mars rover, repeats the same three steps over and over: sense, think, act. Once you see this loop, you can understand any robot.',
        objectives: [
          'Name the three steps every robot repeats',
          'Match robot parts to Sense, Think and Act',
          'Explain why the loop must repeat quickly',
        ],
        blocks: [
          { type: 'diagram', name: 'sense-think-act', caption: 'The loop runs again and again, many times every second.' },
          {
            type: 'text',
            heading: 'The three steps',
            body: '**Sense.** The robot measures something about the world. Your robot’s IR sensors check whether each one is over black tape or white floor.\n\n**Think.** The robot’s computer (the Arduino) compares what it sensed with its rules. For example: “if the left sensor sees black, turn left.”\n\n**Act.** The robot does something. Your robot speeds up or slows down each wheel.\n\nThen it starts again from Sense. Your Arduino can go round this loop thousands of times every second.',
          },
          {
            type: 'callout',
            tone: 'life',
            title: 'You do it too',
            body: 'Crossing a road: you **sense** (look both ways and listen), **think** (is it safe?), and **act** (walk, or wait). Then you keep sensing as you cross.',
          },
          {
            type: 'sequence',
            id: 'loop-order',
            title: 'Put the robot’s loop in order',
            prompt: 'The robot is driving along the line. Drag the steps into the order they happen.',
            steps: [
              { id: 's1', text: 'The left sensor sees black tape' },
              { id: 's2', text: 'The Arduino reads the sensor value' },
              { id: 's3', text: 'The program decides: turn left' },
              { id: 's4', text: 'The left wheel slows down' },
              { id: 's5', text: 'The robot curves back over the line' },
            ],
            explanation: 'Sense (sensor sees black), Think (read the value and decide), Act (change wheel speeds). The robot then senses again.',
          },
          {
            type: 'sort',
            id: 'sta-parts',
            title: 'Sense, Think or Act?',
            prompt: 'Sort each robot part into the step it belongs to.',
            bins: [
              { id: 'sense', label: 'Sense' },
              { id: 'think', label: 'Think' },
              { id: 'act', label: 'Act' },
            ],
            items: [
              { id: 'ir', text: 'IR sensor', bin: 'sense', why: 'It measures how much light bounces back from the floor.' },
              { id: 'arduino', text: 'Arduino Uno', bin: 'think', why: 'It runs your program and makes decisions.' },
              { id: 'motor', text: 'DC motor', bin: 'act', why: 'It turns a wheel. That is the robot acting.' },
              { id: 'program', text: 'Your program', bin: 'think', why: 'The rules the Arduino follows are the thinking.' },
              { id: 'camera', text: 'Camera on a rover', bin: 'sense', why: 'It collects pictures of the world.' },
              { id: 'buzzer', text: 'Buzzer that beeps', bin: 'act', why: 'Making a sound is an action.' },
            ],
          },
          {
            type: 'check',
            id: 'fast-loop',
            prompt: 'Why does the loop need to run very fast on a line-follower?',
            hint: 'Think about what happens between two checks while the robot is moving.',
            options: [
              { id: 'a', text: 'So it notices the line curving before it drives off', correct: true, feedback: 'Yes. A slow loop means the robot travels further between checks and can miss a bend.' },
              { id: 'b', text: 'So the battery lasts longer', correct: false, feedback: 'Loop speed hardly affects the battery. The motors use most of the power.' },
              { id: 'c', text: 'It does not matter', correct: false, feedback: 'It matters a lot: the robot keeps moving while it thinks.' },
            ],
            explanation: 'The robot moves while it thinks, so frequent checks let it correct small drifts before they become big ones.',
          },
        ],
        summary: [
          'Every robot repeats Sense, Think, Act.',
          'Your IR sensors sense, the Arduino and your program think, and the motors act.',
          'The loop must repeat quickly so the robot can correct itself in time.',
        ],
        next: 'Next, open your kit and meet each part: what it is called, what it does, and where it goes.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'In the Sense, Think, Act loop, which part does the Arduino do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Think', correct: true, feedback: 'Right. It runs the program that decides.' },
              { id: 'b', text: 'Sense', correct: false, feedback: 'The sensors do the sensing. The Arduino reads them and decides.' },
              { id: 'c', text: 'Act', correct: false, feedback: 'The motors act. The Arduino tells them what to do.' },
            ],
            explanation: 'Sensors sense, the Arduino thinks, motors act.',
          },
          {
            id: 'q2',
            prompt: 'What happens after the robot acts?',
            multiple: false,
            hint: 'It is a loop.',
            options: [
              { id: 'a', text: 'It senses again', correct: true, feedback: 'Yes, the loop goes round and round.' },
              { id: 'b', text: 'It switches off', correct: false, feedback: 'It keeps going round the loop while it has power.' },
              { id: 'c', text: 'It waits for a person', correct: false, feedback: 'A robot works on its own. It goes straight back to sensing.' },
            ],
            explanation: 'Sense, Think, Act, then back to Sense.',
          },
          {
            id: 'q3',
            prompt: 'Which of these is an example of a robot sensing?',
            multiple: false,
            options: [
              { id: 'a', text: 'An IR sensor detecting black tape', correct: true, feedback: 'Correct, that is measuring the world.' },
              { id: 'b', text: 'A wheel turning faster', correct: false, feedback: 'That is acting.' },
              { id: 'c', text: 'An IF statement in the program', correct: false, feedback: 'That is thinking.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'r101-03-kit',
      title: 'Explore your robot kit',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'r101-v03',
      content: {
        version: 1,
        stage: 'understand',
        intro: 'Before you build, get to know every part. Tap each part of the robot to learn its name and its job, then test yourself.',
        objectives: [
          'Name the main parts of a line-following robot',
          'Say what job each part does',
          'Know which parts sense, which think and which act',
        ],
        blocks: [
          {
            type: 'kit',
            id: 'kit-explorer',
            title: 'Tap to explore',
            prompt: 'Tap every part to read about it. When you have seen them all, try the identification challenge.',
            quiz: true,
          },
          {
            type: 'text',
            heading: 'Your kit list',
            body: '- 1 × robot chassis (base plate) with screws\n- 2 × DC gear motors (yellow “BO” motors) and 2 × wheels\n- 1 × castor wheel (the small ball wheel at the front)\n- 1 × Arduino Uno and USB cable\n- 1 × L298N motor driver (red or blue board with a heat sink)\n- 2 × IR sensor modules (each with a small blue knob)\n- 1 × battery holder and batteries (for example 2 × 18650 cells, 7.4 V) with a switch\n- Jumper wires (male–female and male–male)',
          },
          {
            type: 'callout',
            tone: 'word',
            title: 'New words',
            body: '**Chassis:** the body that everything is fixed to.\n**Microcontroller:** a tiny computer on one chip. The Arduino Uno has one.\n**Motor driver:** a board that lets small signals control big motor currents.\n**Module:** a small ready-made board, like the IR sensor module.',
          },
          {
            type: 'match',
            id: 'part-jobs',
            title: 'Match the part to its job',
            prompt: 'Pick the job for each part.',
            pairs: [
              { id: 'p1', left: 'Arduino Uno', right: 'Runs the program and makes decisions' },
              { id: 'p2', left: 'L298N motor driver', right: 'Sends battery power to the motors when told' },
              { id: 'p3', left: 'IR sensor', right: 'Tells black from white on the floor' },
              { id: 'p4', left: 'DC gear motor', right: 'Turns a wheel' },
              { id: 'p5', left: 'Battery pack', right: 'Supplies energy for the whole robot' },
              { id: 'p6', left: 'Castor wheel', right: 'Balances the front so the robot can turn smoothly' },
            ],
            explanation: 'Sensors sense, the Arduino thinks, the driver and motors act, and the battery powers it all.',
          },
          {
            type: 'callout',
            tone: 'safety',
            title: 'Handle with care',
            body: 'Hold boards by their edges. The pins underneath are sharp, and static from your fingers can harm chips. Keep batteries away from metal tools and loose wires.',
          },
        ],
        summary: [
          'The chassis, motors and wheels are the body.',
          'Two IR sensors sense the line; the Arduino Uno decides.',
          'The L298N motor driver uses battery power to run the motors.',
        ],
        next: 'Next, discover how an IR sensor can tell black tape from a white floor using light you cannot see.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which part lets the Arduino control the motors safely?',
            multiple: false,
            options: [
              { id: 'a', text: 'L298N motor driver', correct: true, feedback: 'Right. It switches the large battery current the motors need.' },
              { id: 'b', text: 'IR sensor', correct: false, feedback: 'IR sensors look at the floor. They do not power anything.' },
              { id: 'c', text: 'Castor wheel', correct: false, feedback: 'The castor only supports the front of the robot.' },
            ],
          },
          {
            id: 'q2',
            prompt: 'How many IR sensors does your line-follower use?',
            multiple: false,
            options: [
              { id: 'a', text: 'Two, one on each side of the line', correct: true, feedback: 'Yes. Comparing left and right tells the robot which way to steer.' },
              { id: 'b', text: 'One in the middle', correct: false, feedback: 'One sensor can tell it has left the line, but not which side it went off.' },
              { id: 'c', text: 'None', correct: false, feedback: 'Without sensors the robot could not see the line.' },
            ],
          },
          {
            id: 'q3',
            prompt: 'Which part is the robot’s “brain”?',
            multiple: false,
            options: [
              { id: 'a', text: 'Arduino Uno', correct: true, feedback: 'Correct. Its microcontroller runs your program.' },
              { id: 'b', text: 'Battery pack', correct: false, feedback: 'The battery gives energy but makes no decisions.' },
              { id: 'c', text: 'Chassis', correct: false, feedback: 'The chassis is the body that holds everything.' },
            ],
          },
        ],
      },
      passPercent: 80,
    },
  ],
}
