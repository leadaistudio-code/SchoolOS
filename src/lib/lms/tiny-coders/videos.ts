import { academySeries, withSeries } from '@/lib/lms/catalogue/build'
import { cp, type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

export const TINY_CODERS_SERIES = academySeries('Tiny Coders', [], narrationTiming as NarrationTiming)

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 't01',
    lessonSlug: 'tc-01-welcome',
    number: 1,
    title: 'Welcome: you already give instructions',
    summary: ['Coding is clear step-by-step instructions', 'Order matters', 'Mistakes are how you learn'],
    next: 'Order matters.',
    scenes: [
      { kind: 'title', kicker: 'Welcome', title: 'You already give instructions', say: 'Welcome to Tiny Coders from MyCampusView Academy! Coding means giving clear instructions. You already do this when you explain a game or a recipe.', chapter: 'Welcome' },
      { kind: 'points', title: 'What is coding?', items: ['Instructions a computer can follow', 'One step at a time', 'Exactly what you ask — nothing more'], say: 'Coding means writing instructions a computer can follow. Computers are careful but not clever. They only do exactly what you ask, in the order you ask.' },
      { kind: 'steps', title: 'Classroom rules', items: ['Be kind when a plan goes wrong', 'Try again after a mistake', 'Ask for help after you have tried once'], say: 'Three classroom rules. Be kind when someone’s plan goes wrong. Try again after a mistake — that is normal. Ask for help after you have tried once.', chapter: 'Rules' },
      { kind: 'points', title: 'Remember', items: ['Coding is ordered steps', 'Order matters', 'Bugs are normal'], say: 'Remember: coding is ordered steps. Order matters. And bugs are normal — they help you learn.' },
    ],
    checkpoints: [
      cp('t01-c1', 1, 'A computer follows instructions…', [['In the order you give them', true, 'Yes.'], ['In any order it likes', false, 'Computers do not guess the order.']], 'Programs run step by step.'),
    ],
  },
  {
    id: 't02',
    lessonSlug: 'tc-02-order',
    number: 2,
    title: 'Order matters',
    summary: ['A sequence is steps in order', 'Wrong order means the wrong result'],
    next: 'Patterns you can repeat.',
    scenes: [
      { kind: 'title', kicker: 'Video 2', title: 'Order matters', say: 'If the steps are in the wrong order, the result is wrong — even when every step is good on its own.', chapter: 'Sequence' },
      { kind: 'steps', title: 'Brushing teeth', items: ['Wet the brush', 'Put toothpaste on', 'Brush your teeth', 'Rinse and put the brush away'], say: 'Think about brushing teeth. Wet the brush, put toothpaste on, brush, then rinse. Swap the first and last steps and the plan fails.' },
      { kind: 'points', title: 'In code', items: ['Robots need power before they drive', 'Games need a start before a win', 'Recipes need mixing before baking'], say: 'The same idea shows up in code. A robot that drives before the motors are on will sit still. Order is part of the instruction.', chapter: 'Why it matters' },
    ],
    checkpoints: [
      cp('t02-c1', 1, 'Why does order matter in coding?', [['Because steps run one after another', true, 'Correct.'], ['Because computers get bored', false, 'Not about boredom.']], 'Programs follow sequence.'),
    ],
  },
  {
    id: 't03',
    lessonSlug: 'tc-03-patterns',
    number: 3,
    title: 'Patterns you can repeat',
    summary: ['A pattern repeats with a rule', 'Finding the rule helps you plan code'],
    next: 'Loops: do it again.',
    scenes: [
      { kind: 'title', kicker: 'Video 3', title: 'Patterns', say: 'Patterns help you predict what comes next — and later, write shorter programs.', chapter: 'Patterns' },
      { kind: 'points', title: 'Spot the repeat', items: ['Red, blue, red, blue…', 'Clap, stomp, clap, stomp…', '3, 6, 9, 12…'], say: 'Red, blue, red, blue — what comes next? Blue. Clap, stomp, clap, stomp — the pair repeats. Three, six, nine, twelve — add three each time.' },
      { kind: 'parts', title: 'Pattern or random?', items: [{ name: 'clap, stomp, clap, stomp', job: 'Pattern' }, { name: 'dog, 7, sunny, shoe', job: 'No clear pattern' }, { name: '↑ ↑ ↓ ↓ ← →', job: 'Grouped repeats' }], say: 'Some lists have a repeating rule. Others are just random. Coders look for the piece that repeats so they do not write it again and again.', chapter: 'Rule hunting' },
    ],
    checkpoints: [
      cp('t03-c1', 1, 'What is a pattern?', [['Something that repeats with a rule', true, 'Yes.'], ['A random list', false, 'Random has no rule.']], 'Patterns follow a rule.'),
    ],
  },
  {
    id: 't04',
    lessonSlug: 'tc-04-loops',
    number: 4,
    title: 'Loops: do it again',
    summary: ['A loop repeats a block of steps', 'It keeps instructions short'],
    next: 'If this, then that.',
    scenes: [
      { kind: 'title', kicker: 'Video 4', title: 'Loops', say: 'A loop says do these steps more than once, without writing them again.', chapter: 'Loops' },
      { kind: 'steps', title: 'Instead of five times', items: ['Draw a star', 'Draw a star', 'Draw a star', '…or: repeat 5 times → draw a star'], say: 'Writing draw a star five times is long. Saying repeat five times, draw a star, is a loop. Same result, clearer plan.' },
      { kind: 'points', title: 'Best for a loop', items: ['Clap 10 times', 'Not: write your name once', 'Not: choose a snack'], say: 'Loops shine when the same action runs many times. Writing your name once, or choosing a snack, is not a repeat.', chapter: 'When to use' },
    ],
    checkpoints: [
      cp('t04-c1', 2, 'A loop is for…', [['Repeating steps', true, 'Correct.'], ['Deleting files', false, 'Not about deleting.']], 'Loops repeat work.'),
    ],
  },
  {
    id: 't05',
    lessonSlug: 'tc-05-conditions',
    number: 5,
    title: 'If this, then that',
    summary: ['Conditions choose which steps run', 'If…then keeps programs flexible'],
    next: 'Bugs: find the mistake.',
    scenes: [
      { kind: 'title', kicker: 'Video 5', title: 'If this, then that', say: 'Sometimes the next step depends on what is true right now. That is a condition.', chapter: 'Conditions' },
      { kind: 'parts', title: 'Everyday if…then', items: [{ name: 'If it is raining', job: 'then take an umbrella' }, { name: 'If the light is red', job: 'then stop' }, { name: 'If the cup is empty', job: 'then fill it' }], say: 'If it is raining, then take an umbrella. If the light is red, then stop. Robots do this too: if the sensor sees a line, then go forward.' },
      { kind: 'points', title: 'Flexible plans', items: ['Same program, different paths', 'Check a fact, then choose', 'Used in every game and robot'], say: 'Conditions keep programs flexible. One plan can take different paths depending on what is true.', chapter: 'Why it matters' },
    ],
    checkpoints: [
      cp('t05-c1', 1, '“If the battery is low, then recharge” is a…', [['Condition', true, 'Yes.'], ['Loop only', false, 'It chooses a path.']], 'If…then is a condition.'),
    ],
  },
  {
    id: 't06',
    lessonSlug: 'tc-06-bugs',
    number: 6,
    title: 'Bugs: find the mistake',
    summary: ['Bugs are mistakes in instructions', 'Read steps carefully to find them'],
    next: 'Guide a character on a grid.',
    scenes: [
      { kind: 'title', kicker: 'Video 6', title: 'Find the bug', say: 'A bug is a mistake in the instructions. Finding it is a normal part of coding.', chapter: 'Debugging' },
      { kind: 'steps', title: 'Broken sandwich plan', items: ['Eat sandwich', 'Put filling on bread', 'Open bread packet'], say: 'Look at this sandwich plan. Eat first, then put the filling on, then open the packet. Eating happens before making it — that is the bug.' },
      { kind: 'points', title: 'How to debug', items: ['Read every step', 'Ask what happens too early', 'Fix, then try again'], say: 'To debug, read every step. Ask what happens too early or too late. Fix it, then try again.', chapter: 'Habits' },
    ],
    checkpoints: [
      cp('t06-c1', 1, 'What is a bug in coding?', [['A mistake in the instructions', true, 'Correct.'], ['A finished program', false, 'Bugs are mistakes.']], 'Bugs are instruction mistakes.'),
    ],
  },
  {
    id: 't07',
    lessonSlug: 'tc-07-maps',
    number: 7,
    title: 'Guide a character on a grid',
    summary: ['Grid moves are forward and turn', 'Shorter plans are often clearer'],
    next: 'Project: invent a 5-step robot job.',
    scenes: [
      { kind: 'title', kicker: 'Video 7', title: 'Grid paths', say: 'Coders often move a character on a grid using forward and turn — the same idea as many coding games.', chapter: 'Grids' },
      { kind: 'parts', title: 'Grid moves', items: [{ name: 'Forward', job: 'Move one square the way you face' }, { name: 'Turn left or right', job: 'Change direction without moving' }, { name: 'Goal', job: 'Reach the star without hitting walls' }], say: 'Forward moves one square the way you face. Turn left or right changes direction without moving. The goal is to reach the star without hitting walls.' },
      { kind: 'points', title: 'Try on paper', items: ['Draw a 4 by 4 grid', 'Mark start and star', 'Write the fewest moves'], say: 'Try it on paper. Draw a four by four grid, mark a start and a star, and write the fewest moves you need.', chapter: 'Practice' },
    ],
    checkpoints: [
      cp('t07-c1', 1, 'On a grid, “turn right” usually…', [['Changes facing without moving square', true, 'Yes.'], ['Jumps to the end', false, 'Turns only change direction.']], 'Turns change direction.'),
    ],
  },
  {
    id: 't08',
    lessonSlug: 'tc-08-project',
    number: 8,
    title: 'Project: invent a 5-step robot job',
    summary: ['A project turns ideas into a clear plan', 'Loops and conditions make plans smarter'],
    next: 'Explain your plan out loud.',
    scenes: [
      { kind: 'title', kicker: 'Video 8', title: 'Your project', say: 'Invent a helpful robot job and write exactly five clear steps.', chapter: 'Project' },
      { kind: 'parts', title: 'Job ideas', items: [{ name: 'Water a plant', job: 'Help at home' }, { name: 'Tidy toys', job: 'Help in the classroom' }, { name: 'Deliver a note', job: 'Help a friend' }], say: 'Pick a job: water a plant, tidy toys, or deliver a note. Write five ordered steps. Include either a loop, or an if then.' },
      { kind: 'steps', title: 'Before you hand in', items: ['Name the robot’s job', 'Write five ordered steps', 'Use a loop or an if…then', 'Check a friend can follow it'], say: 'Before you hand in: name the job, write five ordered steps, use a loop or an if then, and check that a friend can follow your plan.', chapter: 'Checklist' },
    ],
    checkpoints: [
      cp('t08-c1', 2, 'Your plan should include…', [['Five steps plus a loop or if…then', true, 'Yes.'], ['Only one word', false, 'Plans need clear steps.']], 'Projects combine sequence with a loop or condition.'),
    ],
  },
  {
    id: 't09',
    lessonSlug: 'tc-09-share',
    number: 9,
    title: 'Explain your plan out loud',
    summary: ['Clear speech finds unclear steps', 'Feedback makes plans better'],
    next: 'Tiny Coders check.',
    scenes: [
      { kind: 'title', kicker: 'Video 9', title: 'Explain your plan', say: 'Great coders can explain their thinking. Practise saying your steps to a friend or adult.', chapter: 'Share' },
      { kind: 'steps', title: 'Try this', items: ['Read your five steps without showing the paper', 'Watch where the listener gets lost', 'Rewrite the unclear step'], say: 'Read your five steps without showing the paper. If your listener gets lost, rewrite the unclear step.' },
      { kind: 'points', title: 'Why it helps', items: ['Confusing steps become obvious', 'You practise teacher language', 'Teams debug faster together'], say: 'Explaining out loud makes confusing steps obvious. It is how teams debug faster together.', chapter: 'Why' },
    ],
    checkpoints: [
      cp('t09-c1', 1, 'Why explain a plan out loud?', [['To find steps that confuse people', true, 'Correct.'], ['To make it longer', false, 'Length is not the goal.']], 'Explaining reveals unclear steps.'),
    ],
  },
  {
    id: 't10',
    lessonSlug: 'tc-10-quiz',
    number: 10,
    title: 'Tiny Coders check',
    summary: ['You practised the ideas behind every program', 'Next courses add real robots and typed code'],
    next: 'Try Junior Makers or Robotics 101 when you are ready.',
    scenes: [
      { kind: 'title', kicker: 'Video 10', title: 'Course check', say: 'A short recap before your quiz. You learned sequences, patterns, loops, conditions and debugging.', chapter: 'Recap' },
      { kind: 'points', title: 'You can now', items: ['Put steps in order', 'Spot a pattern', 'Use a loop and an if…then', 'Find a bug in a plan'], say: 'You can put steps in order, spot a pattern, use a loop and an if then, and find a bug in a plan.' },
      { kind: 'points', title: 'What is next', items: ['Junior Makers for lights and sensors', 'Robotics 101 for a line-follower', 'Python Starters for typed code'], say: 'When you are ready, try Junior Makers for lights and sensors, Robotics 101 for a line-follower, or Python Starters for typed code.', chapter: 'Next' },
    ],
    checkpoints: [
      cp('t10-c1', 1, 'A sequence is…', [['Steps in order', true, 'Yes.'], ['A random pile', false, 'Sequences are ordered.']], 'Sequences are ordered steps.'),
    ],
  },
]

export const TINY_CODERS_VIDEOS: VideoDef[] = withSeries(TINY_CODERS_SERIES, RAW)
