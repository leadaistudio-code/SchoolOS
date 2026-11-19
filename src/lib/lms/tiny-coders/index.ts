import { catalogueCurriculum, lesson, module, q } from '@/lib/lms/catalogue/build'

export const TINY_CODERS_TITLE = 'Tiny Coders: Think in steps'

/**
 * Classes 1–4. No typing code: sequences, patterns, loops and debugging through
 * stories, sorts and picture instructions — the ideas behind every program.
 */
export const TINY_CODERS = catalogueCurriculum({
  key: 'tiny-coders',
  courseTitle: TINY_CODERS_TITLE,
  mediaBase: '/lms-media/tiny-coders',
  notesHint: 'Draw or write one step you would tell a robot.',
  course: {
    subtitle: 'Learn to give clear instructions — the first skill every coder needs',
    description:
      'A gentle first coding course for Classes 1 to 4. Children practise sequences, patterns, loops and fixing mistakes using stories, picture cards and short challenges — no typing and no kit. Built for tablets, phones and classroom computers.',
    category: 'CODING',
    level: 'BEGINNER',
    gradeFrom: 1,
    gradeTo: 4,
    outcomes: [
      'Give instructions in the right order',
      'Spot and continue simple patterns',
      'Use a loop instead of repeating the same step',
      'Find and fix a broken instruction list',
    ],
    academyPriceMinor: 49_900,
  },
  badges: [
    { id: 'tc-starter', name: 'Step Starter', description: 'Finished Thinking in steps', lessons: ['tc-01-welcome', 'tc-02-order', 'tc-03-patterns'] },
    { id: 'tc-looper', name: 'Loop Explorer', description: 'Used a loop in a challenge', lessons: ['tc-04-loops', 'tc-05-conditions'] },
    { id: 'tc-fixer', name: 'Bug Finder', description: 'Fixed a broken plan', lessons: ['tc-06-bugs', 'tc-07-maps'] },
    { id: 'tc-builder', name: 'Tiny Coder', description: 'Finished the course project', lessons: ['tc-08-project', 'tc-09-share', 'tc-10-quiz'] },
  ],
  modules: [
    module('m1', 'Thinking in steps', 'Order, patterns and clear instructions.', [
      lesson({
        slug: 'tc-01-welcome',
        title: 'Welcome: you already give instructions',
        minutes: 10,
        intro: 'Coding is telling a computer what to do, one clear step at a time. You already do this when you explain a game or a recipe.',
        objectives: ['Say what coding is in simple words', 'Know that order matters', 'Meet the Tiny Coders rules'],
        blocks: [
          {
            type: 'text',
            heading: 'What is coding?',
            body: '**Coding** means writing instructions a computer can follow. Computers are careful but not clever: they only do exactly what you ask, in the order you ask.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Classroom rules',
            body: '1. Be kind when someone’s plan goes wrong.\n2. Try again after a mistake — that is normal.\n3. Ask for help after you have tried once.',
          },
          {
            type: 'check',
            id: 'tc-welcome-1',
            prompt: 'A computer follows instructions…',
            options: [
              { id: 'a', text: 'In the order you give them', correct: true, feedback: 'Yes. Order matters.' },
              { id: 'b', text: 'In any order it likes', correct: false, feedback: 'Computers do not guess the order.' },
              { id: 'c', text: 'Only if they rhyme', correct: false, feedback: 'Rhymes are fun, but not required.' },
            ],
            explanation: 'Programs run step by step, top to bottom, unless you tell them otherwise.',
          },
        ],
        summary: ['Coding is clear step-by-step instructions.', 'Order matters.', 'Mistakes are how you learn.'],
        next: 'Next, put everyday steps in the right order.',
        questions: [q('q1', 'What does a computer need from you?', 'Clear steps in order', ['A magic wish', 'Only pictures'], 'Computers follow ordered instructions.')],
      }),
      lesson({
        slug: 'tc-02-order',
        title: 'Order matters',
        minutes: 12,
        intro: 'If the steps are in the wrong order, the result is wrong — even if every step is good on its own.',
        objectives: ['Sort steps into a working sequence', 'Explain why order matters'],
        blocks: [
          {
            type: 'sequence',
            id: 'brush',
            title: 'Brushing teeth',
            prompt: 'Put the steps in a sensible order.',
            steps: [
              { id: '1', text: 'Wet the brush' },
              { id: '2', text: 'Put toothpaste on' },
              { id: '3', text: 'Brush your teeth' },
              { id: '4', text: 'Rinse and put the brush away' },
            ],
            explanation: 'Wet, paste, brush, rinse — the same idea as ordered code.',
          },
          {
            type: 'callout',
            tone: 'life',
            title: 'In code',
            body: 'A robot that “drives” before “turns on motors” will sit still. Same idea as toothpaste before brushing.',
          },
        ],
        summary: ['A sequence is a list of steps in order.', 'Wrong order → wrong result.'],
        next: 'Next, spot patterns you can reuse.',
        questions: [q('q1', 'Why does order matter in coding?', 'Because steps run one after another', ['Because computers get bored', 'Because colours change'], 'Programs follow sequence.')],
      }),
      lesson({
        slug: 'tc-03-patterns',
        title: 'Patterns you can repeat',
        minutes: 12,
        intro: 'Patterns help you predict what comes next — and later, write shorter programs.',
        objectives: ['Continue a pattern', 'Describe a pattern in words'],
        blocks: [
          {
            type: 'text',
            heading: 'Look for the repeat',
            body: 'Red, blue, red, blue, red, … What comes next? **Blue.** Coders look for the piece that repeats so they do not write it again and again.',
          },
          {
            type: 'sort',
            id: 'pattern-or-not',
            title: 'Pattern or random?',
            prompt: 'Sort each row.',
            bins: [
              { id: 'pattern', label: 'Has a pattern' },
              { id: 'random', label: 'No clear pattern' },
            ],
            items: [
              { id: 'a', text: 'clap, stomp, clap, stomp', bin: 'pattern', why: 'Two actions keep alternating.' },
              { id: 'b', text: '3, 6, 9, 12', bin: 'pattern', why: 'Add 3 each time.' },
              { id: 'c', text: 'dog, 7, sunny, shoe', bin: 'random', why: 'No repeating rule.' },
              { id: 'd', text: '↑ ↑ ↓ ↓ ← → ← →', bin: 'pattern', why: 'Famous game code — grouped repeats.' },
            ],
          },
        ],
        summary: ['A pattern repeats with a rule.', 'Finding the rule helps you plan code.'],
        next: 'Next, turn a repeat into a loop.',
        questions: [q('q1', 'What is a pattern?', 'Something that repeats with a rule', ['A random list', 'Only colours'], 'Patterns follow a rule.')],
      }),
    ]),
    module('m2', 'Loops and choices', 'Repeat work, and choose a path.', [
      lesson({
        slug: 'tc-04-loops',
        title: 'Loops: do it again',
        minutes: 14,
        intro: 'A loop says “do these steps more than once” without writing them again.',
        objectives: ['Explain what a loop is', 'Choose when a loop helps'],
        blocks: [
          {
            type: 'text',
            heading: 'Instead of writing it five times',
            body: '“Draw a star” five times becomes: **repeat 5 times → draw a star.** That is a loop.',
          },
          {
            type: 'check',
            id: 'loop-when',
            prompt: 'Which job is best for a loop?',
            options: [
              { id: 'a', text: 'Clap 10 times', correct: true, feedback: 'Same action many times — perfect for a loop.' },
              { id: 'b', text: 'Write your name once', correct: false, feedback: 'Once is not a repeat.' },
              { id: 'c', text: 'Choose a snack', correct: false, feedback: 'That is a choice, not a repeat.' },
            ],
            explanation: 'Loops shine when the same steps run many times.',
          },
        ],
        summary: ['A loop repeats a block of steps.', 'It keeps instructions short and clear.'],
        next: 'Next, make a choice with if…then.',
        questions: [q('q1', 'A loop is for…', 'Repeating steps', ['Deleting files', 'Only drawing circles'], 'Loops repeat work.')],
      }),
      lesson({
        slug: 'tc-05-conditions',
        title: 'If this, then that',
        minutes: 14,
        intro: 'Sometimes the next step depends on what is true right now. That is a condition.',
        objectives: ['Use if…then in plain language', 'Pick a sensible condition'],
        blocks: [
          {
            type: 'text',
            heading: 'Conditions',
            body: '**If** it is raining, **then** take an umbrella. Robots do this too: **if** the sensor sees a line, **then** go forward.',
          },
          {
            type: 'match',
            id: 'if-then',
            title: 'Match the if with the then',
            prompt: 'Pair each condition with its action.',
            pairs: [
              { id: 'p1', left: 'If the light is red', right: 'then stop' },
              { id: 'p2', left: 'If the cup is empty', right: 'then fill it' },
              { id: 'p3', left: 'If the answer is wrong', right: 'then try again' },
            ],
            explanation: 'If…then pairs a condition with an action.',
          },
        ],
        summary: ['Conditions choose which steps run.', 'If…then keeps programs flexible.'],
        next: 'Next, fix plans that go wrong.',
        questions: [q('q1', '“If the battery is low, then recharge” is a…', 'Condition', ['Loop only', 'Random guess'], 'If…then is a condition.')],
      }),
    ]),
    module('m3', 'Fixing and planning', 'Debugging and maps.', [
      lesson({
        slug: 'tc-06-bugs',
        title: 'Bugs: find the mistake',
        minutes: 12,
        intro: 'A bug is a mistake in the instructions. Finding it is a normal part of coding.',
        objectives: ['Spot a wrong step', 'Suggest a fix'],
        blocks: [
          {
            type: 'text',
            heading: 'Broken sandwich plan',
            body: '1. Eat sandwich\n2. Put filling on bread\n3. Open bread packet\n\nWhich step is too early?',
          },
          {
            type: 'check',
            id: 'bug-1',
            prompt: 'What is wrong with the sandwich plan?',
            options: [
              { id: 'a', text: 'Eating happens before making it', correct: true, feedback: 'Yes — order is broken.' },
              { id: 'b', text: 'Sandwiches cannot be coded', correct: false, feedback: 'Everyday plans make great coding practice.' },
              { id: 'c', text: 'There is no mistake', correct: false, feedback: 'Step 1 is too early.' },
            ],
            explanation: 'Debugging means checking order and missing steps.',
          },
        ],
        summary: ['Bugs are mistakes in instructions.', 'Read steps carefully to find them.'],
        next: 'Next, plan a path like a tiny robot.',
        questions: [q('q1', 'What is a bug in coding?', 'A mistake in the instructions', ['An insect on the keyboard', 'A finished program'], 'Bugs are instruction mistakes.')],
      }),
      lesson({
        slug: 'tc-07-maps',
        title: 'Guide a character on a grid',
        minutes: 14,
        intro: 'Coders often move a character on a grid using forward and turn — the same idea as many coding games.',
        objectives: ['Plan a path with forward and turn', 'Keep the plan as short as you can'],
        blocks: [
          {
            type: 'steps',
            title: 'Grid rules',
            steps: [
              { title: 'Forward', body: 'Move one square the way you are facing.' },
              { title: 'Turn left / right', body: 'Change direction without moving square.' },
              { title: 'Goal', body: 'Reach the star without hitting walls.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Try on paper',
            body: 'Draw a 4×4 grid. Put a start and a star. Write the fewest moves you need.',
          },
        ],
        summary: ['Grid moves are sequences of forward and turn.', 'Shorter plans are often clearer.'],
        next: 'Next, invent your own tiny coding challenge.',
        questions: [q('q1', 'On a grid, “turn right” usually…', 'Changes facing without moving square', ['Jumps to the end', 'Deletes the path'], 'Turns change direction.')],
      }),
    ]),
    module('m4', 'Your first project', 'Make, share, check.', [
      lesson({
        slug: 'tc-08-project',
        title: 'Project: invent a 5-step robot job',
        minutes: 18,
        kind: 'PROJECT',
        intro: 'Invent a helpful robot job and write exactly five clear steps.',
        objectives: ['Write a 5-step plan', 'Include one loop or one if…then'],
        body: 'Pick a job (water a plant, tidy toys, deliver a note). Write five steps. Include either a loop (“repeat 3 times”) or an if…then. Upload a photo of your plan if you like.',
        blocks: [
          {
            type: 'checklist',
            id: 'proj',
            title: 'Before you hand in',
            items: [
              { id: 'a', text: 'I named the robot’s job' },
              { id: 'b', text: 'I wrote five ordered steps' },
              { id: 'c', text: 'I used a loop or an if…then' },
              { id: 'd', text: 'A friend can follow my steps' },
            ],
          },
        ],
        summary: ['A project turns ideas into a clear plan.', 'Loops and conditions make plans smarter.'],
        next: 'Next, practise explaining your plan.',
      }),
      lesson({
        slug: 'tc-09-share',
        title: 'Explain your plan out loud',
        minutes: 10,
        intro: 'Great coders can explain their thinking. Practise saying your steps to a friend or adult.',
        objectives: ['Explain steps clearly', 'Listen for confusing parts'],
        blocks: [
          {
            type: 'text',
            heading: 'Try this',
            body: 'Read your five steps without showing the paper. If your listener gets lost, rewrite the unclear step.',
          },
        ],
        summary: ['Clear speech finds unclear steps.', 'Feedback makes plans better.'],
        next: 'Finish with a short quiz.',
        questions: [q('q1', 'Why explain a plan out loud?', 'To find steps that confuse people', ['To make it longer', 'So the computer can hear you'], 'Explaining reveals unclear steps.')],
      }),
      lesson({
        slug: 'tc-10-quiz',
        title: 'Tiny Coders check',
        minutes: 12,
        kind: 'QUIZ',
        intro: 'A short check of sequences, loops, conditions and bugs.',
        objectives: ['Show what you remember'],
        blocks: [
          {
            type: 'text',
            heading: 'Ready?',
            body: 'Take your time. You can revisit earlier lessons if you want a reminder.',
          },
        ],
        summary: ['You practised the ideas behind every program.', 'Next courses add real robots and typed code.'],
        next: 'You finished Tiny Coders. Try Junior Makers or Robotics 101 when you are ready.',
        questions: [
          q('q1', 'A sequence is…', 'Steps in order', ['A random pile', 'Only loops'], 'Sequences are ordered steps.'),
          q('q2', 'A loop is best when…', 'You repeat the same steps', ['You choose a snack', 'You stop forever'], 'Loops repeat work.'),
          q('q3', 'A bug is…', 'A mistake in the instructions', ['A finished app', 'A type of sensor'], 'Bugs are mistakes.'),
        ],
      }),
    ]),
  ],
})
