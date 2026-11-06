import type { HazardValue, ItemCategoryValue, LabTemplate, TemplateItem, TemplatePractical } from '../types'

/**
 * Robotics & AI lab (Classes VI–XII). CBSE has no lab SOP for this yet, so the
 * equipment list follows the NITI Aayog Atal Tinkering Lab guidelines and the
 * practicals follow the CBSE AI (417 / 843) and Coding curricula. Quantities
 * are for a batch of 40 working in groups of four.
 */

function nc(code: string, name: string, required: number, unit: string, category: ItemCategoryValue, note?: string): TemplateItem {
  return { code, name, required, unit, category, kind: 'NON_CONSUMABLE', sopList: 'NON_CONSUMABLE', note }
}

function cons(code: string, name: string, required: number, unit: string, hazards?: HazardValue[]): TemplateItem {
  return { code, name, required, unit, category: 'CONSUMABLE', kind: 'CONSUMABLE', sopList: 'CONSUMABLE', hazards }
}

function safety(code: string, name: string, required: number, unit: string, kind: TemplateItem['kind'] = 'NON_CONSUMABLE'): TemplateItem {
  return { code, name, required, unit, category: 'SAFETY', kind, sopList: 'SAFETY' }
}

const ITEMS: TemplateItem[] = [
  // Computing
  nc('COMPUTER', 'Computers / laptops with programming software', 20, 'pcs', 'EQUIPMENT', 'One per two students.'),
  nc('PROJECTOR', 'Projector or interactive panel', 1, 'pcs', 'EQUIPMENT'),
  nc('WEBCAM', 'USB webcam', 5, 'pcs', 'EQUIPMENT'),
  nc('MIC_SPEAKER', 'USB microphone and speaker set', 5, 'sets', 'EQUIPMENT'),
  nc('PRINTER_3D', '3D printer', 1, 'pcs', 'EQUIPMENT'),
  nc('USB_CABLE', 'USB programming cables', 20, 'pcs', 'EQUIPMENT'),
  nc('MICRO_SD', 'Micro SD cards (16 GB+)', 10, 'pcs', 'EQUIPMENT'),
  nc('VR_HEADSET', 'VR headset', 0, 'pcs', 'EQUIPMENT', 'Recommended, not required.'),

  // Boards and electronics
  nc('ARDUINO_UNO', 'Arduino Uno (or compatible) boards', 20, 'pcs', 'INSTRUMENT'),
  nc('ESP32', 'ESP32 Wi-Fi boards', 10, 'pcs', 'INSTRUMENT'),
  nc('RASPBERRY_PI', 'Raspberry Pi with power supply', 5, 'pcs', 'INSTRUMENT'),
  nc('MICROBIT', 'BBC micro:bit', 10, 'pcs', 'INSTRUMENT'),
  nc('BREADBOARD', 'Breadboards', 20, 'pcs', 'APPARATUS'),
  nc('STARTER_KIT', 'Electronics starter kit (components box)', 10, 'kits', 'APPARATUS'),
  nc('MULTIMETER', 'Digital multimeter', 10, 'pcs', 'INSTRUMENT'),
  nc('BENCH_PSU', 'Variable DC bench power supply', 2, 'pcs', 'INSTRUMENT'),
  nc('OSCILLOSCOPE', 'Digital oscilloscope', 1, 'pcs', 'INSTRUMENT'),
  nc('SOLDERING_STATION', 'Temperature-controlled soldering station', 5, 'pcs', 'APPARATUS'),
  nc('HELPING_HANDS', 'Helping hands with magnifier', 5, 'pcs', 'APPARATUS'),
  nc('HOT_GLUE_GUN', 'Hot glue gun', 5, 'pcs', 'APPARATUS'),
  nc('BATTERY_CHARGER', 'Smart Li-ion / LiPo battery charger', 2, 'pcs', 'APPARATUS'),

  // Robotics
  nc('ROBOT_KIT', 'Educational robotics kit (chassis, motors, controller)', 10, 'kits', 'APPARATUS'),
  nc('DC_GEAR_MOTOR', 'DC gear motors with wheels', 20, 'pcs', 'APPARATUS'),
  nc('SERVO_MOTOR', 'Servo motors (SG90 / MG995)', 20, 'pcs', 'APPARATUS'),
  nc('STEPPER_MOTOR', 'Stepper motor with driver', 5, 'pcs', 'APPARATUS'),
  nc('MOTOR_DRIVER', 'Motor driver modules (L298N)', 10, 'pcs', 'APPARATUS'),
  nc('ROBOTIC_ARM', 'Robotic arm kit', 2, 'kits', 'APPARATUS'),
  nc('DRONE_KIT', 'Educational drone kit', 0, 'kits', 'APPARATUS', 'Recommended, not required.'),

  // Sensors, displays and modules
  nc('SENSOR_KIT', 'Sensor kit (37-in-1 or similar)', 10, 'kits', 'INSTRUMENT'),
  nc('ULTRASONIC', 'Ultrasonic distance sensors', 10, 'pcs', 'INSTRUMENT'),
  nc('IR_SENSOR', 'IR obstacle / line sensors', 20, 'pcs', 'INSTRUMENT'),
  nc('DHT11', 'Temperature and humidity sensors', 10, 'pcs', 'INSTRUMENT'),
  nc('PIR_SENSOR', 'PIR motion sensors', 5, 'pcs', 'INSTRUMENT'),
  nc('SOIL_MOISTURE', 'Soil moisture sensors', 5, 'pcs', 'INSTRUMENT'),
  nc('GAS_SENSOR', 'Gas / smoke sensors (MQ series)', 5, 'pcs', 'INSTRUMENT'),
  nc('CAMERA_MODULE', 'Raspberry Pi camera modules', 5, 'pcs', 'INSTRUMENT'),
  nc('AI_VISION_KIT', 'AI vision camera kit (on-device recognition)', 2, 'kits', 'INSTRUMENT'),
  nc('LCD_DISPLAY', '16×2 LCD displays', 10, 'pcs', 'APPARATUS'),
  nc('OLED_DISPLAY', 'OLED displays', 5, 'pcs', 'APPARATUS'),
  nc('BLUETOOTH', 'Bluetooth modules (HC-05)', 10, 'pcs', 'APPARATUS'),
  nc('RFID_KIT', 'RFID reader kits', 5, 'kits', 'APPARATUS'),
  nc('RELAY', 'Relay modules', 10, 'pcs', 'APPARATUS'),
  nc('KEYPAD', 'Keypads', 5, 'pcs', 'APPARATUS'),

  // Tools
  nc('TOOL_KIT', 'Hand tool kit (screwdrivers, pliers, spanners)', 5, 'kits', 'APPARATUS'),
  nc('WIRE_STRIPPER', 'Wire stripper and cutter', 5, 'pcs', 'APPARATUS'),
  nc('CORDLESS_DRILL', 'Cordless drill with bits', 1, 'pcs', 'APPARATUS'),
  nc('VERNIER', 'Digital vernier caliper', 5, 'pcs', 'INSTRUMENT'),
  nc('STEEL_RULE', 'Steel rule and measuring tape', 10, 'pcs', 'APPARATUS'),
  nc('BENCH_VICE', 'Bench vice', 2, 'pcs', 'APPARATUS'),
  nc('HACKSAW', 'Hacksaw', 2, 'pcs', 'APPARATUS'),

  // Charts
  nc('CHART_COMPONENTS', 'Electronic components identification chart', 1, 'pcs', 'CHART'),
  nc('CHART_AI', 'AI project cycle chart', 1, 'pcs', 'CHART'),

  // Consumables
  cons('JUMPER_WIRES', 'Jumper wires (M-M, M-F, F-F)', 20, 'packs'),
  cons('LED', 'LEDs, assorted colours', 200, 'pcs'),
  cons('RESISTORS', 'Resistors, assorted values', 500, 'pcs'),
  cons('CAPACITORS', 'Capacitors, assorted', 100, 'pcs'),
  cons('TRANSISTORS', 'Transistors, assorted', 50, 'pcs'),
  cons('PUSH_BUTTONS', 'Push buttons and switches', 100, 'pcs'),
  cons('BUZZERS', 'Buzzers', 20, 'pcs'),
  cons('LDR', 'Light-dependent resistors', 20, 'pcs'),
  cons('POTENTIOMETER', 'Potentiometers', 20, 'pcs'),
  cons('PCB_BOARD', 'General-purpose PCBs', 20, 'pcs'),
  cons('SOLDER_WIRE', 'Lead-free solder wire', 5, 'rolls', ['IRRITANT']),
  cons('SOLDER_FLUX', 'Soldering flux', 2, 'tins', ['IRRITANT']),
  cons('DESOLDER_WICK', 'Desoldering wick', 5, 'pcs'),
  cons('GLUE_STICKS', 'Hot glue sticks', 100, 'pcs'),
  cons('PLA_FILAMENT', 'PLA filament (1 kg spools)', 5, 'spools'),
  cons('AA_BATTERIES', 'AA batteries', 40, 'pcs'),
  cons('BATTERY_9V', '9 V batteries', 20, 'pcs'),
  cons('LI_ION_18650', '18650 Li-ion cells', 20, 'pcs', ['FLAMMABLE']),
  cons('LIPO_BATTERY', 'LiPo battery packs', 5, 'pcs', ['FLAMMABLE']),
  cons('ISOPROPYL', 'Isopropyl alcohol (board cleaning)', 1, 'litres', ['FLAMMABLE']),
  cons('INSULATION_TAPE', 'Insulation tape', 10, 'rolls'),
  cons('HEAT_SHRINK', 'Heat-shrink tubing', 2, 'packs'),
  cons('CABLE_TIES', 'Cable ties', 2, 'packs'),
  cons('SCREWS_NUTS', 'Screws, nuts and spacers assortment', 2, 'boxes'),
  cons('CRAFT_SHEETS', 'Cardboard and craft sheets for prototypes', 50, 'sheets'),

  // Safety
  safety('FIRE_EXT', 'Fire extinguisher for electrical fires (CO₂ / ABC)', 1, 'pcs'),
  safety('FIRST_AID', 'First aid kit (with burn gel)', 2, 'kits'),
  safety('SAFETY_GOGGLES', 'Safety goggles for soldering and cutting', 10, 'pairs'),
  safety('FUME_EXTRACTOR', 'Solder fume extractor', 2, 'pcs'),
  safety('ESD_STRAPS', 'Anti-static mats and wrist straps', 10, 'sets'),
  safety('LIPO_BAG', 'Fire-proof LiPo charging bags', 2, 'pcs'),
  safety('SAND_BUCKET', 'Sand bucket for battery fires', 1, 'pcs'),
  safety('HEAT_MATS', 'Heat-resistant silicone mats', 5, 'pcs'),
]

function p(
  code: string,
  classNumber: number,
  subject: TemplatePractical['subject'],
  title: string,
  aim: string,
  apparatus: [string, number][],
  safetyNote?: string,
): TemplatePractical {
  return { code, classNumber, subject, title, aim, apparatus: apparatus.map(([itemCode, qty]) => ({ itemCode, qty })), safety: safetyNote }
}

const PRACTICALS: TemplatePractical[] = [
  // Class 6
  p('RA6-FIRST-CIRCUIT', 6, 'Electronics', 'My first circuit', 'Light an LED with a battery, switch and resistor on a breadboard.', [['BREADBOARD', 10], ['LED', 10], ['RESISTORS', 10], ['PUSH_BUTTONS', 10]]),
  p('RA6-BLOCK-CODING', 6, 'Coding', 'Block coding: an animated story', 'Plan and code a short animated story using sequence, loops and events.', [['COMPUTER', 20]]),
  p('RA6-AI-AROUND-US', 6, 'AI', 'AI around us', 'Identify AI in everyday devices and sort smart from non-smart machines.', [['COMPUTER', 20], ['PROJECTOR', 1]]),
  p('RA6-MICROBIT', 6, 'Robotics', 'Sensing the world', 'Use the micro:bit light, temperature and button sensors to make a simple alarm.', [['MICROBIT', 10], ['USB_CABLE', 10]]),

  // Class 7
  p('RA7-SERIES-PARALLEL', 7, 'Electronics', 'Series and parallel circuits', 'Build series and parallel LED circuits and measure voltage and current with a multimeter.', [['BREADBOARD', 10], ['LED', 20], ['RESISTORS', 20], ['MULTIMETER', 10]]),
  p('RA7-BLINK', 7, 'Coding', 'Program an LED to blink', 'Write and upload an Arduino sketch that blinks an LED and changes its timing.', [['ARDUINO_UNO', 10], ['BREADBOARD', 10], ['LED', 10], ['RESISTORS', 10], ['USB_CABLE', 10], ['COMPUTER', 10]]),
  p('RA7-IMAGE-CLASSIFIER', 7, 'AI', 'Train an image classifier', 'Collect images with a webcam and train a no-code model to tell two objects apart.', [['COMPUTER', 20], ['WEBCAM', 5]]),
  p('RA7-MOTOR', 7, 'Robotics', 'Make a motor spin', 'Control the speed and direction of a DC motor through a motor driver.', [['ARDUINO_UNO', 10], ['MOTOR_DRIVER', 10], ['DC_GEAR_MOTOR', 10]]),

  // Class 8
  p('RA8-LINE-FOLLOWER', 8, 'Robotics', 'Line-following robot', 'Assemble a robot that follows a black line using IR sensors.', [['ROBOT_KIT', 10], ['IR_SENSOR', 20], ['ARDUINO_UNO', 10], ['AA_BATTERIES', 8]]),
  p('RA8-OBSTACLE', 8, 'Robotics', 'Obstacle-avoiding robot', 'Program a robot to detect and steer around obstacles with an ultrasonic sensor.', [['ROBOT_KIT', 10], ['ULTRASONIC', 10], ['ARDUINO_UNO', 10]]),
  p('RA8-SOLDERING', 8, 'Electronics', 'Soldering basics', 'Solder an LED and resistor onto a PCB to make a working badge.', [['SOLDERING_STATION', 5], ['HELPING_HANDS', 5], ['PCB_BOARD', 10], ['LED', 10], ['RESISTORS', 10], ['SOLDER_WIRE', 0.2], ['SAFETY_GOGGLES', 10], ['FUME_EXTRACTOR', 2]], 'Goggles on; the iron goes back in its stand every time; switch on the fume extractor.'),
  p('RA8-CHATBOT', 8, 'AI', 'Build a rule-based chatbot', 'Design conversation rules and build a chatbot that answers questions about the school.', [['COMPUTER', 20]]),

  // Class 9
  p('RA9-PROJECT-CYCLE', 9, 'AI', 'AI project cycle: problem scoping', 'Scope a real school problem with the 4Ws canvas and plan data, model and evaluation.', [['COMPUTER', 20], ['CHART_AI', 1]]),
  p('RA9-DATA', 9, 'AI', 'Data acquisition and visualisation', 'Collect a class data set and explore it with charts in a spreadsheet.', [['COMPUTER', 20]]),
  p('RA9-PYTHON', 9, 'Coding', 'Python basics', 'Write Python programs with variables, conditions, loops and lists.', [['COMPUTER', 20]]),
  p('RA9-WEATHER', 9, 'Electronics', 'Weather station', 'Read temperature and humidity and show them on an LCD.', [['ARDUINO_UNO', 10], ['DHT11', 10], ['LCD_DISPLAY', 10], ['BREADBOARD', 10]]),
  p('RA9-SMART-HOME', 9, 'Robotics', 'Smart home with Bluetooth', 'Switch a lamp on and off from a phone using Bluetooth and a relay.', [['ARDUINO_UNO', 10], ['BLUETOOTH', 10], ['RELAY', 10]], 'Only low-voltage loads; mains wiring is done by the teacher.'),

  // Class 10
  p('RA10-COMPUTER-VISION', 10, 'AI', 'Computer vision: detecting faces', 'Detect faces and objects in a webcam feed with Python and OpenCV.', [['COMPUTER', 20], ['WEBCAM', 5]]),
  p('RA10-NLP', 10, 'AI', 'Natural language processing: sentiment', 'Classify short reviews as positive or negative and explain the result.', [['COMPUTER', 20]]),
  p('RA10-EVALUATION', 10, 'AI', 'Evaluating a model', 'Build a confusion matrix and calculate accuracy, precision and recall for a classifier.', [['COMPUTER', 20]]),
  p('RA10-ROBOTIC-ARM', 10, 'Robotics', 'Servo-controlled robotic arm', 'Assemble and program a robotic arm to pick and place an object.', [['ROBOTIC_ARM', 2], ['SERVO_MOTOR', 8], ['ARDUINO_UNO', 2]]),
  p('RA10-3D-PRINT', 10, 'Robotics', 'Design and print a part', 'Model a robot part in 3D CAD software and print it.', [['COMPUTER', 20], ['PRINTER_3D', 1], ['PLA_FILAMENT', 0.1], ['VERNIER', 5]], 'Do not touch the nozzle or bed while printing.'),

  // Class 11
  p('RA11-REGRESSION', 11, 'AI', 'Linear regression in Python', 'Fit and test a linear regression model on a real data set.', [['COMPUTER', 20]]),
  p('RA11-IOT', 11, 'Electronics', 'IoT sensor dashboard', 'Send sensor readings from an ESP32 to an online dashboard over Wi-Fi.', [['ESP32', 10], ['DHT11', 10], ['SOIL_MOISTURE', 5]]),
  p('RA11-EDGE-AI', 11, 'AI', 'Image classification on a Raspberry Pi', 'Run a trained image model on a Raspberry Pi camera feed.', [['RASPBERRY_PI', 5], ['CAMERA_MODULE', 5], ['MICRO_SD', 5]]),
  p('RA11-ETHICS', 11, 'AI', 'AI ethics and bias', 'Audit a data set for bias and propose ways to make the model fairer.', [['COMPUTER', 20]]),

  // Class 12
  p('RA12-CAPSTONE', 12, 'AI', 'Capstone project', 'Solve a school or community problem end to end with an AI model and present it.', [['COMPUTER', 20]]),
  p('RA12-AUTONOMOUS', 12, 'Robotics', 'Autonomous robot with sensor fusion', 'Combine ultrasonic and IR sensors so a robot navigates a maze on its own.', [['ROBOT_KIT', 10], ['ULTRASONIC', 10], ['IR_SENSOR', 20], ['ESP32', 10]]),
  p('RA12-VOICE', 12, 'AI', 'Voice assistant', 'Build a voice assistant that recognises speech and answers simple commands.', [['RASPBERRY_PI', 5], ['MIC_SPEAKER', 5]]),
  p('RA12-PID', 12, 'Robotics', 'PID control', 'Tune a PID controller so a line-following robot runs smoothly at speed.', [['ROBOT_KIT', 10], ['IR_SENSOR', 20]], 'Charge LiPo packs only in the fire-proof bag and never unattended.'),
]

export const roboticsAi: LabTemplate = {
  code: 'ROBOTICS_AI',
  labType: 'ROBOTICS_AI',
  name: 'Robotics & AI Lab (Classes VI–XII)',
  source: 'NITI Aayog Atal Tinkering Lab guidelines and the CBSE AI and Coding curricula',
  batchSize: 40,
  sectionLabels: { equipment: 'Computers, kits & tools', consumables: 'Components & consumables' },

  infrastructure: [
    { code: 'AREA', group: 'Room', label: 'Lab area (ATL guideline 1,000–1,500 sq ft)', min: 1000, unit: 'sq ft' },
    { code: 'DOORS', group: 'Room', label: 'Exits kept clear for an emergency', min: 2, unit: 'doors' },
    { code: 'WORK_TABLES', group: 'Room', label: 'Group work tables (one per four students)', min: 10, unit: 'tables' },
    { code: 'SEATING', group: 'Room', label: 'Chairs or stools', min: 40, unit: 'seats' },
    { code: 'COMPUTERS', group: 'Computing', label: 'Computers with programming software (one per two students)', min: 20, unit: 'computers' },
    { code: 'INTERNET', group: 'Computing', label: 'Broadband internet and Wi-Fi' },
    { code: 'PROJECTOR', group: 'Computing', label: 'Projector or interactive panel' },
    { code: 'SOFTWARE', group: 'Computing', label: 'Block coding, Arduino IDE, Python and AI tools installed' },
    { code: 'LOCKABLE_STORAGE', group: 'Storage', label: 'Lockable cabinets with labelled bins for components' },
    { code: 'BATTERY_STORAGE', group: 'Storage', label: 'Batteries stored in a fire-safe container away from heat' },
    { code: 'KIT_REGISTER', group: 'Storage', label: 'Kits numbered and issued against a register' },
    { code: 'SOCKETS', group: 'Utilities', label: 'Power sockets at the work tables', min: 10, unit: 'points' },
    { code: 'RCCB', group: 'Utilities', label: 'Earth-leakage breaker (RCCB) on the lab circuit' },
    { code: 'VENTILATION', group: 'Utilities', label: 'Ventilation or extraction for soldering fumes' },
    { code: 'UPS', group: 'Utilities', label: 'Power backup for computers (UPS / inverter)' },
    { code: 'BOARD_DOS', group: 'Display', label: "Display board: Do's and Don'ts" },
    { code: 'BOARD_PRACTICALS', group: 'Display', label: 'Display board: list of activities' },
    { code: 'BOARD_TIMETABLE', group: 'Display', label: 'Display board: lab timetable' },
    { code: 'BOARD_EMERGENCY', group: 'Display', label: 'Display board: emergency contact numbers' },
    { code: 'PROJECT_DISPLAY', group: 'Display', label: 'Display area for student projects' },
    { code: 'FIRE_EXT', group: 'Safety', label: 'Fire extinguisher for electrical fires (CO₂ / ABC)', min: 1, unit: 'extinguishers' },
    { code: 'FIRST_AID', group: 'Safety', label: 'First aid kits', min: 2, unit: 'kits' },
    { code: 'SOLDER_ZONE', group: 'Safety', label: 'Separate soldering zone with heat-resistant mats' },
    { code: 'CHARGING_STATION', group: 'Safety', label: 'Battery charging station on a non-flammable surface' },
    { code: 'EWASTE_BIN', group: 'Waste', label: 'Separate e-waste bin' },
    { code: 'BATTERY_BIN', group: 'Waste', label: 'Separate bin for used batteries' },
  ],

  items: ITEMS,

  inspections: [
    {
      type: 'DAILY',
      label: 'Daily close-down check',
      everyDays: 1,
      items: [
        { code: 'POWER_OFF', label: 'Computers, chargers, soldering irons and 3D printer switched off' },
        { code: 'IRONS_COOL', label: 'Soldering irons cooled and back in their stands' },
        { code: 'BATTERIES_STORED', label: 'Batteries removed from robots and stored in the fire-safe container' },
        { code: 'KITS_COUNTED', label: 'Kits and boards counted back against the issue register' },
        { code: 'BENCHES_CLEAR', label: 'Benches clear of wire offcuts and solder' },
        { code: 'LOCKED', label: 'Cabinets and lab locked' },
      ],
    },
    {
      type: 'MONTHLY',
      label: 'Monthly safety and equipment check',
      everyDays: 30,
      items: [
        { code: 'EXT_PRESSURE', label: 'Fire extinguisher pressure gauge in green and within refill date' },
        { code: 'FIRST_AID_STOCKED', label: 'First aid kits stocked, including burn gel' },
        { code: 'EXITS_CLEAR', label: 'Exits and walkways unobstructed' },
        { code: 'FUME_EXTRACTOR', label: 'Fume extractors and ventilation working' },
        { code: 'BATTERY_CHECK', label: 'Swollen, leaking or damaged batteries removed' },
        { code: 'CABLES', label: 'Power strips, chargers and cables free of damage' },
        { code: 'PRINTER_3D', label: '3D printer nozzle, bed and enclosure checked' },
        { code: 'BOARDS_UP', label: "Do's and don'ts, activity list, timetable and emergency numbers displayed" },
      ],
    },
    {
      type: 'QUARTERLY',
      label: 'Quarterly electrical and battery audit',
      everyDays: 90,
      items: [
        { code: 'WIRING', label: 'Wiring, switches and sockets inspected for exposed or loose parts' },
        { code: 'EARTHING', label: 'Earthing checked' },
        { code: 'RCCB_TEST', label: 'RCCB trip-tested' },
        { code: 'NO_OVERLOAD', label: 'No daisy-chained power strips or overloaded sockets' },
        { code: 'CHARGERS', label: 'Chargers and bench power supplies inspected' },
        { code: 'SOFTWARE', label: 'Software updated, antivirus current, student accounts reviewed' },
        { code: 'DRILL', label: 'Fire / evacuation drill conducted with students' },
      ],
    },
  ],

  safetyProvisions: [
    'Fire extinguisher suitable for electrical fires, and a sand bucket for battery fires.',
    'Earth-leakage breaker (RCCB) on the lab circuit; sockets never overloaded.',
    'Separate soldering zone with fume extraction, heat-resistant mats and goggles.',
    'Lithium batteries charged in fire-proof bags on a non-flammable surface, never unattended.',
    'Kits and boards issued and returned against a register.',
    'E-waste and used batteries collected separately for authorised recycling.',
    'All work supervised by the teacher or lab instructor.',
    'First aid kits with burn gel available and stocked.',
  ],

  studentRules: [
    'Enter the lab only in the presence of the teacher or lab instructor.',
    'Sign out every kit, board and tool you take, and return it before you leave.',
    'Check with the teacher before connecting any circuit to power.',
    'Never work on a circuit while it is powered on.',
    'Wear goggles when soldering, cutting or drilling.',
    'Return the soldering iron to its stand every time you put it down.',
    'Never touch the tip of a soldering iron or the nozzle of the 3D printer.',
    'Charge batteries only at the charging station and report any swollen battery at once.',
    'Never short-circuit a battery or connect it the wrong way round.',
    'Handle boards by their edges; do not touch the components.',
    'Keep food and drink away from computers and electronics.',
    'Use only your own login; do not install software or change settings.',
    'Report every injury, burn, damage or strange smell to the teacher immediately.',
    'Put wire offcuts, dead components and batteries in the right bins.',
    'Switch off and tidy your table before you leave.',
    'Know where the fire extinguisher, first aid kit and exits are.',
  ],

  dos: [
    'Sign kits out and back in',
    'Check your circuit before switching on',
    'Wear goggles when soldering',
    'Put the soldering iron back in its stand',
    'Report swollen batteries at once',
    'Keep cables tidy and off the floor',
    'Switch off and tidy up before you leave',
  ],

  donts: [
    "Don't work on a powered circuit",
    "Don't touch hot irons or printer nozzles",
    "Don't short-circuit batteries",
    "Don't eat or drink near electronics",
    "Don't install software or share logins",
    "Don't leave chargers unattended",
    "Don't take parts out of the lab",
  ],

  practicals: PRACTICALS,
}
