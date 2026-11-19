import { academySeries, withSeries } from '@/lib/lms/catalogue/build'
import { cp, type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

export const PYTHON_STARTERS_SERIES = academySeries(
  'Python Starters',
  [[/\bprint\b/g, 'print'], [/\brange\b/g, 'range']],
  narrationTiming as NarrationTiming,
)

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 'p01',
    lessonSlug: 'py-01-welcome',
    number: 1,
    title: 'Welcome: Python is a language for instructions',
    summary: ['Python runs instructions in order', 'Small programs are the best teachers'],
    next: 'print: show something on screen.',
    scenes: [
      { kind: 'title', kicker: 'Welcome', title: 'Python is a language for instructions', say: 'Welcome to Python Starters from MyCampusView Academy! Python is a popular language for beginners and professionals. You type instructions; the computer carries them out.', chapter: 'Welcome' },
      { kind: 'points', title: 'Where Python shows up', items: ['Websites and data tools', 'School automation scripts', 'Many AI tools'], say: 'Websites, data tools, school automation scripts and many AI tools use Python. You will start with tiny programs you can understand line by line.' },
      { kind: 'code', title: 'Your first line', code: 'print("Hello, MyCampusView!")\n', highlight: [[1, 1]], say: 'Here is your first instruction: print Hello, MyCampusView. Spelling and parentheses matter.', chapter: 'First line' },
    ],
    checkpoints: [
      cp('p01-c1', 1, 'Python programs are…', [['Instructions the computer follows', true, 'Yes.'], ['Only drawings', false, 'Python is a programming language.']], 'Python is a programming language.'),
    ],
  },
  {
    id: 'p02',
    lessonSlug: 'py-02-print',
    number: 2,
    title: 'print: show something on screen',
    summary: ['print shows output', 'Strings need quotes'],
    next: 'Variables: labelled boxes.',
    scenes: [
      { kind: 'title', kicker: 'Video 2', title: 'print', say: 'print sends text and numbers to the output so you can see what your program is doing.', chapter: 'print' },
      { kind: 'code', title: 'Text and numbers', code: 'print("Namaste")\nprint(7 + 5)\nprint("7 + 5 =", 7 + 5)\n', highlight: [[1, 1], [2, 2], [3, 3]], say: 'Text needs quotes. Numbers can be calculated. You can mix a label and a calculation in one print.' },
      { kind: 'points', title: 'Watch the quotes', items: ['print("school") shows school', 'print(school) looks for a variable', 'Parentheses are required'], say: 'print with quotes around school shows the word school. Without quotes, Python looks for a variable named school.', chapter: 'Quotes' },
    ],
    checkpoints: [
      cp('p02-c1', 2, 'Which prints the word school?', [['print("school")', true, 'Quotes mark text.'], ['print(school)', false, 'That looks for a variable.']], 'Strings use quotes.'),
    ],
  },
  {
    id: 'p03',
    lessonSlug: 'py-03-variables',
    number: 3,
    title: 'Variables: labelled boxes',
    summary: ['Variables store values', 'You can change them later'],
    next: 'if / else: choose a path.',
    scenes: [
      { kind: 'title', kicker: 'Video 3', title: 'Variables', say: 'A variable remembers a value under a name you choose.', chapter: 'Variables' },
      { kind: 'code', title: 'Name and score', code: 'name = "Asha"\nscore = 0\nscore = score + 10\nprint(name, "scored", score)\n', highlight: [[1, 2], [3, 3], [4, 4]], say: 'Names go on the left, values on the right. You can update score, then print the name and the new score.' },
      { kind: 'points', title: 'Good names', items: ['Prefer score over x', 'Clear names are part of good coding', 'Spell names the same way every time'], say: 'Prefer score over x. Clear names are part of good coding. Spell names the same way every time.', chapter: 'Style' },
    ],
    checkpoints: [
      cp('p03-c1', 1, 'In score = 10, score is a…', [['Variable name', true, 'Correct.'], ['Loop', false, 'The name labels the value.']], 'The name labels the stored value.'),
    ],
  },
  {
    id: 'p04',
    lessonSlug: 'py-04-if',
    number: 4,
    title: 'if / else: choose a path',
    summary: ['if/else chooses between paths', 'Indentation marks which lines belong together'],
    next: 'for-loops: repeat with a counter.',
    scenes: [
      { kind: 'title', kicker: 'Video 4', title: 'if and else', say: 'Conditions let your program react differently to different values.', chapter: 'Decisions' },
      { kind: 'code', title: 'Pass or try again', code: 'marks = 82\nif marks >= 40:\n    print("Pass")\nelse:\n    print("Try again")\n', highlight: [[2, 5]], say: 'If marks are at least forty, print Pass. Else print Try again. Indent the lines that belong inside each branch.' },
      { kind: 'points', title: 'IndentationError', items: ['Spaces group code in Python', 'Use four spaces consistently', 'Mismatched indents cause errors'], say: 'Python uses indentation to group code. Keep four spaces consistently in this course, or you will see an IndentationError.', chapter: 'Indentation' },
    ],
    checkpoints: [
      cp('p04-c1', 1, 'if marks >= 40 checks a…', [['Condition', true, 'Yes.'], ['Printer', false, 'Conditions decide which branch runs.']], 'Conditions decide which branch runs.'),
    ],
  },
  {
    id: 'p05',
    lessonSlug: 'py-05-loops',
    number: 5,
    title: 'for-loops: repeat with a counter',
    summary: ['for-loops repeat a block', 'range controls how many times'],
    next: 'Lists: many values in order.',
    scenes: [
      { kind: 'title', kicker: 'Video 5', title: 'for-loops', say: 'Loops stop you from copying the same line again and again.', chapter: 'Loops' },
      { kind: 'code', title: 'Count to five', code: 'for n in range(1, 6):\n    print("Step", n)\n', highlight: [[1, 2]], say: 'for n in range one to six prints Step with n. range one to six gives one through five — it stops before six.' },
      { kind: 'points', title: 'range(3)', items: ['Runs three times', 'Values are 0, 1 and 2', 'Stops before 3'], say: 'range three runs the loop body three times with values zero, one and two.', chapter: 'range' },
    ],
    checkpoints: [
      cp('p05-c1', 2, 'How many times does range(3) run?', [['3 times (0, 1, 2)', true, 'Yes.'], ['1 time', false, 'It repeats for each number.']], 'range(3) gives three values.'),
    ],
  },
  {
    id: 'p06',
    lessonSlug: 'py-06-lists',
    number: 6,
    title: 'Lists: many values in order',
    summary: ['Lists store ordered items', 'You can loop through them'],
    next: 'Reading error messages.',
    scenes: [
      { kind: 'title', kicker: 'Video 6', title: 'Lists', say: 'A list holds an ordered collection — names, scores or tasks.', chapter: 'Lists' },
      { kind: 'code', title: 'Subjects', code: 'subjects = ["Maths", "Science", "English"]\nfor s in subjects:\n    print("Today:", s)\nprint("Count:", len(subjects))\n', highlight: [[1, 1], [2, 3], [4, 4]], say: 'Square brackets create a list. Loop through each subject, then print the count with len.' },
      { kind: 'points', title: 'Remember', items: ['[ ] creates a list', 'for item in list repeats', 'len counts items'], say: 'Square brackets create a list. for item in list repeats. len counts the items.', chapter: 'Summary' },
    ],
    checkpoints: [
      cp('p06-c1', 1, 'len(subjects) returns…', [['How many items are in the list', true, 'Correct.'], ['The first item only', false, 'len measures length.']], 'len measures length.'),
    ],
  },
  {
    id: 'p07',
    lessonSlug: 'py-07-errors',
    number: 7,
    title: 'Reading error messages',
    summary: ['Errors point to a line and a type', 'Fix, re-run, repeat'],
    next: 'Project: quiz or score tracker.',
    scenes: [
      { kind: 'title', kicker: 'Video 7', title: 'Error messages', say: 'Errors are clues. The last lines usually name the file, line number and error type.', chapter: 'Debugging' },
      { kind: 'parts', title: 'Common types', items: [{ name: 'NameError', job: 'You used a name before creating it' }, { name: 'SyntaxError', job: 'The line cannot be parsed' }], say: 'NameError often means you used a name before creating it. SyntaxError means the line cannot be parsed — maybe a missing quote or colon.' },
      { kind: 'steps', title: 'Debug habit', items: ['Read the error from the bottom up', 'Fix one issue', 'Run again'], say: 'Read the error from the bottom up. Fix one issue. Run again.', chapter: 'Habit' },
    ],
    checkpoints: [
      cp('p07-c1', 1, 'A missing variable name usually causes…', [['NameError', true, 'Yes.'], ['Silent success', false, 'Unknown names raise NameError.']], 'Unknown names cause NameError.'),
    ],
  },
  {
    id: 'p08',
    lessonSlug: 'py-08-project',
    number: 8,
    title: 'Project: quiz or score tracker',
    summary: ['Projects combine the tools you learned', 'Comments help humans'],
    next: 'Make it readable.',
    scenes: [
      { kind: 'title', kicker: 'Video 8', title: 'Your mini project', say: 'Build a tiny Python program that uses variables, a decision, and a loop or list.', chapter: 'Project' },
      { kind: 'parts', title: 'Choose one', items: [{ name: '3-question quiz', job: 'Print a final score' }, { name: 'Chore list', job: 'Number each chore' }, { name: 'Marks grader', job: 'Pass or Fail' }], say: 'Choose a three-question quiz with a final score, a chore list that numbers each item, or a marks grader that prints Pass or Fail.' },
      { kind: 'code', title: 'Skeleton', code: 'score = 0\nprint("Question 1: 2+2?")\n# check answer, update score\nprint("Final:", score)\n', highlight: [[1, 4]], say: 'Start small. Grow one feature at a time. Submit your code and a short note on one bug you fixed.', chapter: 'Start small' },
    ],
    checkpoints: [
      cp('p08-c1', 1, 'A solid mini project should include…', [['Variables plus a decision and a loop or list', true, 'Yes.'], ['Only comments', false, 'It needs working code.']], 'Combine the tools you learned.'),
    ],
  },
  {
    id: 'p09',
    lessonSlug: 'py-09-polish',
    number: 9,
    title: 'Make it readable',
    summary: ['Clarity is part of quality', 'Small cleanups prevent big confusion'],
    next: 'Python Starters check.',
    scenes: [
      { kind: 'title', kicker: 'Video 9', title: 'Make it readable', say: 'Readable code is kinder to future you — and to teachers reviewing your work.', chapter: 'Polish' },
      { kind: 'steps', title: 'Polish checklist', items: ['Clear variable names', 'One comment describing the purpose', 'Consistent indentation', 'A final print of the result'], say: 'Use clear variable names. Add one comment describing the purpose. Keep consistent indentation. End with a final print of the result.' },
      { kind: 'points', title: 'Why bother', items: ['Teachers can follow your thinking', 'You can fix bugs faster later', 'Teams share code'], say: 'Teachers can follow your thinking. You can fix bugs faster later. Teams share code.', chapter: 'Why' },
    ],
    checkpoints: [
      cp('p09-c1', 1, 'Good variable names are…', [['Clear about what they store', true, 'Correct.'], ['Always one letter', false, 'Clear names document intent.']], 'Clear names document intent.'),
    ],
  },
  {
    id: 'p10',
    lessonSlug: 'py-10-quiz',
    number: 10,
    title: 'Python Starters check',
    summary: ['You can write real Python programs', 'Keep practising with tiny daily challenges'],
    next: 'Try AI for Young Builders or AI for Teens next.',
    scenes: [
      { kind: 'title', kicker: 'Video 10', title: 'Course check', say: 'A short recap before your quiz: print, variables, if, loops and lists.', chapter: 'Recap' },
      { kind: 'points', title: 'You can now', items: ['Print text and numbers', 'Store values in variables', 'Choose paths with if', 'Repeat with for and lists'], say: 'You can print text and numbers, store values in variables, choose paths with if, and repeat with for and lists.' },
      { kind: 'points', title: 'Next', items: ['AI for Young Builders', 'AI for Teens', 'Daily tiny challenges'], say: 'Next, try AI for Young Builders or AI for Teens, and keep practising with tiny daily challenges.', chapter: 'Next' },
    ],
    checkpoints: [
      cp('p10-c1', 1, 'Strings in Python need…', [['Quotes', true, 'Yes.'], ['Batteries', false, 'Text uses quotes.']], 'Text uses quotes.'),
    ],
  },
]

export const PYTHON_STARTERS_VIDEOS: VideoDef[] = withSeries(PYTHON_STARTERS_SERIES, RAW)
