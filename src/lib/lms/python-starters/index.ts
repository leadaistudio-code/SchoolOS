import { catalogueCurriculum, lesson, module, q } from '@/lib/lms/catalogue/build'

export const PYTHON_STARTERS_TITLE = 'Python Starters: Make things happen'

/** Classes 6–9. First typed Python with tiny, runnable ideas. */
export const PYTHON_STARTERS = catalogueCurriculum({
  key: 'python-starters',
  courseTitle: PYTHON_STARTERS_TITLE,
  mediaBase: '/lms-media/python-starters',
  notesHint: 'Paste a short snippet you tried, or note an error message you fixed.',
  course: {
    subtitle: 'Your first real programs — variables, loops, decisions and tiny projects',
    description:
      'A first Python course for Classes 6 to 9. Students print messages, store values, use if/else and loops, handle simple lists and build small text projects. Works in any modern browser or school Python lab. Bridges Tiny Coders thinking into typed code.',
    category: 'CODING',
    level: 'BEGINNER',
    gradeFrom: 6,
    gradeTo: 9,
    outcomes: [
      'Write and run short Python programs',
      'Use variables, if/else and for-loops',
      'Store items in a list and loop through them',
      'Debug a simple error message',
    ],
    academyPriceMinor: 49_900,
  },
  badges: [
    { id: 'py-hello', name: 'Hello Python', description: 'Printed, stored and calculated', lessons: ['py-01-welcome', 'py-02-print', 'py-03-variables'] },
    { id: 'py-flow', name: 'Flow Controller', description: 'Used decisions and loops', lessons: ['py-04-if', 'py-05-loops', 'py-06-lists'] },
    { id: 'py-builder', name: 'Python Starter', description: 'Shipped a mini project', lessons: ['py-07-errors', 'py-08-project', 'py-09-polish', 'py-10-quiz'] },
  ],
  modules: [
    module('m1', 'Talking to Python', 'Print, values and variables.', [
      lesson({
        slug: 'py-01-welcome',
        title: 'Welcome: Python is a language for instructions',
        minutes: 10,
        intro: 'Python is a popular language for beginners and professionals. You type instructions; the computer carries them out.',
        objectives: ['Say what Python is used for', 'Know that spelling and indentation matter'],
        blocks: [
          {
            type: 'text',
            heading: 'Where Python shows up',
            body: 'Websites, data science, school automation scripts and many AI tools use Python. You will start with tiny programs you can understand line by line.',
          },
          {
            type: 'code',
            language: 'python',
            code: 'print("Hello, MyCampusView!")\n',
            caption: 'Your first instruction: show a message.',
          },
        ],
        summary: ['Python runs instructions in order.', 'Small programs are the best teachers.'],
        next: 'Next, master print.',
        questions: [q('q1', 'Python programs are…', 'Instructions the computer follows', ['Only drawings', 'Hardware chips'], 'Python is a programming language.')],
      }),
      lesson({
        slug: 'py-02-print',
        title: 'print: show something on screen',
        minutes: 12,
        intro: 'print sends text (and numbers) to the output so you can see what your program is doing.',
        objectives: ['Use print with text and numbers', 'Use quotes for text'],
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'print("Namaste")\nprint(7 + 5)\nprint("7 + 5 =", 7 + 5)\n',
            caption: 'Text needs quotes. Numbers can be calculated.',
          },
          {
            type: 'check',
            id: 'quotes',
            prompt: 'Which line correctly prints the word school?',
            options: [
              { id: 'a', text: 'print("school")', correct: true, feedback: 'Quotes mark text.' },
              { id: 'b', text: 'print(school)', correct: false, feedback: 'Without quotes, Python looks for a variable named school.' },
              { id: 'c', text: 'print school', correct: false, feedback: 'You need parentheses in modern Python.' },
            ],
            explanation: 'Strings use quotes; bare names are variables.',
          },
        ],
        summary: ['print shows output.', 'Strings need quotes.'],
        next: 'Store values in variables.',
        questions: [q('q1', 'print("hi") shows…', 'hi', ['an error always', 'the word print'], 'Quotes wrap the text to show.')],
      }),
      lesson({
        slug: 'py-03-variables',
        title: 'Variables: labelled boxes',
        minutes: 14,
        intro: 'A variable remembers a value under a name you choose.',
        objectives: ['Create a variable', 'Update and reuse it'],
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'name = "Asha"\nscore = 0\nscore = score + 10\nprint(name, "scored", score)\n',
            caption: 'Names on the left, values on the right.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Good names',
            body: 'Prefer `score` over `x`. Clear names are part of good coding.',
          },
        ],
        summary: ['Variables store values.', 'You can change them later in the program.'],
        next: 'Make decisions with if.',
        questions: [q('q1', 'In score = 10, score is a…', 'Variable name', ['Loop', 'Sensor'], 'The name labels the stored value.')],
      }),
    ]),
    module('m2', 'Decisions and repeats', 'if, for, and lists.', [
      lesson({
        slug: 'py-04-if',
        title: 'if / else: choose a path',
        minutes: 14,
        intro: 'Conditions let your program react differently to different values.',
        objectives: ['Write a simple if/else', 'Compare numbers'],
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'marks = 82\nif marks >= 40:\n    print("Pass")\nelse:\n    print("Try again")\n',
            caption: 'Indent the lines that belong inside the if/else.',
          },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'IndentationError',
            body: 'Python uses indentation (spaces at the start of the line) to group code. Keep four spaces consistently in this course.',
          },
        ],
        summary: ['if/else chooses between paths.', 'Indentation marks which lines belong together.'],
        next: 'Repeat work with for-loops.',
        questions: [q('q1', 'if marks >= 40 checks a…', 'Condition', ['Printer', 'Folder'], 'Conditions decide which branch runs.')],
      }),
      lesson({
        slug: 'py-05-loops',
        title: 'for-loops: repeat with a counter',
        minutes: 14,
        intro: 'Loops stop you from copying the same line again and again.',
        objectives: ['Write a for-loop over a range', 'Explain what the loop variable is'],
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'for n in range(1, 6):\n    print("Step", n)\n',
            caption: 'range(1, 6) gives 1,2,3,4,5 — it stops before 6.',
          },
          {
            type: 'check',
            id: 'range-check',
            prompt: 'How many times does range(3) run a loop body?',
            options: [
              { id: 'a', text: '3 times (0, 1, 2)', correct: true, feedback: 'Yes — range(3) starts at 0.' },
              { id: 'b', text: '1 time', correct: false, feedback: 'It repeats for each number in the range.' },
              { id: 'c', text: '30 times', correct: false, feedback: 'range(3) is three values.' },
            ],
            explanation: 'range(n) → 0 .. n-1.',
          },
        ],
        summary: ['for-loops repeat a block.', 'range controls how many times.'],
        next: 'Store many values in a list.',
        questions: [q('q1', 'A for-loop is for…', 'Repeating a block of code', ['Deleting Python', 'Only printing once'], 'Loops repeat.')],
      }),
      lesson({
        slug: 'py-06-lists',
        title: 'Lists: many values in order',
        minutes: 14,
        intro: 'A list holds an ordered collection — names, scores, tasks.',
        objectives: ['Create a list', 'Loop through its items'],
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'subjects = ["Maths", "Science", "English"]\nfor s in subjects:\n    print("Today:", s)\nprint("Count:", len(subjects))\n',
            caption: 'Square brackets create a list. len counts items.',
          },
        ],
        summary: ['Lists store ordered items.', 'You can loop through them.'],
        next: 'Read error messages calmly.',
        questions: [q('q1', 'len(subjects) returns…', 'How many items are in the list', ['The first item only', 'A random number'], 'len measures length.')],
      }),
    ]),
    module('m3', 'Debug and build', 'Errors, project, polish.', [
      lesson({
        slug: 'py-07-errors',
        title: 'Reading error messages',
        minutes: 12,
        intro: 'Errors are clues. The last lines usually name the file, line number and error type.',
        objectives: ['Identify a NameError vs SyntaxError', 'Fix a small broken snippet'],
        blocks: [
          {
            type: 'sort',
            id: 'error-types',
            title: 'Which error?',
            prompt: 'Match the situation.',
            bins: [
              { id: 'name', label: 'NameError' },
              { id: 'syntax', label: 'SyntaxError' },
            ],
            items: [
              { id: 'a', text: 'You forgot a colon after if marks > 40', bin: 'syntax', why: 'Python cannot parse the incomplete if line.' },
              { id: 'b', text: 'You used score before creating it', bin: 'name', why: 'Python does not know that name yet.' },
              { id: 'c', text: 'You forgot a closing quote', bin: 'syntax', why: 'The line cannot be parsed.' },
              { id: 'd', text: 'You wrote print(total) but total was never set', bin: 'name', why: 'Unknown variable name.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Debug habit',
            body: 'Read the error from the bottom up. Fix one issue, run again.',
          },
        ],
        summary: ['Errors point to a line and a type.', 'Fix, re-run, repeat.'],
        next: 'Build a mini text project.',
        questions: [q('q1', 'A missing variable name usually causes…', 'NameError', ['A new battery', 'Silent success'], 'Unknown names → NameError.')],
      }),
      lesson({
        slug: 'py-08-project',
        title: 'Project: quiz or score tracker',
        minutes: 22,
        kind: 'PROJECT',
        intro: 'Build a tiny Python program that uses variables, a decision, and a loop or list.',
        objectives: ['Ship a working mini program', 'Include comments for a reader'],
        body: 'Choose one:\n1) A 3-question quiz that prints a final score.\n2) A list of chores that prints each with a number.\n3) A marks grader (input a score, print Pass/Fail).\nSubmit your code and a short note on one bug you fixed.',
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: '# Example skeleton — replace with your idea\nscore = 0\nprint("Question 1: 2+2?")\n# … check answer, update score\nprint("Final:", score)\n',
            caption: 'Start small. Grow one feature at a time.',
          },
        ],
        summary: ['Projects combine the tools you learned.', 'Comments help humans.'],
        next: 'Polish for readability.',
      }),
      lesson({
        slug: 'py-09-polish',
        title: 'Make it readable',
        minutes: 10,
        intro: 'Readable code is kinder to future you — and to teachers reviewing your work.',
        objectives: ['Rename unclear variables', 'Add a short comment at the top'],
        blocks: [
          {
            type: 'text',
            heading: 'Polish checklist',
            body: '- Clear variable names\n- One comment describing the program’s purpose\n- Consistent indentation\n- A final print that states the result',
          },
        ],
        summary: ['Clarity is part of quality.', 'Small cleanups prevent big confusion.'],
        next: 'Course check quiz.',
        questions: [q('q1', 'Good variable names are…', 'Clear about what they store', ['Always one letter', 'Random emojis'], 'Clear names document intent.')],
      }),
      lesson({
        slug: 'py-10-quiz',
        title: 'Python Starters check',
        minutes: 12,
        kind: 'QUIZ',
        intro: 'A short check of print, variables, if, loops and lists.',
        objectives: ['Show what you remember'],
        blocks: [{ type: 'text', heading: 'Ready?', body: 'Skim earlier lessons if you want examples first.' }],
        summary: ['You can write real Python programs.', 'Keep practising with tiny daily challenges.'],
        next: 'Try AI for Young Builders or AI for Teens next.',
        questions: [
          q('q1', 'Strings in Python need…', 'Quotes', ['Batteries', 'Only capitals'], 'Text uses quotes.'),
          q('q2', 'for n in range(3): repeats…', '3 times', ['Forever', 'Never'], 'range(3) → three iterations.'),
          q('q3', 'A list uses…', 'Square brackets [ ]', ['Only curly braces', 'Angle brackets'], 'Lists use [].'),
        ],
      }),
    ]),
  ],
})
