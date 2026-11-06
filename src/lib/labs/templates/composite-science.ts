import type {
  HazardValue,
  ItemCategoryValue,
  LabTemplate,
  SopList,
  TemplateItem,
  TemplatePractical,
} from '../types'

/**
 * CBSE "Standard Operating Procedure for Composite Science Laboratory"
 * (Classes VI–X). Quantities are for a batch of 40 students, as in the SOP.
 */

function nc(code: string, name: string, required: number, unit: string, category: ItemCategoryValue, note?: string): TemplateItem {
  return { code, name, required, unit, category, kind: 'NON_CONSUMABLE', sopList: 'NON_CONSUMABLE', note }
}

function cons(
  code: string,
  name: string,
  required: number,
  unit: string,
  category: ItemCategoryValue,
  hazards?: HazardValue[],
  sopList: SopList = 'CONSUMABLE',
): TemplateItem {
  return { code, name, required, unit, category, kind: 'CONSUMABLE', sopList, hazards }
}

function specimen(code: string, name: string, required: number): TemplateItem {
  return { code, name, required, unit: 'pcs', category: 'SPECIMEN', kind: 'NON_CONSUMABLE', sopList: 'SPECIMEN' }
}

function slide(code: string, name: string): TemplateItem {
  return { code, name, required: 2, unit: 'slides', category: 'SLIDE', kind: 'NON_CONSUMABLE', sopList: 'SLIDE' }
}

const ITEMS: TemplateItem[] = [
  // (a) Non-consumables
  nc('MICROSCOPE', 'Microscope', 10, 'pcs', 'INSTRUMENT'),
  nc('TEST_TUBE', 'Test tubes', 10, 'pcs', 'GLASSWARE'),
  nc('BOILING_TUBE', 'Boiling tubes', 20, 'pcs', 'GLASSWARE'),
  nc('BEAKER_100', 'Beaker 100 ml', 10, 'pcs', 'GLASSWARE'),
  nc('BEAKER_500', 'Beaker 500 ml', 5, 'pcs', 'GLASSWARE'),
  nc('CONICAL_FLASK', 'Conical flask', 5, 'pcs', 'GLASSWARE'),
  nc('TRIPOD_STAND', 'Tripod stand', 10, 'pcs', 'APPARATUS'),
  nc('WIRE_GAUZE', 'Wire gauze', 10, 'pcs', 'APPARATUS'),
  cons('FILTER_PAPER', 'Filter paper', 10, 'boxes', 'CONSUMABLE', undefined, 'NON_CONSUMABLE'),
  nc('ASSEMBLING_BOX', 'Assembling box', 5, 'pcs', 'APPARATUS'),
  nc('FUNNEL_SMALL_GLASS', 'Funnel, small (glass)', 10, 'pcs', 'GLASSWARE'),
  nc('FUNNEL_SMALL_PLASTIC', 'Funnel, small (plastic)', 10, 'pcs', 'APPARATUS'),
  nc('FUNNEL_BIG_GLASS', 'Funnel, big (glass)', 5, 'pcs', 'GLASSWARE'),
  nc('FUNNEL_BIG_PLASTIC', 'Funnel, big (plastic)', 5, 'pcs', 'APPARATUS'),
  nc('SPATULA', 'Spatula', 20, 'pcs', 'APPARATUS'),
  nc('RB_FLASK', 'Round bottom flask', 5, 'pcs', 'GLASSWARE'),
  nc('LAB_THERMOMETER', 'Laboratory thermometer', 10, 'pcs', 'INSTRUMENT', 'Listed twice in the SOP; counted once.'),
  nc('GLASS_ROD', 'Glass rod', 10, 'pcs', 'GLASSWARE'),
  nc('DROPPER_BIG', 'Dropper, big', 10, 'pcs', 'GLASSWARE'),
  nc('DROPPER_SMALL', 'Dropper, small', 10, 'pcs', 'GLASSWARE'),
  nc('DEFLAGRATING_SPOON', 'Deflagrating spoon', 5, 'pcs', 'APPARATUS'),
  nc('PLANE_MIRROR', 'Plane mirror', 10, 'pcs', 'APPARATUS'),
  nc('MIRROR_STAND', 'Stand for mirrors', 10, 'pairs', 'APPARATUS'),
  nc('TEST_TUBE_HOLDER', 'Test tube holder', 10, 'pcs', 'APPARATUS'),
  nc('SCISSORS', 'Scissors', 4, 'pcs', 'APPARATUS'),
  nc('CHARTS', 'Charts', 15, 'pcs', 'CHART'),
  nc('PORTRAITS', 'Portraits of scientists', 20, 'pcs', 'CHART'),
  nc('CONCAVE_MIRROR', 'Concave mirror', 10, 'pcs', 'APPARATUS'),
  nc('CONCAVE_LENS', 'Concave lens', 10, 'pcs', 'APPARATUS'),
  nc('SEPARATING_FUNNEL', 'Separating funnel', 10, 'pcs', 'GLASSWARE'),
  nc('CHINA_DISH', 'China dish', 10, 'pcs', 'APPARATUS'),
  nc('PETRI_DISH', 'Petri dish', 10, 'pcs', 'GLASSWARE'),
  nc('NEEDLES', 'Needles (for placing cover slips)', 10, 'pcs', 'APPARATUS'),
  nc('THERMOMETER', 'Thermometer (clinical)', 10, 'pcs', 'INSTRUMENT'),
  nc('SPRING_BALANCE', 'Spring balance 0–250 g', 4, 'pcs', 'INSTRUMENT'),
  nc('U_MAGNET', 'U magnet', 5, 'pcs', 'APPARATUS'),
  nc('SPECIMENS_GENERAL', 'Specimens', 20, 'pcs', 'SPECIMEN'),
  nc('PERMANENT_SLIDES', 'Permanent slides (assorted)', 80, 'slides', 'SLIDE'),
  nc('PINHOLE_CAMERA', 'Pin hole camera', 4, 'pcs', 'APPARATUS'),
  nc('KALEIDOSCOPE', 'Kaleidoscope', 5, 'pcs', 'APPARATUS'),
  nc('COMPASS', 'Magnetic compass', 5, 'pcs', 'INSTRUMENT'),
  nc('BAR_MAGNET', 'Bar magnet', 10, 'pcs', 'APPARATUS'),
  cons('IRON_FILINGS', 'Iron filings', 4, 'boxes', 'CHEMICAL', undefined, 'NON_CONSUMABLE'),
  nc('IRON_STAND', 'Iron stand', 4, 'pcs', 'APPARATUS'),
  cons('THUMB_PINS', 'Thumb pins', 2, 'boxes', 'CONSUMABLE', undefined, 'NON_CONSUMABLE'),
  nc('BUNSEN_BURNER', 'Bunsen burner', 2, 'pcs', 'APPARATUS', 'SOP: as per the gas supply. Two burner points are required.'),
  nc('GLASS_PRISM', 'Glass prism', 4, 'pcs', 'APPARATUS'),
  nc('GAS_JAR', 'Gas jar', 4, 'pcs', 'GLASSWARE'),
  nc('TONGS', 'Tongs', 5, 'pcs', 'APPARATUS'),
  nc('COMPUTER', 'Laptop / desktop', 2, 'sets', 'EQUIPMENT'),
  nc('CONVEX_MIRROR', 'Convex mirror', 10, 'pcs', 'APPARATUS'),
  nc('CONVEX_LENS', 'Convex lens', 10, 'pcs', 'APPARATUS'),

  // (b) Consumables
  cons('HAND_WASH', 'Hand wash', 2, 'bottles', 'CONSUMABLE'),
  cons('SANITIZER', 'Sanitizer', 2, 'bottles', 'CONSUMABLE', ['FLAMMABLE']),
  cons('IODINE', 'Iodine solution', 200, 'ml', 'CHEMICAL', ['IRRITANT']),
  cons('CUSO4', 'Copper sulphate', 200, 'g', 'CHEMICAL', ['TOXIC', 'IRRITANT']),
  cons('NAOH', 'Sodium hydroxide pellets', 200, 'g', 'CHEMICAL', ['CORROSIVE']),
  cons('MATCHBOX', 'Matchboxes', 3, 'pcs', 'CONSUMABLE', ['FLAMMABLE']),
  cons('SLIDES_BLANK', 'Glass slides', 10, 'boxes', 'CONSUMABLE'),
  cons('COVER_SLIPS', 'Cover slips', 10, 'boxes', 'CONSUMABLE'),
  cons('ALCOHOL', 'Alcohol', 1000, 'ml', 'CHEMICAL', ['FLAMMABLE']),
  cons('LITMUS_RED', 'Litmus paper, red', 20, 'booklets', 'CONSUMABLE'),
  cons('LITMUS_BLUE', 'Litmus paper, blue', 20, 'booklets', 'CONSUMABLE'),
  cons('NACL', 'Sodium chloride', 2000, 'g', 'CHEMICAL'),
  cons('HCL_DILUTE', 'Hydrochloric acid, dilute', 200, 'ml', 'CHEMICAL', ['CORROSIVE']),
  cons('HCL_CONC', 'Hydrochloric acid, concentrated', 200, 'ml', 'CHEMICAL', ['CORROSIVE', 'TOXIC']),
  cons('METHYL_ORANGE', 'Methyl orange', 2, 'bottles', 'CHEMICAL', ['TOXIC']),
  cons('PHENOLPHTHALEIN', 'Phenolphthalein', 2, 'bottles', 'CHEMICAL', ['FLAMMABLE']),
  cons('LIME_WATER', 'Lime water', 1, 'bottles', 'CHEMICAL', ['IRRITANT']),
  cons('MG_RIBBON', 'Magnesium ribbon', 4, 'coils', 'CHEMICAL', ['FLAMMABLE']),
  cons('SULPHUR', 'Sulphur powder', 200, 'g', 'CHEMICAL', ['FLAMMABLE']),
  cons('ZINC_GRANULES', 'Zinc granules', 2, 'bottles', 'CHEMICAL'),

  // (c) Biology specimens and models
  specimen('SPEC_INSECTIVOROUS', 'Insectivorous plants', 3),
  specimen('SPEC_HYDRILLA', 'Hydrilla', 2),
  specimen('MODEL_TEETH', 'Model of human teeth', 2),
  specimen('MODEL_PENDULUM', 'Model of simple pendulum', 2),
  specimen('SPEC_SILKMOTH', 'Life cycle of silkmoth', 2),
  specimen('SPEC_ROOT_NODULES', 'Root nodules', 2),

  // (d) Permanent slides
  slide('SLIDE_BACILLI', 'Bacteria shapes — bacilli'),
  slide('SLIDE_COCCI', 'Bacteria shapes — cocci'),
  slide('SLIDE_SPIRILLA', 'Bacteria shapes — spirilla'),
  slide('SLIDE_AMOEBA', 'Amoeba'),
  slide('SLIDE_AMOEBA_FISSION', 'Binary fission in Amoeba'),
  slide('SLIDE_HYDRA', 'Hydra'),
  slide('SLIDE_BREAD_MOULD', 'Bread mould'),
  slide('SLIDE_SPIROGYRA', 'Spirogyra'),
  slide('SLIDE_YEAST', 'Budding in yeast'),
  slide('SLIDE_PARAMECIUM', 'Paramecium'),
  slide('SLIDE_CHLAMYDOMONAS', 'Chlamydomonas'),

  // Safety equipment named in the SOP
  { code: 'FIRE_EXTINGUISHER', name: 'Fire extinguisher', required: 1, unit: 'pcs', category: 'SAFETY', kind: 'NON_CONSUMABLE', sopList: 'SAFETY', note: 'Record the refill date as the expiry date.' },
  { code: 'FIRST_AID_KIT', name: 'First aid kit', required: 2, unit: 'kits', category: 'SAFETY', kind: 'NON_CONSUMABLE', sopList: 'SAFETY' },
  { code: 'GOGGLES', name: 'Safety goggles', required: 40, unit: 'pcs', category: 'SAFETY', kind: 'NON_CONSUMABLE', sopList: 'SAFETY', note: 'SOP requires goggles; one per student in a batch of 40.' },
  { code: 'GLOVES', name: 'Gloves', required: 40, unit: 'pairs', category: 'SAFETY', kind: 'CONSUMABLE', sopList: 'SAFETY' },
]

function p(
  code: string,
  classNumber: number,
  subject: TemplatePractical['subject'],
  title: string,
  aim: string,
  apparatus: [string, number][],
  safety?: string,
): TemplatePractical {
  return { code, classNumber, subject, title, aim, apparatus: apparatus.map(([itemCode, qty]) => ({ itemCode, qty })), safety }
}

const PRACTICALS: TemplatePractical[] = [
  // Class 6
  p('C6-SEPARATION', 6, 'Science', 'Separation of substances', 'Separate a mixture of sand and salt by dissolving, filtration and evaporation.', [['BEAKER_100', 10], ['FUNNEL_SMALL_GLASS', 10], ['FILTER_PAPER', 0.2], ['CHINA_DISH', 10], ['TRIPOD_STAND', 10], ['WIRE_GAUZE', 10], ['NACL', 100]], 'Handle the hot china dish with tongs.'),
  p('C6-MAGNETS', 6, 'Physics', 'Fun with magnets', 'Find the poles of a bar magnet using iron filings and identify the north–south direction with a compass.', [['BAR_MAGNET', 10], ['IRON_FILINGS', 0.1], ['COMPASS', 5]]),
  p('C6-PINHOLE', 6, 'Physics', 'Light travels in a straight line', 'Observe an inverted image with a pin hole camera.', [['PINHOLE_CAMERA', 4]]),
  p('C6-STARCH-TEST', 6, 'Biology', 'Test for starch in food', 'Detect starch in food samples using iodine solution.', [['TEST_TUBE', 10], ['DROPPER_SMALL', 10], ['IODINE', 20]]),
  p('C6-PLANE-MIRROR', 6, 'Physics', 'Images in a plane mirror', 'Study the image formed by a plane mirror.', [['PLANE_MIRROR', 10], ['MIRROR_STAND', 10]]),

  // Class 7
  p('C7-LITMUS', 7, 'Chemistry', 'Acids, bases and indicators', 'Test household substances with red and blue litmus.', [['TEST_TUBE', 10], ['LITMUS_RED', 1], ['LITMUS_BLUE', 1], ['DROPPER_SMALL', 10]]),
  p('C7-CRYSTALS', 7, 'Chemistry', 'Crystallisation of copper sulphate', 'Obtain crystals of copper sulphate from its solution.', [['BEAKER_100', 10], ['CHINA_DISH', 10], ['GLASS_ROD', 10], ['CUSO4', 50], ['TRIPOD_STAND', 10], ['WIRE_GAUZE', 10], ['BUNSEN_BURNER', 2]], 'Copper sulphate is harmful if swallowed; wash hands after use.'),
  p('C7-MG-BURN', 7, 'Chemistry', 'Burning magnesium ribbon', 'Show a chemical change by burning magnesium ribbon and testing the ash.', [['MG_RIBBON', 0.25], ['TONGS', 5], ['BUNSEN_BURNER', 2], ['LITMUS_RED', 1]], 'Do not look directly at the burning ribbon.'),
  p('C7-THERMOMETER', 7, 'Physics', 'Reading a thermometer', 'Read clinical and laboratory thermometers correctly.', [['THERMOMETER', 10], ['LAB_THERMOMETER', 10], ['BEAKER_100', 10]]),
  p('C7-CONVEX-LENS', 7, 'Physics', 'Images by mirrors and lenses', 'Compare images formed by concave and convex mirrors and lenses.', [['CONCAVE_MIRROR', 10], ['CONVEX_MIRROR', 10], ['CONVEX_LENS', 10], ['CONCAVE_LENS', 10]]),
  p('C7-KALEIDOSCOPE', 7, 'Physics', 'Multiple reflection', 'Observe multiple images using a kaleidoscope.', [['KALEIDOSCOPE', 5]]),
  p('C7-PENDULUM', 7, 'Physics', 'Time period of a simple pendulum', 'Measure the time period of a simple pendulum.', [['MODEL_PENDULUM', 2], ['IRON_STAND', 4]]),

  // Class 8
  p('C8-MICROBES', 8, 'Biology', 'Micro-organisms', 'Observe bread mould and bacteria shapes under the microscope.', [['MICROSCOPE', 10], ['SLIDE_BREAD_MOULD', 2], ['SLIDE_BACILLI', 2], ['SLIDE_COCCI', 2], ['SLIDE_SPIRILLA', 2]]),
  p('C8-ROOT-NODULES', 8, 'Biology', 'Root nodules of leguminous plants', 'Observe root nodules and relate them to nitrogen fixation.', [['SPEC_ROOT_NODULES', 2]]),
  p('C8-COMBUSTION', 8, 'Chemistry', 'Combustion and flame', 'Study the zones of a candle flame and conditions for combustion.', [['MATCHBOX', 0.2], ['TONGS', 5], ['GAS_JAR', 4]], 'Keep long hair tied back near flames.'),
  p('C8-METALS', 8, 'Chemistry', 'Metals and non-metals', 'Compare the reaction of zinc and sulphur with acid and the nature of their oxides.', [['ZINC_GRANULES', 0.1], ['HCL_DILUTE', 20], ['SULPHUR', 10], ['DEFLAGRATING_SPOON', 5], ['TEST_TUBE', 10], ['LITMUS_BLUE', 1]], 'Burn sulphur only under the fume hood.'),
  p('C8-CELLS', 8, 'Biology', 'Cell structure', 'Prepare a temporary mount of onion peel and observe cells.', [['MICROSCOPE', 10], ['SLIDES_BLANK', 0.2], ['COVER_SLIPS', 0.2], ['IODINE', 10], ['NEEDLES', 10], ['DROPPER_SMALL', 10]]),

  // Class 9 (CBSE practical list)
  p('C9-SOLUTIONS', 9, 'Chemistry', 'True solution, suspension and colloid', 'Prepare a true solution of salt, a suspension of chalk and a colloid of milk, and distinguish them by transparency, filtration and stability.', [['BEAKER_100', 10], ['FUNNEL_SMALL_GLASS', 10], ['FILTER_PAPER', 0.2], ['GLASS_ROD', 10], ['NACL', 50]]),
  p('C9-MIXTURE-COMPOUND', 9, 'Chemistry', 'Mixture and compound', 'Prepare a mixture and a compound of iron filings and sulphur and compare their properties.', [['IRON_FILINGS', 0.1], ['SULPHUR', 20], ['CHINA_DISH', 10], ['BAR_MAGNET', 10], ['BUNSEN_BURNER', 2], ['HCL_DILUTE', 20]], 'Heating iron and sulphur releases fumes; use the fume hood.'),
  p('C9-REACTIONS', 9, 'Chemistry', 'Chemical reactions', 'Carry out combination, decomposition and displacement reactions and classify them.', [['TEST_TUBE', 10], ['BOILING_TUBE', 10], ['CUSO4', 20], ['ZINC_GRANULES', 0.1], ['TEST_TUBE_HOLDER', 10], ['BUNSEN_BURNER', 2]]),
  p('C9-CHEEK-ONION', 9, 'Biology', 'Onion peel and cheek cells', 'Prepare stained temporary mounts of onion peel and human cheek cells.', [['MICROSCOPE', 10], ['SLIDES_BLANK', 0.2], ['COVER_SLIPS', 0.2], ['IODINE', 10], ['NEEDLES', 10]]),
  p('C9-TISSUES', 9, 'Biology', 'Plant and animal tissues', 'Identify parenchyma, collenchyma, sclerenchyma, muscle fibres and nerve cells from permanent slides.', [['MICROSCOPE', 10], ['PERMANENT_SLIDES', 10]]),
  p('C9-MELT-BOIL', 9, 'Physics', 'Melting point of ice and boiling point of water', 'Determine the melting point of ice and the boiling point of water.', [['BEAKER_500', 5], ['LAB_THERMOMETER', 10], ['TRIPOD_STAND', 10], ['WIRE_GAUZE', 10], ['BUNSEN_BURNER', 2], ['IRON_STAND', 4]], 'Do not hold the thermometer by the bulb; use a clamp.'),
  p('C9-DENSITY', 9, 'Physics', 'Density of a solid', 'Determine the density of a solid using a spring balance and a measuring cylinder.', [['SPRING_BALANCE', 4], ['BEAKER_500', 5]]),
  p('C9-ARCHIMEDES', 9, 'Physics', 'Loss in weight and water displaced', 'Establish the relation between loss in weight of a solid in water and the weight of water displaced.', [['SPRING_BALANCE', 4], ['BEAKER_500', 5], ['IRON_STAND', 4]]),
  p('C9-SPECIMENS', 9, 'Biology', 'Diversity in living organisms', 'Study the characteristics of Spirogyra, Agaricus, moss, fern, Pinus and an angiosperm from specimens.', [['SPECIMENS_GENERAL', 6], ['SLIDE_SPIROGYRA', 2]]),
  p('C9-CONSERVATION', 9, 'Chemistry', 'Law of conservation of mass', 'Verify the law of conservation of mass in a chemical reaction.', [['CONICAL_FLASK', 5], ['CUSO4', 10], ['TEST_TUBE', 10]]),

  // Class 10 (CBSE practical list)
  p('C10-PH', 10, 'Chemistry', 'pH of samples', 'Find the pH of dilute HCl, dilute NaOH, water, lemon juice and sodium bicarbonate solution using pH paper or universal indicator.', [['TEST_TUBE', 10], ['DROPPER_SMALL', 10], ['HCL_DILUTE', 10], ['NAOH', 5]]),
  p('C10-ACID-BASE', 10, 'Chemistry', 'Properties of acids and bases', 'Study the reaction of HCl and NaOH with litmus, zinc metal and solid sodium carbonate.', [['TEST_TUBE', 10], ['LITMUS_RED', 1], ['LITMUS_BLUE', 1], ['ZINC_GRANULES', 0.1], ['HCL_DILUTE', 30], ['NAOH', 10]], 'Never add water to concentrated acid; wear goggles.'),
  p('C10-REACTION-TYPES', 10, 'Chemistry', 'Types of reactions', 'Perform combination, decomposition, displacement and double displacement reactions.', [['TEST_TUBE', 10], ['BOILING_TUBE', 10], ['CUSO4', 20], ['TEST_TUBE_HOLDER', 10], ['BUNSEN_BURNER', 2]]),
  p('C10-REACTIVITY', 10, 'Chemistry', 'Reactivity series', 'Observe the action of Zn, Fe, Cu and Al on salt solutions and arrange them by reactivity.', [['TEST_TUBE', 10], ['CUSO4', 20], ['ZINC_GRANULES', 0.1]]),
  p('C10-STOMATA', 10, 'Biology', 'Stomata in a leaf peel', 'Prepare a temporary mount of a leaf peel to show stomata.', [['MICROSCOPE', 10], ['SLIDES_BLANK', 0.2], ['COVER_SLIPS', 0.2], ['NEEDLES', 10]]),
  p('C10-RESPIRATION', 10, 'Biology', 'CO₂ released in respiration', 'Show experimentally that carbon dioxide is given out during respiration.', [['CONICAL_FLASK', 5], ['LIME_WATER', 0.1]]),
  p('C10-ACETIC-ACID', 10, 'Chemistry', 'Properties of acetic acid', 'Study odour, solubility, effect on litmus and reaction with sodium bicarbonate of acetic acid.', [['TEST_TUBE', 10], ['LITMUS_BLUE', 1], ['LIME_WATER', 0.1]]),
  p('C10-FOCAL-LENGTH', 10, 'Physics', 'Focal length of mirror and lens', 'Determine the focal length of a concave mirror and a convex lens by obtaining the image of a distant object.', [['CONCAVE_MIRROR', 10], ['CONVEX_LENS', 10], ['MIRROR_STAND', 10]]),
  p('C10-GLASS-SLAB', 10, 'Physics', 'Refraction through a glass slab', 'Trace the path of a ray of light through a rectangular glass slab.', [['THUMB_PINS', 0.1]]),
  p('C10-PRISM', 10, 'Physics', 'Refraction through a prism', 'Trace the path of rays of light through a glass prism.', [['GLASS_PRISM', 4], ['THUMB_PINS', 0.1]]),
  p('C10-REPRODUCTION', 10, 'Biology', 'Asexual reproduction', 'Study binary fission in Amoeba and budding in yeast and Hydra with prepared slides.', [['MICROSCOPE', 10], ['SLIDE_AMOEBA_FISSION', 2], ['SLIDE_YEAST', 2], ['SLIDE_HYDRA', 2]]),
  p('C10-HOMOLOGY', 10, 'Biology', 'Homologous and analogous organs', 'Identify homologous and analogous organs from preserved or virtual specimens.', [['SPECIMENS_GENERAL', 6], ['CHARTS', 2]]),
]

export const compositeScience: LabTemplate = {
  code: 'CBSE_COMPOSITE_SCIENCE',
  labType: 'COMPOSITE_SCIENCE',
  name: 'CBSE Composite Science Laboratory (Classes VI–X)',
  source: 'CBSE Standard Operating Procedure for Composite Science Laboratory',
  batchSize: 40,

  infrastructure: [
    { code: 'AREA', group: 'Room', label: 'Laboratory room area', min: 600, unit: 'sq ft' },
    { code: 'DOORS', group: 'Room', label: 'Wide doors for exit in an emergency', min: 2, unit: 'doors' },
    { code: 'STOOLS', group: 'Room', label: 'Laboratory stools', min: 40, unit: 'stools' },
    { code: 'DEMO_TABLE', group: 'Teaching', label: 'Demonstration table with sink and tap' },
    { code: 'SMART_BOARD', group: 'Teaching', label: 'Smart board with internet (or white/green board)' },
    { code: 'STORE_ROOM', group: 'Storage', label: 'Separate store room or lockable cupboards for chemicals and apparatus' },
    { code: 'STORE_DUST_FREE', group: 'Storage', label: 'Storage kept dust, moisture and vermin free' },
    { code: 'BOARD_DOS', group: 'Display', label: "Display board: Do's and Don'ts" },
    { code: 'BOARD_PRACTICALS', group: 'Display', label: 'Display board: list of practicals' },
    { code: 'BOARD_TIMETABLE', group: 'Display', label: 'Display board: lab timetable' },
    { code: 'BOARD_EMERGENCY', group: 'Display', label: 'Display board: emergency contact numbers' },
    { code: 'GAS_BURNERS', group: 'Utilities', label: 'Gas pipeline with burner points', min: 2, unit: 'burners' },
    { code: 'SINKS', group: 'Utilities', label: 'Sinks with running water', min: 8, unit: 'sinks' },
    { code: 'HEATER', group: 'Utilities', label: 'Heater', min: 1, unit: 'heaters' },
    { code: 'EXHAUST_FANS', group: 'Utilities', label: 'Exhaust fans', min: 2, unit: 'fans' },
    { code: 'ELECTRICAL_OK', group: 'Utilities', label: 'Electrical fittings properly insulated and checked' },
    { code: 'FIRE_EXT', group: 'Safety', label: 'Fire extinguisher at a prominent place', min: 1, unit: 'extinguishers' },
    { code: 'FIRST_AID', group: 'Safety', label: 'First aid kits', min: 2, unit: 'kits' },
    { code: 'FUME_HOOD', group: 'Safety', label: 'Fume hood for experiments producing fumes' },
    { code: 'GOGGLES_GLOVES', group: 'Safety', label: 'Goggles and gloves available for students' },
    { code: 'LABELLING', group: 'Safety', label: 'All chemicals and reagent bottles properly labelled' },
    { code: 'WASTE_BINS', group: 'Waste', label: 'Waste bins — biodegradable and non-biodegradable', min: 2, unit: 'bins' },
    { code: 'FLAMMABLE_BOTTLES', group: 'Waste', label: 'Flammable chemical bottles packed separately for disposal' },
  ],

  items: ITEMS,

  inspections: [
    {
      type: 'DAILY',
      label: 'Daily close-down check',
      everyDays: 1,
      items: [
        { code: 'GAS_OFF', label: 'Gas main and all burner valves closed' },
        { code: 'TAPS_OFF', label: 'Water taps closed, sinks clean' },
        { code: 'POWER_OFF', label: 'Electrical points and equipment switched off' },
        { code: 'CHEM_LOCKED', label: 'Chemicals returned and cupboards locked' },
        { code: 'WASTE_SEGREGATED', label: 'Waste segregated into the right bins' },
        { code: 'BENCHES_CLEAN', label: 'Benches cleaned and apparatus returned' },
      ],
    },
    {
      type: 'MONTHLY',
      label: 'Monthly safety inspection',
      everyDays: 30,
      items: [
        { code: 'EXT_PRESSURE', label: 'Fire extinguisher pressure gauge in green and within refill date' },
        { code: 'FIRST_AID_STOCKED', label: 'Both first aid kits fully stocked' },
        { code: 'EXITS_CLEAR', label: 'Both doors and exit routes unobstructed' },
        { code: 'EXHAUST_WORKING', label: 'Exhaust fans and fume hood working' },
        { code: 'LABELS_INTACT', label: 'Chemical labels legible, expiry dates checked' },
        { code: 'BOARDS_UP', label: "Do's and don'ts, practical list, timetable and emergency numbers displayed" },
        { code: 'GOGGLES_OK', label: 'Goggles and gloves available and in good condition' },
        { code: 'GLASS_CHECK', label: 'Chipped or cracked glassware removed from use' },
      ],
    },
    {
      type: 'QUARTERLY',
      label: 'Quarterly gas and electrical audit',
      everyDays: 90,
      items: [
        { code: 'GAS_LEAK_TEST', label: 'Gas pipeline and burner joints leak-tested (soap solution)' },
        { code: 'GAS_HOSES', label: 'Rubber hoses free of cracks; replaced if older than two years' },
        { code: 'WIRING', label: 'Wiring, switches and sockets inspected for exposed or loose parts' },
        { code: 'EARTHING', label: 'Earthing checked' },
        { code: 'VULNERABLE_POINTS', label: 'Vulnerable points (heater, burners, chemical store) inspected' },
        { code: 'DRILL', label: 'Fire / evacuation drill conducted with students' },
      ],
    },
  ],

  safetyProvisions: [
    'Two wide doors for easy exit in an emergency.',
    'Fire extinguishers placed at a prominent, accessible place.',
    'Periodic checking of vulnerable points, gas fittings and electrical fittings.',
    'All chemicals and reagent bottles properly labelled.',
    'Fume hood for experiments that produce harmful fumes.',
    'Goggles and gloves for students during practical work.',
    'Practical work always under the supervision of a teacher.',
    'First aid kits available and stocked.',
  ],

  studentRules: [
    'Enter the laboratory only in the presence of the teacher or lab assistant.',
    'Wear goggles and gloves whenever handling chemicals.',
    'Read the instructions carefully before starting any experiment.',
    'Never taste or smell chemicals directly; waft vapours towards your nose.',
    'Never point the mouth of a heated test tube towards yourself or others.',
    'Always add acid to water, never water to acid.',
    'Use only the quantity of chemical asked for; never return excess to the bottle.',
    'Report every breakage, spill, cut or burn to the teacher immediately.',
    'Keep the work bench clean and dry; do not keep bags on it.',
    'Turn off gas, water and electricity after use.',
    'Dispose of waste only in the bin meant for it.',
    'Wash hands with soap after every practical.',
    'Do not eat or drink in the laboratory.',
    'Do not run, push or play in the laboratory.',
    'Handle glassware with care and keep it away from the edge of the table.',
    'Never carry chemicals or apparatus out of the laboratory.',
    'Tie back long hair and avoid loose clothing near flames.',
    'Know where the fire extinguisher, first aid kit and exits are.',
  ],

  dos: [
    'Wear goggles and gloves with chemicals',
    'Add acid to water, slowly',
    'Report breakages and injuries at once',
    'Keep your bench clean and dry',
    'Turn off gas, water and power after use',
    'Wash your hands after every practical',
    'Use the correct waste bin',
  ],

  donts: [
    "Don't enter without a teacher",
    "Don't taste or directly smell chemicals",
    "Don't eat or drink in the lab",
    "Don't point a heated test tube at anyone",
    "Don't return excess chemical to the bottle",
    "Don't run or play in the lab",
    "Don't carry anything out of the lab",
  ],

  practicals: PRACTICALS,
}
