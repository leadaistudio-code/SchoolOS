import { academySeries, withSeries } from '@/lib/lms/catalogue/build'
import { cp, type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

export const AI_FOR_TEENS_SERIES = academySeries('AI for Teens', [], narrationTiming as NarrationTiming)

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 'e01',
    lessonSlug: 'ait-01-welcome',
    number: 1,
    title: 'Welcome: from demos to decisions',
    summary: ['Responsible AI starts before training', 'Users, data and metrics come first'],
    next: 'Write a problem statement.',
    scenes: [
      { kind: 'title', kicker: 'Welcome', title: 'From demos to decisions', say: 'Welcome to AI for Teens from MyCampusView Academy. Teen builders do more than click Train. You will ask whether a problem should use AI at all, what data is fair, and how you will know the system is good enough.', chapter: 'Welcome' },
      { kind: 'steps', title: 'Three questions before you build', items: ['Who is helped or harmed?', 'What data do you have — and what is missing?', 'How will you measure success beyond a screenshot?'], say: 'Three questions before you build. Who is helped or harmed? What data do you have, and what is missing? How will you measure success beyond a happy screenshot?' },
      { kind: 'points', title: 'India context', items: ['Multilingual classrooms', 'Uneven device access', 'Public services that must work for everyone'], say: 'Think of multilingual classrooms, uneven device access, and public services. An AI that only works on high-end phones in English may fail the students who need it most.', chapter: 'Context' },
    ],
    checkpoints: [
      cp('e01-c1', 1, 'Before training, clarify…', [['Who it helps, what data you have, how you measure success', true, 'Yes.'], ['Only the logo colour', false, 'Scope beats premature training.']], 'Scope beats premature training.'),
    ],
  },
  {
    id: 'e02',
    lessonSlug: 'ait-02-problem',
    number: 2,
    title: 'Write a problem statement',
    summary: ['Sharp problems name users and outcomes', 'Vague pitches waste training time'],
    next: 'Data inventories.',
    scenes: [
      { kind: 'title', kicker: 'Video 2', title: 'Write a problem statement', say: 'A good statement names the user, the job to be done, and what good looks like.', chapter: 'Framing' },
      { kind: 'parts', title: 'Sharp or vague?', items: [{ name: 'Practise quadratic equations with hints', job: 'Sharp' }, { name: 'Use AI to fix education', job: 'Vague' }, { name: 'Flag duplicate fee receipts', job: 'Sharp' }], say: 'Helping Class ten students practise quadratic equations with hints is sharp. Use AI to fix education is vague. Flagging duplicate fee receipts for accounts is sharp.' },
      { kind: 'points', title: 'Reject vague pitches', items: ['No user', 'No task', 'No metric'], say: 'Reject pitches with no user, no task and no metric. Technique without purpose is not a project.', chapter: 'Quality' },
    ],
    checkpoints: [
      cp('e02-c1', 1, 'A sharp AI problem statement includes…', [['User, task and success idea', true, 'Correct.'], ['Only the model name', false, 'Users and outcomes first.']], 'Users and outcomes first.'),
    ],
  },
  {
    id: 'e03',
    lessonSlug: 'ait-03-data',
    number: 3,
    title: 'Data inventories',
    summary: ['Data inventories reveal gaps and risks early', 'Minimum necessary data is safer'],
    next: 'Train / test splits.',
    scenes: [
      { kind: 'title', kicker: 'Video 3', title: 'Data inventories', say: 'List what you have, what you lack, and what would be unethical to collect.', chapter: 'Data' },
      { kind: 'diagram', title: 'Features and labels', diagram: 'features-labels', steps: 3, say: 'Each example has features you can measure and a label you want the model to learn. Inventory both.' },
      { kind: 'steps', title: 'Inventory pass', items: ['How many labelled examples?', 'Which groups are missing?', 'Which fields are sensitive?', 'Do you have consent?'], say: 'How many labelled examples do you have? Which groups, languages or devices are missing? Which fields are sensitive? Do you have consent for this purpose?', chapter: 'Pass' },
      { kind: 'points', title: 'Do not collect just in case', items: ['Extra personal fields create risk', 'Collect the minimum required', 'Purpose limits the data'], say: 'Do not collect personal fields just in case. Extra data creates risk without improving the model.' },
    ],
    checkpoints: [
      cp('e03-c1', 2, 'A data inventory should flag…', [['Gaps, sensitive fields and consent', true, 'Yes.'], ['Only file sizes', false, 'Gaps and privacy matter.']], 'Gaps and privacy matter.'),
    ],
  },
  {
    id: 'e04',
    lessonSlug: 'ait-04-split',
    number: 4,
    title: 'Train / test splits',
    summary: ['Never grade yourself on the training homework', 'Held-out tests estimate real performance'],
    next: 'Metrics beyond accuracy.',
    scenes: [
      { kind: 'title', kicker: 'Video 4', title: 'Train and test splits', say: 'If you test on the same examples you trained on, your score is flattering and false.', chapter: 'Splits' },
      { kind: 'diagram', title: 'Train then test', diagram: 'train-test', steps: 4, say: 'Hold out a test set you will not train on. Train on the rest. Score only on the held-out test set. The test set is the exam paper you must not study.' },
      { kind: 'steps', title: 'Honest order', items: ['Collect and clean labelled data', 'Hold out a test set', 'Train on the remainder', 'Score only on the test set'], say: 'Collect and clean labelled data. Hold out a test set. Train on the remainder. Score only on the test set.', chapter: 'Order' },
    ],
    checkpoints: [
      cp('e04-c1', 1, 'Testing on training data usually…', [['Overstates how good the model is', true, 'Correct.'], ['Is required by law', false, 'Memorisation looks like skill.']], 'Memorisation looks like skill.'),
    ],
  },
  {
    id: 'e05',
    lessonSlug: 'ait-05-metrics',
    number: 5,
    title: 'Metrics beyond “accuracy”',
    summary: ['Accuracy can mislead on imbalanced data', 'Choose metrics from real-world costs'],
    next: 'Bias: find it, fix what you can.',
    scenes: [
      { kind: 'title', kicker: 'Video 5', title: 'Metrics beyond accuracy', say: 'When classes are imbalanced, ninety-five percent accuracy can hide a useless model.', chapter: 'Metrics' },
      { kind: 'diagram', title: 'Confusion matrix', diagram: 'confusion-matrix', steps: 4, say: 'A confusion matrix shows predicted versus actual labels. It makes false alarms and missed cases visible.' },
      { kind: 'parts', title: 'Plain language', items: [{ name: 'Precision', job: 'Of the alarms we raised, how many were real?' }, { name: 'Recall', job: 'Of the real cases, how many did we catch?' }], say: 'Precision asks: of the alarms we raised, how many were real? Recall asks: of the real cases, how many did we catch?', chapter: 'Precision and recall' },
      { kind: 'points', title: 'The rare event trap', items: ['Ninety-eight normal transactions', 'Always say normal: ninety-eight percent accurate', 'Catch zero fraud'], say: 'If ninety-eight of one hundred transactions are normal, a model that always says normal is ninety-eight percent accurate and catches zero fraud.' },
    ],
    checkpoints: [
      cp('e05-c1', 3, 'Always predicting the majority class can yield…', [['High accuracy and useless performance', true, 'Yes.'], ['Perfect fairness automatically', false, 'Imbalance fools accuracy.']], 'Imbalance fools accuracy.'),
    ],
  },
  {
    id: 'e06',
    lessonSlug: 'ait-06-bias',
    number: 6,
    title: 'Bias: find it, fix what you can',
    summary: ['Missing groups create biased models', 'Measurement by group makes harm visible'],
    next: 'Generative AI: useful, not oracle.',
    scenes: [
      { kind: 'title', kicker: 'Video 6', title: 'Bias', say: 'Bias often enters through who appears in the data — and who does not.', chapter: 'Bias' },
      { kind: 'diagram', title: 'Biased data', diagram: 'bias-data', steps: 4, say: 'A face dataset from one city and age group will fail elsewhere. A resume screener trained only on past hires from one college can automate past bias.' },
      { kind: 'parts', title: 'Safer directions', items: [{ name: 'Handwriting across many schools', job: 'More variety' }, { name: 'Plant photos in several lighting conditions', job: 'Matches real farms' }], say: 'Safer directions include handwriting samples across many schools and scripts, and plant disease photos in several lighting conditions.' },
      { kind: 'points', title: 'Mitigations', items: ['Collect more varied data', 'Measure errors by group', 'Involve affected users', 'Sometimes do not automate'], say: 'Collect more varied data, measure errors by group, involve affected users, and sometimes decide not to automate a decision.', chapter: 'Fixes' },
    ],
    checkpoints: [
      cp('e06-c1', 1, 'A common source of AI bias is…', [['Unrepresentative training data', true, 'Correct.'], ['Using too many comments', false, 'Who is missing from data matters.']], 'Who is missing from data matters.'),
    ],
  },
  {
    id: 'e07',
    lessonSlug: 'ait-07-genai',
    number: 7,
    title: 'Generative AI: useful, not oracle',
    summary: ['Fluency is not truth', 'Verify, protect privacy, disclose AI help'],
    next: 'Project: scoped AI prototype.',
    scenes: [
      { kind: 'title', kicker: 'Video 7', title: 'Generative AI', say: 'Chat models predict likely text. They can be fluent and wrong in the same paragraph.', chapter: 'GenAI' },
      { kind: 'diagram', title: 'Chatbot flow', diagram: 'chatbot-flow', steps: 4, say: 'A chatbot predicts the next word again and again. That fluency can hide mistakes, so you verify important claims.' },
      { kind: 'steps', title: 'Before you trust an answer', items: ['Check facts with a trusted source', 'Do not paste passwords or IDs', 'Say when AI helped', 'Rewrite in your own words'], say: 'Check facts with a textbook, teacher or trusted site. Do not paste passwords or personal IDs. Say when AI helped. Rewrite in your own words.', chapter: 'Habits' },
      { kind: 'chat', title: 'Safe study helper', messages: [{ from: 'you', text: 'Explain fractions with a pizza example.' }, { from: 'ai', text: 'Sure — imagine a pizza cut into eight slices…' }], say: 'Good prompts ask for explanations without sharing personal details. Bad prompts ask for home addresses or passwords.' },
    ],
    checkpoints: [
      cp('e07-c1', 2, 'A chat model’s confident tone means…', [['Nothing by itself — verify important claims', true, 'Yes.'], ['It must be correct', false, 'Confidence is not evidence.']], 'Confidence is not evidence.'),
    ],
  },
  {
    id: 'e08',
    lessonSlug: 'ait-08-project',
    number: 8,
    title: 'Project: scoped AI prototype',
    summary: ['Shipping includes documentation', 'Limits are features of trustworthy work'],
    next: 'Write a mini model card.',
    scenes: [
      { kind: 'title', kicker: 'Video 8', title: 'Scoped AI prototype', say: 'Build a small prototype with a clear user, dataset plan, metric and limitation list.', chapter: 'Project' },
      { kind: 'diagram', title: 'The project loop', diagram: 'ai-pipeline', steps: 6, say: 'Plan, collect, train, test, improve, share. Honest documentation is part of the loop.' },
      { kind: 'parts', title: 'Choose a lane', items: [{ name: 'Classifier', job: 'School-relevant image or text task' }, { name: 'Study helper', job: 'Generative AI with citation checks' }, { name: 'Evaluation report', job: 'Group error analysis on a public model' }], say: 'Choose a classifier for a school-relevant task, a generative study helper with citation checks, or an evaluation report on a public model.', chapter: 'Lanes' },
      { kind: 'points', title: 'What to hand in', items: ['Problem statement', 'Data notes', 'Metric', 'Demo or screenshots', 'Top three limitations'], say: 'Hand in a problem statement, data notes, metric, demo or screenshots, and your top three limitations. Honesty about limits beats flashy accuracy claims.' },
    ],
    checkpoints: [
      cp('e08-c1', 3, 'Assessment should reward…', [['Honest limits as much as demo polish', true, 'Correct.'], ['Only the highest accuracy claim', false, 'Honesty builds trust.']], 'Honesty about limits matters.'),
    ],
  },
  {
    id: 'e09',
    lessonSlug: 'ait-09-card',
    number: 9,
    title: 'Write a mini model card',
    summary: ['Model cards make claims checkable', 'Out-of-scope uses prevent misuse'],
    next: 'AI for Teens check.',
    scenes: [
      { kind: 'title', kicker: 'Video 9', title: 'Mini model card', say: 'A model card is a short nutrition label for your system.', chapter: 'Model card' },
      { kind: 'steps', title: 'Sections', items: ['Intended use', 'Data sources and gaps', 'Metrics and which split', 'Risks and out-of-scope uses'], say: 'Cover intended use, data sources and gaps, metrics and which split you used, plus risks and out-of-scope uses.' },
      { kind: 'points', title: 'Why it matters', items: ['Others can check your claims', 'Misuse becomes harder', 'You remember your own limits later'], say: 'Model cards make claims checkable, make misuse harder, and help you remember your own limits later.', chapter: 'Why' },
    ],
    checkpoints: [
      cp('e09-c1', 1, 'A model card should include…', [['Intended use, data, metrics and risks', true, 'Yes.'], ['Only marketing quotes', false, 'Cards document use and limits.']], 'Cards document use and limits.'),
    ],
  },
  {
    id: 'e10',
    lessonSlug: 'ait-10-quiz',
    number: 10,
    title: 'AI for Teens check',
    summary: ['You can judge AI systems, not only run them', 'Keep practising with real school problems'],
    next: 'Mentor younger learners on AI for Young Builders if you like.',
    scenes: [
      { kind: 'title', kicker: 'Video 10', title: 'Course check', say: 'A short recap before your quiz: framing, evaluation, bias and generative habits.', chapter: 'Recap' },
      { kind: 'points', title: 'You can now', items: ['Frame a sharp AI problem', 'Split train and test honestly', 'Choose metrics beyond accuracy', 'Write a model card'], say: 'You can frame a sharp AI problem, split train and test honestly, choose metrics beyond accuracy, and write a model card.' },
      { kind: 'points', title: 'Keep going', items: ['Mentor younger builders', 'Stress-test public demos', 'Ship with documentation'], say: 'Keep going: mentor younger builders, stress-test public demos, and ship with documentation.', chapter: 'Next' },
    ],
    checkpoints: [
      cp('e10-c1', 1, 'Held-out test data is for…', [['Honest evaluation after training', true, 'Correct.'], ['Training only', false, 'Test sets estimate real performance.']], 'Test sets estimate real performance.'),
    ],
  },
]

export const AI_FOR_TEENS_VIDEOS: VideoDef[] = withSeries(AI_FOR_TEENS_SERIES, RAW)
