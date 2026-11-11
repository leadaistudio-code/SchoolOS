import type { ModuleDef } from '@/lib/lms/curriculum'

export const MODULE_1: ModuleDef = {
  key: 'm1',
  title: 'What is AI?',
  summary: 'Where AI is around you, how learning from examples differs from following rules, and the data every AI learns from.',
  lessons: [
    {
      slug: 'ai101-01-welcome',
      title: 'Welcome: AI is all around you',
      kind: 'INTERACTIVE',
      minutes: 12,
      videoId: 'a01',
      content: {
        version: 1,
        stage: 'watch',
        intro:
          'In this course you will build your own AI: one that learns to recognise drawings and objects you show it, right here in your browser. Along the way you will find out how AI really works, where it goes wrong, and how to use it safely and fairly.',
        objectives: [
          'Say what artificial intelligence (AI) is in your own words',
          'Spot AI in everyday life in India',
          'Know the five Safe AI rules for this course',
          'Know what you will build by the end',
        ],
        blocks: [
          {
            type: 'text',
            heading: 'What is AI?',
            body: '**Artificial intelligence (AI)** is when a computer does something we usually think needs a human brain: recognising a face, understanding speech, translating a language or suggesting the next video.\n\nMost AI today works the same way: instead of a person writing every rule, the computer **learns from lots of examples**. Show it thousands of photos labelled “cat” and “dog”, and it learns the patterns that tell them apart.\n\nAI is not magic and it is not alive. It is a pattern-finder, built by people, that can be very useful and can also be wrong.',
          },
          { type: 'diagram', name: 'ai-everywhere', caption: 'Four places you might have met AI today.' },
          {
            type: 'callout',
            tone: 'life',
            title: 'AI in India',
            body: 'Banks use AI to spot suspicious UPI payments in a fraction of a second. **Bhashini**, a Government of India project, uses AI to translate between Indian languages. Farmers photograph a leaf and an app suggests which crop disease it might have. Maps apps predict traffic so you reach school on time.',
          },
          {
            type: 'sort',
            id: 'ai-or-not',
            title: 'AI or not AI?',
            prompt: 'Sort each one. Ask yourself: did the computer learn a pattern from examples, or does it just follow a fixed instruction?',
            bins: [
              { id: 'ai', label: 'Uses AI' },
              { id: 'not', label: 'No AI' },
            ],
            items: [
              { id: 'face', text: 'Phone that unlocks when it sees your face', bin: 'ai', why: 'It learned what your face looks like from examples and compares each new picture.' },
              { id: 'calc', text: 'Calculator adding two numbers', bin: 'not', why: 'Addition follows exact rules. Nothing is learned.' },
              { id: 'voice', text: 'Voice assistant that understands “play a song”', bin: 'ai', why: 'It learned to turn the sound of speech into words from huge numbers of recordings.' },
              { id: 'alarm', text: 'Alarm clock ringing at 6:30', bin: 'not', why: 'It rings at the time you set. No pattern is learned.' },
              { id: 'recommend', text: 'Video app suggesting what to watch next', bin: 'ai', why: 'It learned from what millions of people watched what you might like.' },
              { id: 'light', text: 'Traffic light changing every 60 seconds', bin: 'not', why: 'A timer. It follows the same cycle whatever happens.' },
              { id: 'translate', text: 'App translating Hindi to Tamil', bin: 'ai', why: 'It learned from millions of translated sentences.' },
              { id: 'fan', text: 'Fan with a speed knob', bin: 'not', why: 'You set the speed. It does not learn anything.' },
            ],
          },
          {
            type: 'text',
            heading: 'What you will build',
            body: 'By the end of this course you will have trained your own **image classifier**: an AI that looks at a drawing (or an object you hold up to the camera) and says which group it belongs to. You will collect the examples, train it, test it, find its mistakes and make it fairer.\n\nYou will also talk to a real AI chatbot, safely, and find out how it writes its answers one word at a time.',
          },
          {
            type: 'callout',
            tone: 'safety',
            title: 'Five Safe AI rules for every lesson',
            body: '1. **Keep personal details private.** Never type your full name, address, phone number, school name or passwords into an AI.\n2. **AI can be wrong.** Check important facts with a book, a teacher or a trusted website.\n3. **Be kind.** Never use AI to make fun of, trick or hurt anyone.\n4. **Be honest.** Say when you used AI to help with your work.\n5. **Ask an adult** if an AI says something that worries or upsets you.',
          },
          {
            type: 'check',
            id: 'safe-1',
            prompt: 'A chatbot asks for your home address so it can “send you a prize”. What do you do?',
            options: [
              { id: 'a', text: 'Do not share it, and tell an adult', correct: true, feedback: 'Yes. Personal details stay private, and an adult should know about requests like this.' },
              { id: 'b', text: 'Share it, because the prize sounds good', correct: false, feedback: 'Prizes are a common trick. Never share your address with an app or a stranger.' },
              { id: 'c', text: 'Share only your area and city', correct: false, feedback: 'Even part of your address can help someone find you. Keep it private.' },
            ],
            explanation: 'Never share personal details with an AI or an app, and tell an adult when something asks for them.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'What you need',
            body: 'A computer, tablet or phone with a modern browser. A mouse or touch screen helps for drawing. A webcam is optional: every camera activity can also be done by drawing. Everything you train stays on your device.',
          },
        ],
        summary: [
          'AI is a computer doing tasks that usually need human thinking, mostly by learning patterns from examples.',
          'AI is all around you: face unlock, translation, maps, fraud checks and recommendations.',
          'AI can be wrong, so keep personal details private and check important facts.',
          'You will train your own image classifier and talk to a real chatbot safely.',
        ],
        next: 'Next, find out the big difference between a computer that follows rules and one that learns.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which of these uses AI?',
            multiple: false,
            hint: 'Look for something that learned a pattern from examples.',
            options: [
              { id: 'a', text: 'A phone that recognises your face', correct: true, feedback: 'Right. It learned what your face looks like.' },
              { id: 'b', text: 'A digital clock', correct: false, feedback: 'A clock counts time. Nothing is learned.' },
              { id: 'c', text: 'A light switch', correct: false, feedback: 'A switch just connects or breaks a circuit.' },
            ],
            explanation: 'Face recognition learns patterns from example pictures, which is what most AI does.',
          },
          {
            id: 'q2',
            prompt: 'How does most AI today get good at a task?',
            multiple: false,
            options: [
              { id: 'a', text: 'It learns patterns from lots of examples', correct: true, feedback: 'Correct. Examples are how most AI learns.' },
              { id: 'b', text: 'It thinks and feels like a person', correct: false, feedback: 'AI does not think or feel. It finds patterns in data.' },
              { id: 'c', text: 'It guesses randomly every time', correct: false, feedback: 'Good AI makes informed guesses based on what it learned.' },
            ],
            explanation: 'Modern AI learns from examples rather than having every rule written by a person.',
          },
          {
            id: 'q3',
            prompt: 'Which of these is safe to type into an AI chatbot?',
            multiple: false,
            options: [
              { id: 'a', text: '“Explain how volcanoes erupt”', correct: true, feedback: 'Yes. A general question shares nothing personal.' },
              { id: 'b', text: 'Your phone number', correct: false, feedback: 'Phone numbers are personal. Keep them private.' },
              { id: 'c', text: 'Your password', correct: false, feedback: 'Never share passwords with anyone or any app.' },
            ],
            explanation: 'Ask general questions; keep personal details private.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-02-rules-vs-learning',
      title: 'Rules or learning? How AI learns',
      kind: 'INTERACTIVE',
      minutes: 14,
      videoId: 'a02',
      content: {
        version: 1,
        stage: 'understand',
        intro:
          'Normal programs follow rules a person wrote. Machine learning flips this around: you give the computer examples and the right answers, and it works out the rules for itself. This one idea powers almost every AI you use.',
        objectives: [
          'Explain the difference between a rules program and machine learning',
          'Put the five steps of machine learning in order',
          'Decide when rules are enough and when learning is better',
        ],
        blocks: [
          { type: 'diagram', name: 'rules-vs-learning', caption: 'Left: a person writes the rules. Right: the computer learns them from labelled examples.' },
          {
            type: 'text',
            heading: 'Two ways to make a computer smart',
            body: '**Rules.** A person writes exact instructions: “if the temperature is above 30, switch on the fan.” This works brilliantly when the rules are simple and clear.\n\n**Learning.** Try writing rules for “is this a photo of a cat?” Cats can be big, small, orange, striped, sleeping or jumping. You would never finish. Instead, you show the computer thousands of labelled photos and let it find the patterns. That is **machine learning**, and the thing it builds is called a **model**.',
          },
          {
            type: 'callout',
            tone: 'word',
            title: 'New words',
            body: '**Machine learning:** a computer learning patterns from examples instead of being given every rule.\n**Model:** what the computer builds when it learns. You give it a new example and it gives you a prediction.\n**Training:** the learning step, when the model looks at the examples.\n**Prediction:** the model’s answer for something new.',
          },
          {
            type: 'sequence',
            id: 'ml-steps',
            title: 'Put machine learning in order',
            prompt: 'You want an AI that tells ripe mangoes from unripe ones. Drag the steps into order.',
            steps: [
              { id: 's1', text: 'Collect many photos of mangoes' },
              { id: 's2', text: 'Label each photo “ripe” or “unripe”' },
              { id: 's3', text: 'Train a model on the labelled photos' },
              { id: 's4', text: 'Test it on photos it has never seen' },
              { id: 's5', text: 'Use it to sort new mangoes' },
            ],
            explanation: 'Collect data, label it, train, test on new examples, then use it. If the test goes badly, you go back and collect better data.',
          },
          {
            type: 'sort',
            id: 'rules-or-learning',
            title: 'Rules or learning?',
            prompt: 'Which approach fits each job best?',
            bins: [
              { id: 'rules', label: 'Simple rules' },
              { id: 'learn', label: 'Machine learning' },
            ],
            items: [
              { id: 'bell', text: 'Ring the school bell at 9:00', bin: 'rules', why: 'One clear rule: when it is 9:00, ring.' },
              { id: 'handwriting', text: 'Read a doctor’s handwriting', bin: 'learn', why: 'Everyone writes differently. Learning from many examples works far better than rules.' },
              { id: 'grade', text: 'Give grade A for marks of 90 or more', bin: 'rules', why: 'An exact cut-off is a perfect rule.' },
              { id: 'birds', text: 'Name the bird in a photo', bin: 'learn', why: 'There are too many shapes, colours and angles to write rules for.' },
              { id: 'spam', text: 'Spot spam messages', bin: 'learn', why: 'Spammers keep changing their words. A model can learn new patterns from new examples.' },
              { id: 'light', text: 'Turn on porch lights at sunset', bin: 'rules', why: 'A light sensor and one rule do the job.' },
            ],
          },
          {
            type: 'check',
            id: 'model-new',
            prompt: 'After training, what does a model do?',
            options: [
              { id: 'a', text: 'Makes predictions for examples it has never seen', correct: true, feedback: 'Yes. The whole point is to handle new examples.' },
              { id: 'b', text: 'Only repeats the examples it was given', correct: false, feedback: 'A model that only memorises is not useful. It should work on new things too.' },
              { id: 'c', text: 'Writes new rules for a person to follow', correct: false, feedback: 'The model uses what it learned to make predictions itself.' },
            ],
            explanation: 'A trained model takes something new and gives a prediction, using the patterns it learned.',
          },
        ],
        summary: [
          'Rules programs follow instructions a person wrote.',
          'Machine learning finds the rules from labelled examples and builds a model.',
          'The steps are: collect, label, train, test, use.',
          'Simple, exact jobs suit rules; messy, varied jobs suit learning.',
        ],
        next: 'Next, look closely at the examples themselves: the data, its features and its labels.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'In machine learning, who works out the rules?',
            multiple: false,
            options: [
              { id: 'a', text: 'The computer, from examples', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'A person writes every rule', correct: false, feedback: 'That is a rules program, not machine learning.' },
              { id: 'c', text: 'Nobody: it guesses', correct: false, feedback: 'It learns from labelled examples, it does not just guess.' },
            ],
            explanation: 'Machine learning means the computer finds the patterns in labelled examples.',
          },
          {
            id: 'q2',
            prompt: 'Which step comes straight after collecting and labelling the data?',
            multiple: false,
            options: [
              { id: 'a', text: 'Training the model', correct: true, feedback: 'Right. Then you test it.' },
              { id: 'b', text: 'Using it in the real world', correct: false, feedback: 'You must train and test it first.' },
              { id: 'c', text: 'Throwing away the labels', correct: false, feedback: 'The labels are what it learns from.' },
            ],
            explanation: 'Collect, label, train, test, use.',
          },
          {
            id: 'q3',
            prompt: 'Which job is best done with machine learning?',
            multiple: false,
            options: [
              { id: 'a', text: 'Recognising animals in photos', correct: true, feedback: 'Yes. Too varied for simple rules.' },
              { id: 'b', text: 'Switching off lights at 10 pm', correct: false, feedback: 'One clear rule does that.' },
              { id: 'c', text: 'Adding up a bill', correct: false, feedback: 'Arithmetic follows exact rules.' },
            ],
            explanation: 'Messy, varied tasks with no simple rules are where learning shines.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-03-data',
      title: 'Data: features and labels',
      kind: 'INTERACTIVE',
      minutes: 14,
      videoId: 'a03',
      content: {
        version: 1,
        stage: 'understand',
        intro:
          'An AI is only as good as the examples it learns from. In this lesson you will learn to describe data the way an AI sees it: as features (the clues) and labels (the answers).',
        objectives: [
          'Explain what data, features and labels are',
          'Pick useful features for a task',
          'Explain why more, and more varied, data helps',
        ],
        blocks: [
          { type: 'diagram', name: 'features-labels', caption: 'Each row is one example. The features are the clues; the label is the answer the AI should learn.' },
          {
            type: 'text',
            heading: 'Clues and answers',
            body: '**Data** is the collection of examples. Each example has:\n\n- **Features:** measurable clues, like colour, size, weight, or the pixels of a picture.\n- **A label:** the right answer, like “apple” or “orange”.\n\nDuring training, the model looks for how the features connect to the labels. Good features make that easy: colour is a great clue for apples versus oranges. Bad features make it hard: the day of the week the fruit was bought tells you nothing.',
          },
          {
            type: 'match',
            id: 'data-words',
            title: 'Match the word to its meaning',
            prompt: 'Pick the meaning for each word.',
            pairs: [
              { id: 'p1', left: 'Data', right: 'All the examples the AI learns from' },
              { id: 'p2', left: 'Feature', right: 'A clue you can measure, like size or colour' },
              { id: 'p3', left: 'Label', right: 'The right answer for an example' },
              { id: 'p4', left: 'Model', right: 'What the AI builds when it learns' },
              { id: 'p5', left: 'Prediction', right: 'The model’s answer for something new' },
            ],
            explanation: 'Data is made of examples; each example has features (clues) and a label (answer). Training builds a model that makes predictions.',
          },
          {
            type: 'sort',
            id: 'good-features',
            title: 'Useful clue or useless clue?',
            prompt: 'You are building an AI that tells cats from dogs in photos. Which features would help?',
            bins: [
              { id: 'useful', label: 'Useful feature' },
              { id: 'useless', label: 'Not useful' },
            ],
            items: [
              { id: 'ears', text: 'Shape of the ears', bin: 'useful', why: 'Cat ears are usually pointed and upright; many dogs have floppy ears.' },
              { id: 'nose', text: 'Shape of the nose and snout', bin: 'useful', why: 'Dogs usually have longer snouts.' },
              { id: 'date', text: 'Date the photo was taken', bin: 'useless', why: 'Cats and dogs are photographed on every day of the year.' },
              { id: 'size', text: 'Body size compared to a door', bin: 'useful', why: 'A helpful clue, though small dogs and big cats overlap, so it is not enough alone.' },
              { id: 'camera', text: 'Brand of camera used', bin: 'useless', why: 'The camera has nothing to do with the animal.' },
              { id: 'file', text: 'File name of the photo', bin: 'useless', why: 'Names like IMG_2041 tell you nothing. (If file names said “cat”, that would be cheating!)' },
            ],
          },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'More data, and different data',
            body: 'If every “dog” photo shows a brown dog on grass, the AI might learn “brown thing on grass = dog” and fail on a white dog indoors. Good data has **lots of examples** and **lots of variety**: different colours, sizes, angles, lighting and backgrounds.',
          },
          {
            type: 'check',
            id: 'variety',
            prompt: 'Your mango AI was trained only on photos taken in bright sunlight. What problem might it have?',
            options: [
              { id: 'a', text: 'It may get photos taken indoors or at night wrong', correct: true, feedback: 'Yes. It never saw dim lighting, so it may be confused.' },
              { id: 'b', text: 'None: one kind of photo is enough', correct: false, feedback: 'An AI only knows what it has seen. Variety matters.' },
              { id: 'c', text: 'It will refuse to work in sunlight', correct: false, feedback: 'Sunlight is exactly what it knows best.' },
            ],
            explanation: 'Train on the variety the AI will meet in real use: different lighting, angles and backgrounds.',
          },
        ],
        summary: [
          'Data is a set of examples; each has features (clues) and a label (answer).',
          'Good features connect to the label; useless ones add noise.',
          'More examples and more variety make an AI work better in real life.',
        ],
        next: 'Next, discover how a computer sees a picture: as a grid of numbers called pixels.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'In a fruit-sorting AI, what is the label?',
            multiple: false,
            options: [
              { id: 'a', text: 'The fruit’s name, like “apple”', correct: true, feedback: 'Correct. That is the answer it learns to predict.' },
              { id: 'b', text: 'The fruit’s colour', correct: false, feedback: 'Colour is a feature, a clue.' },
              { id: 'c', text: 'The fruit’s weight', correct: false, feedback: 'Weight is a feature too.' },
            ],
            explanation: 'Features are clues; the label is the answer.',
          },
          {
            id: 'q2',
            prompt: 'Which feature would help most to tell lemons from limes?',
            multiple: false,
            options: [
              { id: 'a', text: 'Colour', correct: true, feedback: 'Yes. Yellow versus green is a strong clue.' },
              { id: 'b', text: 'The shop they came from', correct: false, feedback: 'Both are sold in the same shops.' },
              { id: 'c', text: 'The price tag font', correct: false, feedback: 'That has nothing to do with the fruit.' },
            ],
            explanation: 'Pick features that actually differ between the groups.',
          },
          {
            id: 'q3',
            prompt: 'Why should training data include lots of variety?',
            multiple: false,
            options: [
              { id: 'a', text: 'So the AI works on the different things it will meet in real life', correct: true, feedback: 'Exactly.' },
              { id: 'b', text: 'So training takes longer', correct: false, feedback: 'Time is not the goal; working well is.' },
              { id: 'c', text: 'It does not matter', correct: false, feedback: 'It matters a lot: AI only knows what it has seen.' },
            ],
            explanation: 'An AI only knows what it has seen, so show it the variety of the real world.',
          },
        ],
      },
      passPercent: 80,
    },
  ],
}
