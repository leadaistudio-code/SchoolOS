import { cp, type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming, VideoSeries } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

/** Pronunciation for the voice; captions keep the written form. */
const SAY: [RegExp, string][] = [
  [/\bMyCampusView\b/g, 'My Campus View'],
  [/\bAIs\b/g, 'A Is'],
  [/\bAI\b/g, 'A I'],
  [/\bk-NN\b/g, 'K N N'],
  [/\bk = (\d+)/g, 'K equals $1'],
  [/\bRGB\b/g, 'R G B'],
  [/\bUPI\b/g, 'U P I'],
  [/(\d+) × (\d+)/g, '$1 by $2'],
]

export const AI_SERIES: VideoSeries = {
  name: 'AI for Young Builders',
  say: SAY,
  timing: narrationTiming as NarrationTiming,
  pronounce: 'AI (A-I), k-NN (K-N-N), RGB (R-G-B), Bhashini (BHAA-shi-nee)',
}

const RAW: Omit<VideoDef, 'series'>[] = [
  {
    id: 'a01',
    lessonSlug: 'ai101-01-welcome',
    number: 1,
    title: 'Welcome: AI is all around you',
    summary: ['AI is a computer doing tasks that usually need human thinking', 'Most AI learns patterns from examples', 'AI can be wrong, so keep personal details private and check facts'],
    next: 'Rules or learning? How AI learns.',
    scenes: [
      { kind: 'title', kicker: 'Welcome', title: 'AI is all around you', say: 'Welcome to AI for Young Builders! In this course you will build your very own AI, one that learns to recognise drawings and things you show it, right in your browser.', chapter: 'Welcome' },
      { kind: 'diagram', title: 'Where you meet AI', diagram: 'ai-everywhere', steps: 5, say: 'You probably used AI today without noticing. Your phone unlocks when it sees your face. A maps app predicts traffic. An app translates Hindi into Tamil. A video app suggests what to watch next. Every one of these learned patterns from examples.', chapter: 'AI around you' },
      { kind: 'points', title: 'So what is AI?', items: ['A computer doing a task that usually needs a human brain', 'Most AI learns from lots of examples', 'Not magic, not alive: a pattern-finder built by people'], say: 'So what is AI? Artificial intelligence means a computer doing something we usually think needs a human brain. Most AI does this by learning from lots of examples. It is not magic, and it is not alive. It is a pattern-finder, built by people.' },
      { kind: 'points', title: 'AI in India', items: ['Banks spot suspicious UPI payments', 'Bhashini translates between Indian languages', 'Farmers photograph leaves to check for crop disease'], say: 'AI is busy in India too. Banks use it to spot suspicious UPI payments in a split second. Bhashini, a Government of India project, translates between Indian languages. And farmers can photograph a leaf to check for crop disease.' },
      { kind: 'steps', title: 'What you will do', items: ['Train your own image classifier', 'Test it and fix its mistakes', 'Talk to a real AI chatbot, safely', 'Make AI fairer'], say: 'Here is your journey. You will train your own image classifier. You will test it and fix its mistakes. You will talk to a real AI chatbot, safely. And you will learn how to make AI fairer for everyone.', chapter: 'Your journey' },
      { kind: 'points', title: 'Five Safe AI rules', items: ['Keep personal details private', 'AI can be wrong: check facts', 'Be kind', 'Be honest about using AI', 'Ask an adult if something worries you'], say: 'Before we start, five Safe AI rules. Keep personal details private. Remember that AI can be wrong, so check important facts. Be kind. Be honest when you use AI. And ask an adult if anything worries you.', chapter: 'Safe AI rules' },
    ],
    checkpoints: [
      cp('a01-c1', 3, 'Which of these uses AI?', [['A phone that unlocks when it sees your face', true, 'Yes. It learned your face from examples.'], ['A calculator adding numbers', false, 'Adding follows exact rules. Nothing is learned.'], ['A fan with a speed knob', false, 'You set the speed. It learns nothing.']], 'AI learns patterns from examples, like what your face looks like.'),
      cp('a01-c2', 5, 'A chatbot asks for your home address. What do you do?', [['Do not share it, and tell an adult', true, 'Exactly right.'], ['Share it if it promises a prize', false, 'Prizes are a common trick. Keep your address private.']], 'Personal details always stay private.'),
    ],
  },
  {
    id: 'a02',
    lessonSlug: 'ai101-02-rules-vs-learning',
    number: 2,
    title: 'Rules or learning? How AI learns',
    summary: ['Normal programs follow rules a person wrote', 'Machine learning finds the rules from labelled examples', 'The steps are collect, label, train, test, use'],
    next: 'Data: features and labels.',
    scenes: [
      { kind: 'title', kicker: 'Video 2', title: 'Rules or learning?', say: 'There are two ways to make a computer smart. One is very old. The other powers almost every AI you use today.', chapter: 'Two ways' },
      { kind: 'diagram', title: 'A normal program', diagram: 'rules-vs-learning', steps: 1, say: 'The old way is rules. A person writes exact instructions, like: if the temperature is above thirty degrees, switch on the fan. The program takes an input, follows the rules, and gives an answer.' },
      { kind: 'points', title: 'Try writing rules for a cat', items: ['Big or small', 'Orange, black, striped', 'Sleeping, jumping, hiding'], say: 'Now try writing rules for: is this a photo of a cat? Cats can be big or small, orange or striped, sleeping, jumping or hiding behind a curtain. You would never finish writing the rules.' },
      { kind: 'diagram', title: 'Machine learning', diagram: 'rules-vs-learning', steps: 3, say: 'So machine learning flips it around. You give the computer lots of examples, and the right answers, called labels. It finds the patterns itself and builds a model. Then you give the model something new, and it makes a prediction.', chapter: 'Machine learning' },
      { kind: 'steps', title: 'Five steps', items: ['Collect examples', 'Label them', 'Train a model', 'Test it on new examples', 'Use it'], say: 'Machine learning always follows five steps. Collect examples. Label them. Train a model. Test it on examples it has never seen. And then use it. If the test goes badly, go back and collect better data.', chapter: 'Five steps' },
      { kind: 'parts', title: 'Which is best?', items: [{ name: 'Ring the bell at 9:00', job: 'Rules: one clear instruction' }, { name: 'Read handwriting', job: 'Learning: everyone writes differently' }, { name: 'Spot spam messages', job: 'Learning: spammers keep changing' }], say: 'So which should you use? Ringing the school bell at nine o’clock needs one simple rule. But reading handwriting, or spotting spam, is messy and keeps changing. That is where learning shines.' },
    ],
    checkpoints: [
      cp('a02-c1', 3, 'In machine learning, who works out the rules?', [['The computer, from labelled examples', true, 'Correct.'], ['A person writes every rule', false, 'That is a normal program.']], 'Machine learning finds the patterns in labelled examples.'),
      cp('a02-c2', 4, 'What comes straight after labelling the examples?', [['Training the model', true, 'Yes. Then you test it.'], ['Using it in the real world', false, 'Train and test it first.']], 'Collect, label, train, test, use.'),
    ],
  },
  {
    id: 'a03',
    lessonSlug: 'ai101-03-data',
    number: 3,
    title: 'Data: features and labels',
    summary: ['Data is a set of examples', 'Features are the clues; the label is the answer', 'More examples, and more variety, make better AI'],
    next: 'How computers see: pixels.',
    scenes: [
      { kind: 'title', kicker: 'Video 3', title: 'Data: features and labels', say: 'An AI is only as good as the examples it learns from. So let us look closely at those examples: the data.', chapter: 'Data' },
      { kind: 'diagram', title: 'One row, one example', diagram: 'features-labels', steps: 3, say: 'Here is some data about fruit. Each row is one example. Colour, size and shape are features: clues we can measure. The fruit name is the label: the answer we want the AI to learn.', chapter: 'Features and labels' },
      { kind: 'points', title: 'Good clues and bad clues', items: ['Colour: great for apple or orange', 'Shape of the ears: great for cat or dog', 'Date the photo was taken: useless'], say: 'Good features connect to the label. Colour is a great clue for apple or orange. Ear shape helps tell cats from dogs. But the date a photo was taken tells you nothing at all, so it is a useless feature.' },
      { kind: 'points', title: 'The brown dog problem', items: ['Every dog photo: a brown dog on grass', 'The AI learns: brown thing on grass means dog', 'A white dog indoors: wrong!'], say: 'Watch out for this trap. If every dog photo shows a brown dog on grass, the AI might learn that a brown thing on grass means dog. Then it gets a white dog indoors completely wrong.', chapter: 'Variety' },
      { kind: 'steps', title: 'Good data has', items: ['Lots of examples', 'Lots of variety: colours, sizes, angles, light', 'Correct labels'], say: 'So good data has three things. Lots of examples. Lots of variety: different colours, sizes, angles, lighting and backgrounds. And labels that are correct.' },
    ],
    checkpoints: [
      cp('a03-c1', 1, 'In the fruit table, what is the label?', [['The fruit name', true, 'Yes, the answer.'], ['The colour', false, 'Colour is a feature, a clue.']], 'Features are clues; the label is the answer.'),
      cp('a03-c2', 3, 'Your mango AI only saw photos in sunlight. What might go wrong?', [['It may fail on photos taken indoors', true, 'Right. It never saw dim light.'], ['Nothing at all', false, 'An AI only knows what it has seen.']], 'Train on the variety the AI will meet in real life.'),
    ],
  },
  {
    id: 'a04',
    lessonSlug: 'ai101-04-pixels',
    number: 4,
    title: 'How computers see: pixels',
    summary: ['A picture is a grid of pixels', 'Each pixel is stored as a number', 'Colour pixels have red, green and blue numbers'],
    next: 'Train your first AI model.',
    scenes: [
      { kind: 'title', kicker: 'Video 4', title: 'How computers see', say: 'You see a smiley face. A computer sees a grid of numbers. Let us find out why.', chapter: 'Pixels' },
      { kind: 'diagram', title: 'Zoom in', diagram: 'pixels', steps: 3, say: 'Zoom in far enough on any digital picture and you find tiny squares called pixels. In a black-and-white picture each pixel can be stored as a number: one for black, zero for white. So this smiley face is really sixty-four numbers.' },
      { kind: 'points', title: 'Grey and colour', items: ['Grey: 0 to 255 for each pixel', 'Colour: three numbers, RGB', 'Red, green and blue light mixed together'], say: 'Grey pictures use a number from zero to two hundred and fifty-five for each pixel. Colour pictures use three numbers per pixel: how much red, green and blue light to mix. That is called RGB.', chapter: 'Colour' },
      { kind: 'bars', title: 'How many numbers?', caption: 'Numbers stored for one picture', bars: [{ label: '8 × 8 smiley', value: 64 }, { label: '28 × 28 digit', value: 784 }, { label: '100 × 100 colour', value: 30000 }], say: 'The numbers add up fast. Our smiley is sixty-four numbers. A small handwritten digit, twenty-eight by twenty-eight, is seven hundred and eighty-four. A tiny colour photo, a hundred by a hundred, is thirty thousand. A phone photo is millions.' },
      { kind: 'points', title: 'Why numbers?', items: ['Computers can only calculate with numbers', 'AI looks for patterns in the numbers', 'Similar pictures have similar numbers'], say: 'Why does this matter? Computers can only calculate with numbers. An AI never sees a cat. It sees numbers, and learns which patterns of numbers usually mean cat. Similar pictures have similar numbers. Remember that, because your model will use it.', chapter: 'Why it matters' },
    ],
    checkpoints: [
      cp('a04-c1', 1, 'A picture is 10 pixels wide and 10 tall. How many numbers in black and white?', [['100', true, '10 times 10.'], ['20', false, 'That is 10 plus 10.']], 'Width times height gives the number of pixels.'),
      cp('a04-c2', 2, 'How many numbers describe one colour pixel?', [['Three: red, green and blue', true, 'Yes, RGB.'], ['One', false, 'One is enough for grey, not colour.']], 'Colour pixels mix red, green and blue.'),
    ],
  },
  {
    id: 'a05',
    lessonSlug: 'ai101-05-train',
    number: 5,
    title: 'Train your first AI model',
    summary: ['Choose groups and draw labelled examples', 'Press Train, then try new drawings', 'Low confidence means the model needs better examples'],
    next: 'How your AI decides: nearest neighbours.',
    scenes: [
      { kind: 'title', kicker: 'Video 5', title: 'Train your first AI', say: 'Time to build! In this lesson you will train an image classifier: an AI that sorts drawings into groups you choose.', chapter: 'Your first model' },
      { kind: 'steps', title: 'Four steps', items: ['Choose your groups', 'Draw examples for each group', 'Press Train', 'Try new drawings'], say: 'There are four steps. Choose your groups, like circle, triangle and square. Draw at least five examples of each. Press Train. Then draw something new and see what your model thinks.', chapter: 'How it works' },
      { kind: 'points', title: 'Draw with variety', items: ['Big and small', 'Neat and messy', 'Different places on the canvas'], say: 'Here is the secret to a smart model: variety. Draw some shapes big and some small, some neat and some messy, in different places on the canvas. The more kinds of example it sees, the better it copes with new drawings.' },
      { kind: 'bars', title: 'How sure is it?', caption: 'Confidence for one new drawing', unit: '%', bars: [{ label: 'Triangle', value: 67 }, { label: 'Circle', value: 33 }, { label: 'Square', value: 0 }], say: 'When you test a drawing, the model shows its confidence. Here it is sixty-seven percent sure this is a triangle. Low confidence means the drawing sits between groups, and your model needs more examples.', chapter: 'Confidence' },
      { kind: 'steps', title: 'The improvement loop', items: ['Test it', 'Find the mistakes', 'Add better examples', 'Train again'], say: 'If your model mixes two groups up, add more examples of both, especially the kind it got wrong, then train again. Test, find mistakes, add better data, retrain. That loop is exactly what AI engineers do every day.', chapter: 'Improve it' },
      { kind: 'points', title: 'Private by design', items: ['Training happens in your browser', 'Your drawings are not sent anywhere to train', 'Real AI: the same idea, millions of examples'], say: 'Your model trains right in your browser, so your drawings are not sent anywhere to train it. Big image AIs work the same way, just with millions of examples and much bigger models.' },
    ],
    checkpoints: [
      cp('a05-c1', 2, 'Which set of examples will train a smarter model?', [['Shapes of different sizes, neat and messy', true, 'Yes. Variety helps.'], ['Ten identical neat shapes', false, 'Identical examples teach it very little.']], 'Variety in examples makes a model cope with new drawings.'),
      cp('a05-c2', 4, 'Your model calls squares circles. What is the best fix?', [['Add more varied squares and circles, then retrain', true, 'Exactly.'], ['Delete all the squares', false, 'Then it could never recognise squares.']], 'Fix mistakes with better data and retrain.'),
    ],
  },
  {
    id: 'a06',
    lessonSlug: 'ai101-06-neighbours',
    number: 6,
    title: 'How your AI decides: nearest neighbours',
    summary: ['Similar examples sit close together', 'The k nearest examples vote', 'Mistakes happen most near the border between groups'],
    next: 'Testing: is your AI any good?',
    scenes: [
      { kind: 'title', kicker: 'Video 6', title: 'Ask the neighbours', say: 'How did your model decide? It used one of the oldest and simplest ideas in AI, called k nearest neighbours.', chapter: 'Nearest neighbours' },
      { kind: 'diagram', title: 'Examples as dots', diagram: 'nearest-neighbour', steps: 1, say: 'Imagine every example as a dot on a map. Here, fruits are placed by sweetness and size. Mangoes gather in one corner, lemons in another, because similar things sit close together.' },
      { kind: 'diagram', title: 'A new fruit arrives', diagram: 'nearest-neighbour', steps: 4, say: 'A new fruit arrives. The model measures how far it is from every example, picks the three closest, and lets them vote. Two mangoes and one lemon. Mango wins!', chapter: 'The vote' },
      { kind: 'points', title: 'Choosing k', items: ['k is how many neighbours vote', 'With two groups, pick an odd k to avoid ties', 'Changing k can change the answer'], say: 'The letter k is just how many neighbours get a vote. With two groups, people pick an odd number like three or five, so the vote can never tie. And changing k can change the answer, so it is worth experimenting.' },
      { kind: 'points', title: 'Your drawings, too', items: ['Each drawing: 256 pixel numbers', 'A dot in a space with 256 directions', 'Similar drawings sit close together'], say: 'Your drawing model did exactly this. Each drawing became two hundred and fifty-six pixel numbers, which is a dot in a space with two hundred and fifty-six directions. We cannot picture that, but the maths works the same way.', chapter: 'Your model' },
      { kind: 'points', title: 'Where mistakes happen', items: ['Deep inside a group: all neighbours agree', 'Near the border: the vote is close', 'More examples near the border help most'], say: 'Where does the model go wrong? Deep inside a group, every neighbour agrees, so it is easy. Near the border between groups the neighbours are mixed and the vote is close. Adding examples near the border helps the most.' },
    ],
    checkpoints: [
      cp('a06-c1', 2, 'With k = 3, the neighbours are mango, lemon, mango. What is the prediction?', [['Mango', true, 'Two votes to one.'], ['Lemon', false, 'Count again: two mangoes.']], 'The k nearest neighbours vote; the majority wins.'),
      cp('a06-c2', 5, 'Where is the model most likely to be wrong?', [['Near the border between groups', true, 'Yes. The vote is close there.'], ['In the middle of a big group', false, 'There every neighbour agrees.']], 'Mixed neighbours near the border make mistakes likely.'),
    ],
  },
  {
    id: 'a07',
    lessonSlug: 'ai101-07-testing',
    number: 7,
    title: 'Testing: is your AI any good?',
    summary: ['Test on examples the model has never seen', 'Accuracy is the share it gets right', 'A confusion matrix shows which groups get mixed up'],
    next: 'Decision trees: AI that asks questions.',
    scenes: [
      { kind: 'title', kicker: 'Video 7', title: 'Is your AI any good?', say: 'A model that only works on the examples it was trained on is like a student who memorised last year’s answers. Let us test it properly.', chapter: 'A fair test' },
      { kind: 'diagram', title: 'Keep some back', diagram: 'train-test', steps: 3, say: 'Keep some examples back. Train on the rest. Then test on the ones the model has never seen, just like an exam has new questions. That is a fair test.' },
      { kind: 'bars', title: 'Accuracy', caption: 'Right answers out of 20 test examples', bars: [{ label: 'Right', value: 16 }, { label: 'Wrong', value: 4 }], say: 'Accuracy is the share of test examples it gets right. Sixteen right out of twenty is sixteen divided by twenty, which is zero point eight, or eighty percent.', chapter: 'Accuracy' },
      { kind: 'diagram', title: 'Which mistakes?', diagram: 'confusion-matrix', steps: 3, say: 'Accuracy does not say which mistakes it makes. A confusion matrix does. Rows are the real answer, columns are the prediction. The diagonal shows the right answers. Here, two squares were mistaken for circles. Now you know exactly what to fix.', chapter: 'Confusion matrix' },
      { kind: 'points', title: 'Camera models', items: ['Pictures shrunk to a 12 × 9 grid', 'Used only inside the page, never uploaded', 'Change the light? Add examples in that light'], say: 'In this lesson you can also train with your camera. Pictures are shrunk to a tiny twelve by nine grid and used only inside the page. Lighting changes the pixel numbers, so give your model examples in different light.' },
      { kind: 'steps', title: 'Model doctor', items: ['100% on training, 50% on test: add variety', 'One group often wrong: add more of it', 'Fails in new light: train in that light'], say: 'Be a model doctor. Perfect on training but poor on test? It memorised, so add variety. One group often wrong? Add more examples of it. Fails in new light? Train in that light too. Then retrain and test again.', chapter: 'Fix it' },
    ],
    checkpoints: [
      cp('a07-c1', 2, 'A model gets 45 of 50 test examples right. What is its accuracy?', [['90%', true, '45 divided by 50.'], ['45%', false, 'Divide by the total, 50.']], 'Accuracy = right divided by total, times 100.'),
      cp('a07-c2', 3, 'What does a confusion matrix show?', [['Which groups the model mixes up', true, 'Yes.'], ['How long training took', false, 'It compares real answers with predictions.']], 'It shows every kind of mistake.'),
    ],
  },
  {
    id: 'a08',
    lessonSlug: 'ai101-08-trees',
    number: 8,
    title: 'Decision trees: AI that asks questions',
    summary: ['A decision tree asks yes-or-no questions', 'Good questions split examples into pure groups', 'You can read and check every step'],
    next: 'Teaching AI to read: words and feelings.',
    scenes: [
      { kind: 'title', kicker: 'Video 8', title: 'AI that asks questions', say: 'Remember the game where you guess an animal by asking yes or no questions? A decision tree is an AI that plays that game.', chapter: 'Decision trees' },
      { kind: 'diagram', title: 'Follow the branches', diagram: 'decision-tree', steps: 5, say: 'It starts with one question at the top, called the root. Has feathers? Yes: it is a bird. No: has fur? Yes: mammal. No: fish. The answers at the ends are called leaves.' },
      { kind: 'points', title: 'Good questions', items: ['Has feathers? Splits birds out perfectly', 'Is it brown? Birds, fish and mammals can all be brown', 'Computers try every question and keep the best'], say: 'The skill is choosing good questions. Has feathers splits out the birds perfectly. Is it brown is useless, because birds, fish and mammals can all be brown. Computers build trees by trying every question and keeping the one that splits best.', chapter: 'Good questions' },
      { kind: 'parts', title: 'Tricky animals', items: [{ name: 'Whale', job: 'Lives in water, but a mammal' }, { name: 'Penguin', job: 'A bird that cannot fly' }, { name: 'Bat', job: 'Flies, but a mammal' }], say: 'Now test your tree on tricky animals. A whale lives in water but is a mammal. A penguin is a bird that cannot fly. A bat flies but is a mammal. A tree that is perfect on its training animals can still trip over these.' },
      { kind: 'points', title: 'Trees you can trust', items: ['Every step can be read', 'People can spot unfair questions', 'Used where decisions affect people'], say: 'Decision trees have a superpower: you can read every step. That means people can check them and spot unfair questions. So they are used where decisions affect people, like deciding which patients a nurse should see first.', chapter: 'Explainable AI' },
    ],
    checkpoints: [
      cp('a08-c1', 1, 'In a decision tree, what is a leaf?', [['The final answer', true, 'Correct.'], ['The first question', false, 'That is the root.']], 'Leaves hold the predictions.'),
      cp('a08-c2', 3, 'A tree says “lives in water means fish”. Which animal does it get wrong?', [['A whale', true, 'Yes. Whales are mammals.'], ['A goldfish', false, 'A goldfish is a fish.']], 'Exceptions break simple rules, so test on unusual examples.'),
    ],
  },
  {
    id: 'a09',
    lessonSlug: 'ai101-09-words',
    number: 9,
    title: 'Teaching AI to read: words and feelings',
    summary: ['Words become numbers for an AI', 'Adding word scores gives a sentiment', 'Not, and sarcasm, fool simple word scores'],
    next: 'How chatbots write: predicting the next word.',
    scenes: [
      { kind: 'title', kicker: 'Video 9', title: 'Words and feelings', say: 'Companies read thousands of reviews every day to find out how people feel. That job is called sentiment analysis. Let us build one.', chapter: 'Sentiment' },
      { kind: 'points', title: 'Words become numbers', items: ['Delicious: +2', 'Cold: −1', 'Awful: −2', 'The: 0'], say: 'Just like pictures, words must become numbers. One simple way is to give each word a score. Delicious might be plus two, cold minus one, awful minus two, and the, zero.' },
      { kind: 'diagram', title: 'Add them up', diagram: 'sentiment', steps: 2, say: 'To judge a review, add up its word scores. The samosa was hot and delicious adds up to plus three. Above zero means a happy review.', chapter: 'Word scores' },
      { kind: 'diagram', title: 'Where it breaks', diagram: 'sentiment', steps: 4, say: 'But look at not good. Not scores zero and good scores plus one, so the total is plus one: happy. Wrong! Simple word scores ignore word order, so not fools them.' },
      { kind: 'points', title: 'Even trickier', items: ['Sarcasm: “Oh great, cold samosas again”', 'Modern AI looks at whole sentences', 'It learns scores from millions of examples'], say: 'Sarcasm is even trickier. Oh great, cold samosas again sounds happy word by word, but it is not. Modern AI looks at whole sentences and word order, and learns from millions of examples, which is why it needs so much data.', chapter: 'Real language AI' },
    ],
    checkpoints: [
      cp('a09-c1', 2, 'Scores: great +2, food 0, was 0. What is “food was great”?', [['+2, happy', true, 'Yes.'], ['0, neutral', false, 'Great adds plus two.']], 'Add the score of every word.'),
      cp('a09-c2', 3, 'Why does “not good” fool a word-score model?', [['Good adds points even though not flips the meaning', true, 'Exactly.'], ['Because not is a long word', false, 'Length does not matter.']], 'Word scores ignore order.'),
    ],
  },
  {
    id: 'a10',
    lessonSlug: 'ai101-10-next-word',
    number: 10,
    title: 'How chatbots write: predicting the next word',
    summary: ['A language model predicts the next word, again and again', 'It learns which words follow which from its training text', 'Sounding likely is not the same as being true'],
    next: 'Talk to a real AI, safely.',
    scenes: [
      { kind: 'title', kicker: 'Video 10', title: 'One word at a time', say: 'Chatbots seem to think. But at their heart they do one simple thing, over and over: predict the next word.', chapter: 'Language models' },
      { kind: 'diagram', title: 'What comes next?', diagram: 'next-word', steps: 3, say: 'Give a language model the words: the cat sat on the. It gives every possible next word a chance. Mat is very likely. Floor and sofa are possible. Banana is very unlikely. It picks one, adds it, and predicts again.' },
      { kind: 'points', title: 'Where the chances come from', items: ['It read a huge amount of text', 'It counted which words follow which', 'Big chatbots: billions of sentences'], say: 'Where do the chances come from? The model read a huge amount of text and learned which words tend to follow which. Big chatbots learned from billions of sentences, so their predictions are very good.', chapter: 'Training text' },
      { kind: 'chat', title: 'A tiny model writes', messages: [{ from: 'you', text: 'Start with: the monsoon' }, { from: 'ai', text: 'the monsoon rain fell on the school roof and the children ran inside' }], say: 'In your lesson you will train a tiny model on one short story. Start it with the monsoon, and it writes a sentence using words from its story. It sounds sensible, but it has no idea what rain is.' },
      { kind: 'points', title: 'Likely is not true', items: ['It picks words that sound likely', 'It does not check facts', 'Invented facts are called hallucinations'], say: 'Here is the big lesson. A language model picks words that sound likely. It does not check whether they are true. That is why chatbots sometimes invent facts, books or quotes. People call this hallucination. Always check important facts.', chapter: 'Hallucination' },
    ],
    checkpoints: [
      cp('a10-c1', 1, 'After “the cat sat on the”, which word is the model most likely to predict?', [['Mat', true, 'Yes, the most likely.'], ['Banana', false, 'Possible, but very unlikely.']], 'The model gives each next word a chance and picks a likely one.'),
      cp('a10-c2', 4, 'Why can chatbots state false facts confidently?', [['They predict likely words without checking truth', true, 'Exactly.'], ['They lie on purpose', false, 'They have no purpose. They predict words.']], 'Likely-sounding text is not checked for truth.'),
    ],
  },
  {
    id: 'a11',
    lessonSlug: 'ai101-11-chat',
    number: 11,
    title: 'Talk to a real AI, safely',
    summary: ['A prompt is the message you give an AI', 'Say what you want, how long, and who it is for', 'Keep personal details out and check facts'],
    next: 'Fair AI: when data is unfair.',
    scenes: [
      { kind: 'title', kicker: 'Video 11', title: 'Talk to a real AI', say: 'Now you know how chatbots work, it is time to use one, safely and cleverly.', chapter: 'The study helper' },
      { kind: 'diagram', title: 'Inside the study helper', diagram: 'chatbot-flow', steps: 6, say: 'Here is what happens to your message. First, a safety check looks for personal details. Then the language model predicts a reply, word by word. Then the reply is checked again before you see it. Blocked messages never reach the model.' },
      { kind: 'chat', title: 'Vague or clear?', messages: [{ from: 'you', text: 'Tell me about space.' }, { from: 'you', text: 'Explain in 3 short points why Mars looks red, for a Class 7 student.' }], say: 'The message you send is called a prompt. Tell me about space is vague. Explain in three short points why Mars looks red, for a Class 7 student, is clear. It says what you want, how long, and who it is for.', chapter: 'Prompts' },
      { kind: 'steps', title: 'Better answers', items: ['Say what, how long, and who for', 'Too hard? Ask: explain more simply', 'Ask for an example', 'Check important facts elsewhere'], say: 'If the answer is too hard, ask it to explain more simply. Ask for an example. And when it tells you a fact you will use, check it in a textbook or a trusted website.' },
      { kind: 'points', title: 'Stay safe', items: ['Never type your name, address, phone or school', 'Never share passwords', 'Worried? Stop and tell an adult'], say: 'And stay safe. Never type your name, address, phone number, school or passwords. If anything the AI says worries you, stop and tell an adult.', chapter: 'Stay safe' },
    ],
    checkpoints: [
      cp('a11-c1', 2, 'Which prompt is clearer?', [['Explain in 3 points why Mars looks red, for Class 7', true, 'Yes: what, how long, who for.'], ['Tell me about space', false, 'Too vague.']], 'Clear prompts say what, how long and who for.'),
      cp('a11-c2', 4, 'Which should you never type into a chatbot?', [['Your home address', true, 'Right. Keep it private.'], ['A question about volcanoes', false, 'That is a fine question.']], 'Keep personal details private.'),
    ],
  },
  {
    id: 'a12',
    lessonSlug: 'ai101-12-bias',
    number: 12,
    title: 'Fair AI: when data is unfair',
    summary: ['Bias means AI treats some people or things unfairly', 'Unbalanced data makes a model bad at the smaller group', 'Check accuracy for each group, and balance the data'],
    next: 'Responsible AI: privacy, deepfakes and you.',
    scenes: [
      { kind: 'title', kicker: 'Video 12', title: 'Fair AI', say: 'An AI learns exactly what its data teaches it, including the unfair parts. This is called bias.', chapter: 'Bias' },
      { kind: 'diagram', title: 'Unbalanced data', diagram: 'bias-data', steps: 3, say: 'Imagine a face-unlock AI trained on eighteen adults and only two children. It works well for adults, ninety-six percent, but only fifty-five percent for children. Nobody meant it to be unfair. The data simply had too few children.' },
      { kind: 'points', title: 'Real stories', items: ['Face recognition: more mistakes on darker skin', 'Voice assistants struggling with Indian accents', 'Fixed by collecting more varied data'], say: 'This has really happened. Researchers found face recognition systems that made far more mistakes on darker-skinned faces. Voice assistants struggled with Indian accents. Companies improved them by collecting more varied data.', chapter: 'Real stories' },
      { kind: 'bars', title: 'The hidden problem', caption: 'Accuracy for one model', unit: '%', bars: [{ label: 'Overall', value: 95 }, { label: 'Group A', value: 98 }, { label: 'Group B', value: 60 }], say: 'Here is a sneaky problem. This model is ninety-five percent accurate overall, which sounds great. But for group B it is only sixty percent. An overall score can hide unfairness, so always check each group.' },
      { kind: 'steps', title: 'Making AI fairer', items: ['Collect data from every group', 'Balance the numbers', 'Test each group separately', 'Ask who might be left out'], say: 'So how do we make AI fairer? Collect data from every group. Balance the numbers. Test each group separately. And always ask: who might this AI leave out?', chapter: 'Fix it' },
    ],
    checkpoints: [
      cp('a12-c1', 1, 'What usually causes bias in an AI?', [['Unbalanced or unfair training data', true, 'Correct.'], ['The AI disliking someone', false, 'AI has no likes. It copies its data.']], 'Bias usually comes from the data.'),
      cp('a12-c2', 3, 'Why check accuracy for each group?', [['An overall score can hide a group that does badly', true, 'Exactly.'], ['It makes the numbers bigger', false, 'It is about finding unfairness.']], 'Group-by-group testing reveals hidden bias.'),
    ],
  },
  {
    id: 'a13',
    lessonSlug: 'ai101-13-responsible',
    number: 13,
    title: 'Responsible AI: privacy, deepfakes and you',
    summary: ['Share as little personal information as possible', 'STOP and check before you believe or share', 'Use AI honestly and never to hurt anyone'],
    next: 'Final project: build and present your AI.',
    scenes: [
      { kind: 'title', kicker: 'Video 13', title: 'Responsible AI', say: 'AI is a powerful tool. Like any tool, it can be used well or badly. The choice is yours.', chapter: 'Three questions' },
      { kind: 'points', title: 'Privacy: whose data is it?', items: ['Apps may keep what you type or upload', 'Share as little as possible', 'Never share other people’s photos or details'], say: 'First, privacy. AI apps may keep what you type or upload. So share as little as possible, and never share other people’s photos or details without asking them.', chapter: 'Privacy' },
      { kind: 'points', title: 'Truth: is it real?', items: ['Deepfakes: fake photos, videos and voices', 'Shocking content is made to spread fast', 'Slow down before you share'], say: 'Second, truth. AI can make deepfakes: fake photos, videos and voices of real people. Shocking content is made to spread fast, so slow down before you believe it or share it.', chapter: 'Deepfakes' },
      { kind: 'steps', title: 'STOP', items: ['Source: who posted it first?', 'Too surprising? Slow down', 'Odd details: hands, edges, lips, voice', 'Proof: two trusted sites agree?'], say: 'Use the word STOP. Source: who posted it first? Too surprising? Slow down. Odd details: strange hands, blurry edges, lips that do not match the words. Proof: can you find it on two trusted sites? If not, do not share.' },
      { kind: 'points', title: 'Honesty: who did the work?', items: ['AI for ideas and explanations, when allowed', 'Write in your own words', 'Say when and how you used AI'], say: 'Third, honesty. Using AI for ideas or explanations is fine when your teacher allows it. Copying its answers and calling them your own is not. Write in your own words, and say when and how you used AI.', chapter: 'Honesty' },
    ],
    checkpoints: [
      cp('a13-c1', 2, 'A shocking video of a famous person appears in your group chat. What first?', [['Check where it came from before sharing', true, 'Yes. STOP and check.'], ['Forward it quickly', false, 'It could be a deepfake.']], 'Check the source before you believe or share.'),
      cp('a13-c2', 4, 'Which is an honest way to use AI for homework, when allowed?', [['Ask it to explain, then write your own answer and say you used AI', true, 'Exactly.'], ['Copy its answer as your own', false, 'That is not honest.']], 'Use AI to learn, and be open about it.'),
    ],
  },
  {
    id: 'a14',
    lessonSlug: 'ai101-14-project',
    number: 14,
    title: 'Final project: build and present your AI',
    summary: ['Choose a problem and two to four groups', 'Collect, train, test, improve', 'Report accuracy honestly and think about fairness'],
    next: 'The final assessment, your badge and your certificate.',
    scenes: [
      { kind: 'title', kicker: 'Video 14', title: 'Your AI project', say: 'This is your moment. Use everything you have learned to build an AI that solves a problem you choose.', chapter: 'The project' },
      { kind: 'diagram', title: 'The project loop', diagram: 'ai-pipeline', steps: 6, say: 'Every AI project goes round the same loop. Plan. Collect data. Train. Test. Improve. Share. And then, often, round again.' },
      { kind: 'parts', title: 'Project ideas', items: [{ name: 'Recycling sorter', job: 'Paper, plastic, metal' }, { name: 'Hand signals', job: 'Thumbs up, down, open palm' }, { name: 'Weather doodles', job: 'Sun, cloud, rain' }, { name: 'Number reader', job: 'Handwritten 0, 1 and 2' }], say: 'Need an idea? A recycling sorter for paper, plastic and metal. Hand signals for a no-touch quiz buzzer. Weather doodles. Or a reader for handwritten numbers. Or your very own idea.', chapter: 'Ideas' },
      { kind: 'steps', title: 'What to hand in', items: ['The problem and who it helps', 'Your data and its variety', 'Your test accuracy and biggest mix-up', 'One improvement, before and after', 'Who might it fail for?'], say: 'Your model’s results are attached automatically. Then write about the problem and who it helps, your data, your test accuracy and biggest mix-up, one improvement with its accuracy before and after, and who your AI might fail for.', chapter: 'Hand it in' },
      { kind: 'points', title: 'Honesty wins', items: ['Accuracy itself is not graded', 'An honest 70% with good reasoning beats an unexplained 100%', 'Your teacher reviews it; you can improve and resubmit'], say: 'Here is a secret: your accuracy itself is not graded. An honest seventy percent with good reasoning beats an unexplained hundred percent. Your teacher reviews your project, and you can improve it and send it again.' },
    ],
    checkpoints: [
      cp('a14-c1', 3, 'Which shows a model was tested fairly?', [['Accuracy on new examples it never trained on', true, 'Yes.'], ['Accuracy on its own training examples', false, 'That only shows what it memorised.']], 'Fair tests use new examples.'),
    ],
  },
]

export const AI_VIDEOS: VideoDef[] = RAW.map((v) => ({ ...v, series: AI_SERIES }))

export function aiVideoById(id: string | undefined) {
  return id ? AI_VIDEOS.find((v) => v.id === id) : undefined
}
