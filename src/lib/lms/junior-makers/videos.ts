import { academySeries, withSeries } from '@/lib/lms/catalogue/build'
import { cp, type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

export const JUNIOR_MAKERS_SERIES = academySeries('Junior Makers', [], narrationTiming as NarrationTiming)

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 'j01',
    lessonSlug: 'jm-01-welcome',
    number: 1,
    title: 'Welcome: makers change how things behave',
    summary: ['Maker projects use circuits to react', 'Electricity needs a complete path'],
    next: 'Power, path and load.',
    scenes: [
      { kind: 'title', kicker: 'Welcome', title: 'Makers change how things behave', say: 'Welcome to Junior Makers from MyCampusView Academy! Makers build small systems that sense the world and react — a light that turns on, a buzzer that warns, a fan that cools.', chapter: 'Welcome' },
      { kind: 'points', title: 'Electronics around you', items: ['A torch', 'A doorbell', 'A night lamp', 'A washing-machine beep'], say: 'A torch, a doorbell, a night lamp and a washing-machine beep all use circuits: paths that electricity can follow to do a job.' },
      { kind: 'parts', title: 'Uses electricity?', items: [{ name: 'LED desk lamp', job: 'Needs electricity' }, { name: 'Wooden pencil', job: 'No circuit' }, { name: 'Phone vibration', job: 'Tiny motor, battery power' }], say: 'An LED lamp needs electricity. A wooden pencil does not. Your phone’s vibration uses a tiny motor and battery power.', chapter: 'Spotting circuits' },
    ],
    checkpoints: [
      cp('j01-c1', 1, 'A circuit is…', [['A path electricity can follow', true, 'Yes.'], ['A type of glue', false, 'Circuits are paths.']], 'Circuits are complete paths.'),
    ],
  },
  {
    id: 'j02',
    lessonSlug: 'jm-02-circuit',
    number: 2,
    title: 'Power, path and load',
    summary: ['Power, path and load make a circuit', 'Open circuits do not run'],
    next: 'Stay safe.',
    scenes: [
      { kind: 'title', kicker: 'Video 2', title: 'Power, path and load', say: 'Every simple circuit has a power source, a path of wires, and a load — the part that does the work.', chapter: 'Three parts' },
      { kind: 'parts', title: 'Match the job', items: [{ name: 'Battery', job: 'Provides power' }, { name: 'Wires', job: 'Make the path' }, { name: 'LED or buzzer', job: 'Does the useful work' }], say: 'The battery provides power. Wires make the path. An LED or buzzer is the load that does the useful work.' },
      { kind: 'points', title: 'Open or closed', items: ['Closed path: the load can run', 'Open path: a gap, so nothing runs', 'Unplugged wire = open circuit'], say: 'A closed path lets the load run. An open path has a gap, so nothing runs. An unplugged wire means an open circuit.', chapter: 'Open vs closed' },
    ],
    checkpoints: [
      cp('j02-c1', 1, 'The load in a circuit is…', [['The part that does the job', true, 'Correct.'], ['Only the switch', false, 'The load uses the energy.']], 'Loads use energy to work.'),
    ],
  },
  {
    id: 'j03',
    lessonSlug: 'jm-03-safety',
    number: 3,
    title: 'Stay safe',
    summary: ['Low-voltage kits still need care', 'Stop and ask when something seems wrong'],
    next: 'LEDs: light with a direction.',
    scenes: [
      { kind: 'title', kicker: 'Video 3', title: 'Stay safe', say: 'School kits use low voltage, but good habits still matter.', chapter: 'Safety' },
      { kind: 'steps', title: 'Maker safety', items: ['Never put wires in wall sockets', 'Keep drinks away from circuits', 'Ask an adult before mains power', 'Stop if something smells hot'], say: 'Never put kit wires in wall sockets. Keep drinks away from circuits. Ask an adult before connecting to mains power. Stop and check if something smells hot or odd.' },
      { kind: 'points', title: 'If the battery feels hot', items: ['Disconnect power', 'Tell an adult', 'Do not add more batteries'], say: 'If a battery pack feels very hot, disconnect power and tell an adult. Do not add another battery.', chapter: 'Heat warning' },
    ],
    checkpoints: [
      cp('j03-c1', 1, 'Kit wires in a wall socket are…', [['Never allowed', true, 'Correct.'], ['Recommended', false, 'Mains power is unsafe for kits.']], 'Never put kit wires in mains sockets.'),
    ],
  },
  {
    id: 'j04',
    lessonSlug: 'jm-04-led',
    number: 4,
    title: 'LEDs: light with a direction',
    summary: ['LEDs turn electricity into light', 'Direction, or polarity, matters'],
    next: 'Switches: open and close the path.',
    scenes: [
      { kind: 'title', kicker: 'Video 4', title: 'LEDs', say: 'An LED lights when current flows the correct way. Polarity matters.', chapter: 'LEDs' },
      { kind: 'points', title: 'Long leg, short leg', items: ['Longer leg often means positive', 'Wrong way around: stays dark', 'Dark LED can be a useful clue'], say: 'Many LED kits use the longer leg for the positive side. If it is the wrong way around, it stays dark — that is a useful clue when debugging.' },
      { kind: 'points', title: 'Resistors', items: ['A resistor limits current', 'It protects the LED', 'Follow your kit diagram'], say: 'A resistor limits current so the LED does not burn out. Your teacher’s kit diagram will show where it goes.', chapter: 'Protection' },
    ],
    checkpoints: [
      cp('j04-c1', 1, 'If an LED is reversed it usually…', [['Stays off', true, 'Yes.'], ['Changes colour forever', false, 'Wrong polarity means no light.']], 'Wrong polarity means no light.'),
    ],
  },
  {
    id: 'j05',
    lessonSlug: 'jm-05-switch',
    number: 5,
    title: 'Switches: open and close the path',
    summary: ['Switches control whether the path is complete', 'On often means a closed path'],
    next: 'Sensors: notice light, touch, distance.',
    scenes: [
      { kind: 'title', kicker: 'Video 5', title: 'Switches', say: 'A switch is a controllable gap in the circuit.', chapter: 'Switches' },
      { kind: 'steps', title: 'Torch sequence', items: ['Press the switch', 'The path becomes complete', 'Current reaches the LED', 'Light appears'], say: 'Press the switch. The path becomes complete. Current reaches the LED. Light appears.' },
      { kind: 'points', title: 'Remember', items: ['Open switch: gap', 'Closed switch: path connected', 'You control the gap'], say: 'An open switch leaves a gap. A closed switch connects the path. You control that gap.', chapter: 'Open vs closed' },
    ],
    checkpoints: [
      cp('j05-c1', 1, 'A switch mainly…', [['Opens or closes the path', true, 'Correct.'], ['Stores music', false, 'Switches control the path.']], 'Switches control the path.'),
    ],
  },
  {
    id: 'j06',
    lessonSlug: 'jm-06-sensors',
    number: 6,
    title: 'Sensors: notice light, touch, distance',
    summary: ['Sensors notice; actuators act', 'Pair a sensor with a clear reaction'],
    next: 'Plan: who does it help?',
    scenes: [
      { kind: 'title', kicker: 'Video 6', title: 'Sensors', say: 'Sensors turn something in the world into a signal a circuit can use.', chapter: 'Sensing' },
      { kind: 'parts', title: 'Sensor jobs', items: [{ name: 'Light sensor', job: 'Night lamp in the dark' }, { name: 'Touch or button', job: 'Doorbell starts the buzzer' }, { name: 'Distance sensor', job: 'Robot slows before a wall' }], say: 'A light sensor can turn on a night lamp in the dark. A button can start a doorbell buzzer. A distance sensor can help a robot slow before a wall.' },
      { kind: 'points', title: 'Later course', items: ['Robotics 101 wires IR sensors', 'Motors become actuators', 'Sense, think, act'], say: 'In Robotics 101 you will wire infrared sensors and motors on a real line-follower. This course builds the vocabulary first: sense, think, act.', chapter: 'Next steps' },
    ],
    checkpoints: [
      cp('j06-c1', 1, 'A sensor’s job is to…', [['Notice something in the world', true, 'Yes.'], ['Only make noise', false, 'Sensors detect.']], 'Sensors detect; other parts act.'),
    ],
  },
  {
    id: 'j07',
    lessonSlug: 'jm-07-plan',
    number: 7,
    title: 'Plan: who does it help?',
    summary: ['Purpose first, parts second', 'A sketch catches missing wires early'],
    next: 'Project: sense-and-react gadget.',
    scenes: [
      { kind: 'title', kicker: 'Video 7', title: 'Plan your project', say: 'Start with a person and a problem, then pick parts.', chapter: 'Planning' },
      { kind: 'parts', title: 'Example goals', items: [{ name: 'Desk reminder', job: 'Pack my bag' }, { name: 'Cupboard alarm', job: 'Warn when the door opens' }, { name: 'Hallway night light', job: 'Light the path' }], say: 'Example goals: a desk lamp that reminds you to pack your bag, a buzzer when a cupboard opens, or a night light for a hallway.' },
      { kind: 'steps', title: 'Planning checklist', items: ['Name who it helps', 'Choose a sensor or switch', 'Choose a light or sound output', 'Sketch the path on paper'], say: 'Name who it helps. Choose a sensor or switch. Choose a light or sound output. Sketch the path on paper.', chapter: 'Checklist' },
    ],
    checkpoints: [
      cp('j07-c1', 1, 'A good project plan starts with…', [['Who it helps and what problem it solves', true, 'Correct.'], ['Buying every sensor', false, 'Purpose guides parts.']], 'Purpose guides part choices.'),
    ],
  },
  {
    id: 'j08',
    lessonSlug: 'jm-08-project',
    number: 8,
    title: 'Project: sense-and-react gadget',
    summary: ['Prototypes prove the idea', 'Labels show you understand the circuit'],
    next: 'Test like a maker.',
    scenes: [
      { kind: 'title', kicker: 'Video 8', title: 'Build your gadget', say: 'Build, or carefully simulate on paper, a gadget that senses something and reacts with light or sound.', chapter: 'Build' },
      { kind: 'parts', title: 'Choose one', items: [{ name: 'Night light', job: 'Sense darkness' }, { name: 'Cupboard alarm', job: 'Sense a door' }, { name: 'Bag packed reminder', job: 'Sense a button press' }], say: 'Choose a night light, a cupboard alarm, or a bag-packed reminder. Use your school kit if you have one, or submit a labelled diagram.' },
      { kind: 'points', title: 'What teachers look for', items: ['Clear labels: power, switch, load', 'A stated first test', 'Honest limits'], say: 'Teachers look for clear labels — power, switch or sensor, and load — plus what you would test first.', chapter: 'Quality' },
    ],
    checkpoints: [
      cp('j08-c1', 1, 'A paper prototype should still show…', [['Power, switch or sensor, and load', true, 'Yes.'], ['Only a logo', false, 'Labels matter.']], 'Labels prove understanding.'),
    ],
  },
  {
    id: 'j09',
    lessonSlug: 'jm-09-test',
    number: 9,
    title: 'Test like a maker',
    summary: ['One change at a time finds bugs faster', 'Write down what you tried'],
    next: 'Junior Makers check.',
    scenes: [
      { kind: 'title', kicker: 'Video 9', title: 'Test like a maker', say: 'Testing means changing one thing at a time and watching what happens.', chapter: 'Testing' },
      { kind: 'steps', title: 'A simple test loop', items: ['Predict what should happen', 'Try exactly one change', 'Observe the result', 'Fix power, polarity or loose wires'], say: 'Predict what should happen. Try exactly one change. Observe. If it fails, check power, polarity and loose wires.' },
      { kind: 'points', title: 'Habit', items: ['One change at a time', 'Write what you tried', 'Celebrate fixes'], say: 'One change at a time finds causes faster. Write down what you tried.', chapter: 'Habits' },
    ],
    checkpoints: [
      cp('j09-c1', 1, 'When testing, change…', [['One thing at a time', true, 'Correct.'], ['Everything at once', false, 'Single changes reveal causes.']], 'Single changes reveal causes.'),
    ],
  },
  {
    id: 'j10',
    lessonSlug: 'jm-10-quiz',
    number: 10,
    title: 'Junior Makers check',
    summary: ['You are ready for richer kits and Robotics 101', 'Keep practising safe habits'],
    next: 'Try Robotics 101: Build a line-follower next.',
    scenes: [
      { kind: 'title', kicker: 'Video 10', title: 'Course check', say: 'A short recap before your quiz: circuits, safety and sensors.', chapter: 'Recap' },
      { kind: 'points', title: 'You can now', items: ['Name power, path and load', 'Use a switch safely', 'Pair a sensor with a reaction'], say: 'You can name power, path and load, use a switch safely, and pair a sensor with a reaction.' },
      { kind: 'points', title: 'Next', items: ['Robotics 101 for a line-follower', 'Keep the safety rules', 'Keep sketching before you wire'], say: 'Next, try Robotics 101 for a line-follower. Keep the safety rules, and keep sketching before you wire.', chapter: 'Next' },
    ],
    checkpoints: [
      cp('j10-c1', 1, 'Power, path and load describe…', [['A simple circuit', true, 'Yes.'], ['Only software', false, 'Those three make a basic circuit.']], 'Those three make a basic circuit.'),
    ],
  },
]

export const JUNIOR_MAKERS_VIDEOS: VideoDef[] = withSeries(JUNIOR_MAKERS_SERIES, RAW)
