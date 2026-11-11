import { lessonResources, type Badge, type Curriculum, type Resource } from '@/lib/lms/curriculum'
import { MODULE_1 } from './module1'
import { MODULE_2 } from './module2'
import { MODULE_3 } from './module3'
import { MODULE_4 } from './module4'
import { AI_VIDEOS, aiVideoById } from './videos'

export const AI_COURSE_TITLE = 'AI for Young Builders: Train your own AI'

export const AI_MEDIA_BASE = '/lms-media/ai-young-builders'

export const AI_RESOURCES: Resource[] = [
  { id: 'handbook', title: 'Student handbook', file: 'resources/ai-young-builders-student-handbook.pdf', note: 'Every lesson in one booklet', audience: 'student' },
  { id: 'glossary', title: 'AI word wall', file: 'resources/ai-young-builders-glossary.pdf', note: 'Every new word, with a picture-free meaning', audience: 'student' },
  { id: 'safe-ai', title: 'Safe AI rules poster', file: 'resources/ai-young-builders-safe-ai-rules.pdf', note: 'Print it for the classroom wall', audience: 'student' },
  { id: 'data-sheet', title: 'Data collection sheet', file: 'resources/ai-young-builders-data-sheet.pdf', note: 'Plan features, labels and variety', audience: 'student' },
  { id: 'test-sheet', title: 'Testing worksheet', file: 'resources/ai-young-builders-testing-worksheet.pdf', note: 'Accuracy and confusion matrix practice', audience: 'student' },
  { id: 'prompts', title: 'Prompt-writing guide', file: 'resources/ai-young-builders-prompt-guide.pdf', note: 'Clear prompts, follow-ups and fact checks', audience: 'student' },
  { id: 'planner', title: 'Project planner', file: 'resources/ai-young-builders-project-planner.pdf', note: 'Plan, build, test, improve, present', audience: 'student' },
  { id: 'unplugged', title: 'Unplugged activity cards', file: 'resources/ai-young-builders-unplugged-cards.pdf', note: 'Nearest neighbours and decision trees on paper', audience: 'student' },
  { id: 'teacher', title: 'Teacher guide', file: 'resources/ai-young-builders-teacher-guide.pdf', note: 'Timings, devices, camera privacy, chat safety', audience: 'teacher' },
  { id: 'rubric', title: 'Assessment rubric', file: 'resources/ai-young-builders-assessment-rubric.pdf', note: 'How the final project is judged', audience: 'teacher' },
]

const LESSON_RESOURCES: Record<string, string[]> = {
  'ai101-01-welcome': ['handbook', 'safe-ai'],
  'ai101-02-rules-vs-learning': ['glossary'],
  'ai101-03-data': ['data-sheet'],
  'ai101-04-pixels': ['glossary'],
  'ai101-05-train': ['data-sheet'],
  'ai101-06-neighbours': ['unplugged'],
  'ai101-07-testing': ['test-sheet'],
  'ai101-08-trees': ['unplugged'],
  'ai101-11-chat': ['prompts', 'safe-ai'],
  'ai101-12-bias': ['test-sheet'],
  'ai101-13-responsible': ['safe-ai'],
  'ai101-14-project': ['planner', 'rubric'],
  'ai101-15-final-assessment': ['handbook'],
}

export const AI_BADGES: Badge[] = [
  { id: 'ai-explorer', name: 'AI Explorer', description: 'Finished What is AI?', lessons: MODULE_1.lessons.map((l) => l.slug) },
  { id: 'data-detective', name: 'Data Detective', description: 'Mastered features, labels and pixels', lessons: ['ai101-03-data', 'ai101-04-pixels'] },
  { id: 'model-trainer', name: 'Model Trainer', description: 'Trained, explained and tested a classifier', lessons: ['ai101-05-train', 'ai101-06-neighbours', 'ai101-07-testing'] },
  { id: 'language-lab', name: 'Language Lab', description: 'Built trees, read feelings and predicted words', lessons: ['ai101-08-trees', 'ai101-09-words', 'ai101-10-next-word', 'ai101-11-chat'] },
  { id: 'fairness-champion', name: 'Fairness Champion', description: 'Found and fixed unfair AI, and made the promise', lessons: ['ai101-12-bias', 'ai101-13-responsible'] },
  { id: 'ai-builder', name: 'AI Builder', description: 'Passed the final project and assessment', lessons: ['ai101-14-project', 'ai101-15-final-assessment'] },
]

export const AI_101: Curriculum = {
  key: 'ai-young-builders',
  courseTitle: AI_COURSE_TITLE,
  course: {
    subtitle: 'Train an AI that recognises your drawings, then make it fair and safe',
    description:
      'A hands-on introduction to artificial intelligence for Classes 5 to 8. Students train their own image classifier in the browser (by drawing or with the camera), discover how it decides, test it honestly, build a decision tree, teach a computer to read feelings, watch a tiny language model write, and talk to a real AI chatbot through a safe study helper. The course ends with fairness, responsible use and a project students design themselves. No coding or kit needed; works on school computers, tablets and phones.',
    category: 'AI',
    level: 'BEGINNER',
    gradeFrom: 5,
    gradeTo: 8,
    outcomes: [
      'Explain what AI is and how machine learning differs from rules',
      'Describe data as features and labels, and pictures as pixels',
      'Train, test and improve an image classifier',
      'Read accuracy and a confusion matrix',
      'Explain how chatbots predict the next word, and write clear, safe prompts',
      'Spot bias in data and use AI responsibly',
    ],
    academyPriceMinor: 0,
  },
  modules: [MODULE_1, MODULE_2, MODULE_3, MODULE_4],
  videos: AI_VIDEOS,
  videoById: aiVideoById,
  mediaBase: AI_MEDIA_BASE,
  resources: AI_RESOURCES,
  resourcesFor: lessonResources(AI_MEDIA_BASE, AI_RESOURCES, LESSON_RESOURCES),
  badges: AI_BADGES,
  player: { projectUploads: 'Screenshots of your model (optional)', notesHint: 'Write what you learned, questions to ask, or how your model did in testing.' },
}
