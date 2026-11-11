import type { ModuleDef } from '@/lib/lms/curriculum'

export const MODULE_2: ModuleDef = {
  key: 'm2',
  title: 'Train your own AI',
  summary: 'How computers see pictures, training your own image classifier, how it decides, and testing whether it is any good.',
  lessons: [
    {
      slug: 'ai101-04-pixels',
      title: 'How computers see: pixels',
      kind: 'INTERACTIVE',
      minutes: 13,
      videoId: 'a04',
      content: {
        version: 1,
        stage: 'experiment',
        intro:
          'You see a smiley face. A computer sees a grid of numbers. Before you can train an AI on pictures, you need to know what a picture looks like from the inside.',
        objectives: [
          'Explain what a pixel is',
          'Turn a picture into numbers and numbers back into a picture',
          'Explain why an AI needs pictures to be numbers',
        ],
        blocks: [
          { type: 'diagram', name: 'pixels', caption: 'Zoom in far enough and every picture is a grid of squares. Each square is stored as a number.' },
          {
            type: 'text',
            heading: 'Pictures are numbers',
            body: 'A digital picture is a grid of tiny squares called **pixels**. Each pixel is stored as a number.\n\n- In a black-and-white picture, 0 can mean white and 1 can mean black.\n- In a grey picture, each pixel is a number from 0 (white) to 255 (black).\n- In a colour picture, each pixel has three numbers: how much **red**, **green** and **blue** light to mix.\n\nA phone photo has about 12 million pixels, so 36 million numbers! An AI never sees “a cat”. It sees those numbers, and learns which patterns of numbers usually mean “cat”.',
          },
          { type: 'pixel-lab', id: 'pixel-lab' },
          {
            type: 'callout',
            tone: 'word',
            title: 'New words',
            body: '**Pixel:** one tiny square of a digital picture (short for “picture element”).\n**Resolution:** how many pixels a picture has, such as 1920 × 1080.\n**RGB:** red, green and blue, the three numbers that make each colour pixel.',
          },
          {
            type: 'check',
            id: 'pixel-count',
            prompt: 'A tiny black-and-white picture is 10 pixels wide and 10 pixels tall. How many numbers does the computer store?',
            hint: 'One number per pixel. Count the squares.',
            options: [
              { id: 'a', text: '100', correct: true, feedback: 'Yes: 10 × 10 = 100 pixels, one number each.' },
              { id: 'b', text: '20', correct: false, feedback: '10 + 10 is the edges. The grid has 10 rows of 10.' },
              { id: 'c', text: '1', correct: false, feedback: 'Every pixel needs its own number.' },
            ],
            explanation: 'Width × height gives the number of pixels. For colour, multiply by 3 (red, green, blue).',
          },
          {
            type: 'check',
            id: 'why-numbers',
            prompt: 'Why must pictures be numbers for an AI?',
            options: [
              { id: 'a', text: 'Computers can only work with numbers', correct: true, feedback: 'Right. Everything inside a computer, pictures, sounds and words, is stored as numbers.' },
              { id: 'b', text: 'Numbers look nicer than pictures', correct: false, feedback: 'It is not about looks. Computers simply cannot process anything else.' },
              { id: 'c', text: 'It is a rule made by teachers', correct: false, feedback: 'It is how computers work: they calculate with numbers.' },
            ],
            explanation: 'Computers calculate with numbers, so every picture becomes a grid of numbers first.',
          },
        ],
        summary: [
          'A digital picture is a grid of pixels, and each pixel is stored as a number.',
          'Black-and-white pixels can be 0 or 1; colour pixels have red, green and blue numbers.',
          'An AI learns patterns in those numbers, not “pictures” the way we see them.',
        ],
        next: 'Next, use what you know about pixels to train your very first AI model.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'What is a pixel?',
            multiple: false,
            options: [
              { id: 'a', text: 'One tiny square of a digital picture', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'A type of camera', correct: false, feedback: 'A pixel is part of the picture, not the camera.' },
              { id: 'c', text: 'A computer virus', correct: false, feedback: 'No. It is a tiny square of colour.' },
            ],
            explanation: 'Pixels are the small squares that make up a digital picture.',
          },
          {
            id: 'q2',
            prompt: 'How many numbers describe one colour pixel?',
            multiple: false,
            hint: 'Think RGB.',
            options: [
              { id: 'a', text: 'Three: red, green and blue', correct: true, feedback: 'Yes.' },
              { id: 'b', text: 'One', correct: false, feedback: 'One number is enough for black-and-white or grey, not colour.' },
              { id: 'c', text: 'Ten', correct: false, feedback: 'Colour pixels mix three lights: red, green and blue.' },
            ],
            explanation: 'Colour pixels store red, green and blue amounts.',
          },
          {
            id: 'q3',
            prompt: 'In a black-and-white picture where 1 means black, what does a row “0 0 1 1 0 0” look like?',
            multiple: false,
            options: [
              { id: 'a', text: 'White, white, black, black, white, white', correct: true, feedback: 'Exactly.' },
              { id: 'b', text: 'All black', correct: false, feedback: 'Only the 1s are black.' },
              { id: 'c', text: 'Black, black, white, white, black, black', correct: false, feedback: 'That is the opposite: 0 means white here.' },
            ],
            explanation: 'Read the numbers left to right: 0 is white, 1 is black.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-05-train',
      title: 'Train your first AI model',
      kind: 'INTERACTIVE',
      minutes: 18,
      videoId: 'a05',
      content: {
        version: 1,
        stage: 'build',
        intro:
          'Time to build! You will teach an AI to recognise simple drawings. You choose the groups, you draw the examples, you press Train, and then you see if it can recognise drawings it has never seen.',
        objectives: [
          'Collect labelled examples for two or more groups',
          'Train an image classifier in your browser',
          'Try your model on new drawings and explain what it gets right and wrong',
        ],
        blocks: [
          {
            type: 'steps',
            title: 'How to train your model',
            steps: [
              { title: 'Choose your groups', body: 'Start with the suggested groups (circle, triangle, square) or rename them. Simple, very different shapes work best for your first model.' },
              { title: 'Draw examples', body: 'Pick a group, draw one example and press Add example. Draw at least 5 for every group.', tip: 'Draw some big, some small, some neat, some messy. Variety makes a smarter model.' },
              { title: 'Train', body: 'Press Train. Your model learns from every example you drew. This happens on your device; nothing is sent anywhere.' },
              { title: 'Try it', body: 'Draw something new and see what your model predicts, and how sure it is.' },
            ],
          },
          {
            type: 'classifier-lab',
            id: 'first-model',
            title: 'Your first image classifier',
            input: 'draw',
            labels: ['Circle', 'Triangle', 'Square'],
            minExamples: 5,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Make it smarter',
            body: 'If your model mixes two groups up, add more examples of both, especially the kinds it got wrong. Then press Train again. This loop, **test, find mistakes, add better data, retrain**, is exactly what AI engineers do every day.',
          },
          {
            type: 'check',
            id: 'confidence',
            prompt: 'Your model says “Triangle, 34% sure”. What does that tell you?',
            options: [
              { id: 'a', text: 'It is unsure; the drawing looks a bit like several groups', correct: true, feedback: 'Yes. Low confidence means the drawing sits between groups. More examples would help.' },
              { id: 'b', text: 'It is definitely a triangle', correct: false, feedback: '34% is not very sure at all.' },
              { id: 'c', text: 'The model is broken', correct: false, feedback: 'Not broken: it is honestly telling you it is unsure.' },
            ],
            explanation: 'Confidence shows how strongly the model leans one way. Low confidence is a sign you need more or better examples.',
          },
          {
            type: 'callout',
            tone: 'life',
            title: 'The same idea, much bigger',
            body: 'Real image AIs work like yours, but learn from millions of photos with much bigger models. India’s postal service has used handwriting recognition to read PIN codes on letters, and apps like Google Lens recognise plants and objects from a photo.',
          },
        ],
        summary: [
          'An image classifier sorts pictures into groups you chose.',
          'You trained one by drawing labelled examples and pressing Train.',
          'Confidence shows how sure the model is; low confidence means it needs better examples.',
          'Test, find mistakes, add better data, retrain: that is how every AI improves.',
        ],
        next: 'Next, open up your model and see exactly how it makes its decisions.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'What does an image classifier do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Sorts pictures into groups it has learned', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Draws pictures for you', correct: false, feedback: 'That is a different kind of AI. A classifier sorts.' },
              { id: 'c', text: 'Makes pictures bigger', correct: false, feedback: 'No. It predicts which group a picture belongs to.' },
            ],
            explanation: 'A classifier predicts the group (class) of a new picture.',
          },
          {
            id: 'q2',
            prompt: 'Your model keeps calling squares “circles”. What is the best fix?',
            multiple: false,
            options: [
              { id: 'a', text: 'Add more, and more varied, examples of squares and circles, then retrain', correct: true, feedback: 'Yes. Better data is the fix.' },
              { id: 'b', text: 'Delete all the squares', correct: false, feedback: 'Then it could never recognise squares.' },
              { id: 'c', text: 'Draw everything smaller', correct: false, feedback: 'Size is not the problem. It needs better examples.' },
            ],
            explanation: 'When a model confuses two groups, give it more and better examples of both.',
          },
          {
            id: 'q3',
            prompt: 'Where did your model in this lesson learn?',
            multiple: false,
            options: [
              { id: 'a', text: 'On your own device, in the browser', correct: true, feedback: 'Right. Your drawings never left your device to train it.' },
              { id: 'b', text: 'On a supercomputer in another country', correct: false, feedback: 'Not this one. It trained right in your browser.' },
              { id: 'c', text: 'It did not learn', correct: false, feedback: 'It learned from every example you drew.' },
            ],
            explanation: 'Small models can train right on your device, which also keeps your data private.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-06-neighbours',
      title: 'How your AI decides: nearest neighbours',
      kind: 'INTERACTIVE',
      minutes: 14,
      videoId: 'a06',
      content: {
        version: 1,
        stage: 'understand',
        intro:
          'How did your model decide? It used one of the simplest and oldest ideas in AI: find the examples that look most like the new one, and go with the majority. It is called k-nearest neighbours.',
        objectives: [
          'Explain how k-nearest neighbours makes a prediction',
          'See how changing k changes the answer',
          'Explain why examples near the border are hard',
        ],
        blocks: [
          { type: 'diagram', name: 'nearest-neighbour', caption: 'The new point (?) looks at its 3 nearest neighbours. Two are mangoes, one is a lemon, so the vote says mango.' },
          {
            type: 'text',
            heading: 'Ask the neighbours',
            body: 'Imagine every example as a dot on a map. Fruits that are similar sit close together: sweet, big fruits in one corner, sour, small fruits in another.\n\nWhen a new fruit arrives, the model:\n\n1. Measures how far it is from every example.\n2. Picks the **k** closest ones (k is just a number you choose, like 3).\n3. Lets them **vote**. The group with the most votes wins.\n\nYour drawing model did the same, except each drawing was a dot in a space with 256 directions, one for every pixel. Drawings with similar pixels sit close together.',
          },
          { type: 'scatter-lab', id: 'knn-lab', mode: 'knn' },
          {
            type: 'callout',
            tone: 'word',
            title: 'New words',
            body: '**k-nearest neighbours (k-NN):** predict by letting the k most similar examples vote.\n**Distance:** how different two examples are. Small distance means very similar.\n**Decision boundary:** the border where the prediction flips from one group to another.',
          },
          {
            type: 'check',
            id: 'k-odd',
            prompt: 'With two groups, why do people often pick an odd k, like 3 or 5?',
            options: [
              { id: 'a', text: 'So the vote cannot end in a tie', correct: true, feedback: 'Yes. With 4 neighbours you could get 2 against 2.' },
              { id: 'b', text: 'Odd numbers are luckier', correct: false, feedback: 'No luck involved: it is about avoiding ties.' },
              { id: 'c', text: 'Even numbers are not allowed', correct: false, feedback: 'They are allowed, but they can tie.' },
            ],
            explanation: 'An odd k avoids ties when there are two groups.',
          },
          {
            type: 'check',
            id: 'border',
            prompt: 'Where is the model most likely to make mistakes?',
            options: [
              { id: 'a', text: 'Near the border between two groups', correct: true, feedback: 'Right. There the neighbours are mixed, so the vote is close.' },
              { id: 'b', text: 'In the middle of a big group', correct: false, feedback: 'There every neighbour agrees, so it is easy.' },
              { id: 'c', text: 'It never makes mistakes', correct: false, feedback: 'Every model makes some mistakes, mostly near borders.' },
            ],
            explanation: 'Examples near a decision boundary have mixed neighbours, so they are the hardest to get right.',
          },
        ],
        summary: [
          'k-nearest neighbours predicts by letting the k most similar examples vote.',
          'Similar examples sit close together; distance measures how different they are.',
          'Changing k can change the answer; an odd k avoids ties.',
          'Mistakes happen most near the border between groups.',
        ],
        next: 'Next, find out how to test a model properly, so you know how good it really is.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'In k-nearest neighbours with k = 3, how is the answer chosen?',
            multiple: false,
            options: [
              { id: 'a', text: 'The 3 closest examples vote, and the majority wins', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'The 3 farthest examples vote', correct: false, feedback: 'It is the closest, most similar examples.' },
              { id: 'c', text: 'It picks one of 3 groups at random', correct: false, feedback: 'No randomness: the neighbours vote.' },
            ],
            explanation: 'The k most similar examples vote; the majority group is the prediction.',
          },
          {
            id: 'q2',
            prompt: 'Two examples have a very small distance between them. What does that mean?',
            multiple: false,
            options: [
              { id: 'a', text: 'They are very similar', correct: true, feedback: 'Yes.' },
              { id: 'b', text: 'They are very different', correct: false, feedback: 'Different examples are far apart.' },
              { id: 'c', text: 'They have the same file name', correct: false, feedback: 'Distance compares features, not names.' },
            ],
            explanation: 'Small distance = similar features.',
          },
          {
            id: 'q3',
            prompt: 'A new fruit has neighbours: mango, lemon, mango, lemon, mango (k = 5). What does the model predict?',
            multiple: false,
            options: [
              { id: 'a', text: 'Mango', correct: true, feedback: '3 votes to 2. Mango wins.' },
              { id: 'b', text: 'Lemon', correct: false, feedback: 'Count again: three mangoes, two lemons.' },
              { id: 'c', text: 'It cannot decide', correct: false, feedback: 'With 5 voters there is always a winner between two groups.' },
            ],
            explanation: 'Count the votes; the group with the most wins.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-07-testing',
      title: 'Testing: is your AI any good?',
      kind: 'INTERACTIVE',
      minutes: 18,
      videoId: 'a07',
      content: {
        version: 1,
        stage: 'test',
        intro:
          'A model that only works on the examples it was trained on is like a student who memorised last year’s answers. In this lesson you will train a new model, with the camera or by drawing, then test it fairly on examples it has never seen.',
        objectives: [
          'Explain why you test on new examples',
          'Work out a model’s accuracy',
          'Read a confusion matrix to find which groups get mixed up',
          'Improve a model and measure the difference',
        ],
        blocks: [
          { type: 'diagram', name: 'train-test', caption: 'Keep some examples back. Train on the rest, then test on the ones the model has never seen.' },
          {
            type: 'text',
            heading: 'A fair test',
            body: 'To find out how good a model really is, you test it on **new examples it has never seen**, just like an exam has new questions.\n\n**Accuracy** is the share it gets right. If it gets 9 out of 10 test examples right, its accuracy is 90%.\n\nAccuracy alone does not tell you *which* mistakes it makes. For that, use a **confusion matrix**: a table showing, for each real group, what the model predicted.',
          },
          { type: 'diagram', name: 'confusion-matrix', caption: 'Rows are the real answer, columns are the prediction. The diagonal shows the right answers; everything else is a mix-up.' },
          {
            type: 'classifier-lab',
            id: 'tested-model',
            title: 'Train and test a model',
            input: 'camera',
            labels: ['Thumbs up', 'Thumbs down'],
            minExamples: 6,
            test: true,
          },
          {
            type: 'callout',
            tone: 'safety',
            title: 'Your camera, your privacy',
            body: 'Camera pictures are shrunk to a tiny 12 × 9 grid and used only inside this page. They are never uploaded and are forgotten when you leave. If you prefer not to use a camera, switch to drawing: pick two shapes or symbols instead.',
          },
          {
            type: 'missions',
            id: 'fix-model',
            title: 'Model doctor',
            missions: [
              {
                id: 'm1',
                symptom: 'Your model gets 100% on the training examples but only 50% on the test set.',
                options: [
                  { id: 'a', text: 'It memorised its examples; add more varied training examples', correct: true },
                  { id: 'b', text: 'Test it on the training examples instead', correct: false, feedback: 'That hides the problem instead of fixing it.' },
                  { id: 'c', text: 'Nothing is wrong', correct: false, feedback: '50% on two groups is no better than guessing.' },
                ],
                fix: 'It works on what it has seen but not on new things. Add more examples with more variety (angles, sizes, backgrounds), retrain and test again.',
              },
              {
                id: 'm2',
                symptom: 'The confusion matrix shows thumbs down is often predicted as thumbs up, but never the other way round.',
                options: [
                  { id: 'a', text: 'Add more thumbs-down examples, especially ones like the mistakes', correct: true },
                  { id: 'b', text: 'Remove all thumbs-up examples', correct: false, feedback: 'Then it could never predict thumbs up.' },
                  { id: 'c', text: 'Change the colours of the screen', correct: false, feedback: 'The screen is not the problem; the training data is.' },
                ],
                fix: 'The model has not learned thumbs down well enough. Give it more, and more varied, thumbs-down examples.',
              },
              {
                id: 'm3',
                symptom: 'Your camera model worked in the morning but fails in the evening.',
                options: [
                  { id: 'a', text: 'Lighting changed; train with examples in different light', correct: true },
                  { id: 'b', text: 'The model gets tired', correct: false, feedback: 'Models do not get tired. Something about the pictures changed.' },
                  { id: 'c', text: 'Cameras only work in the morning', correct: false, feedback: 'The camera works; the light is different.' },
                ],
                fix: 'The pixel numbers change with the light. Include examples from different lighting so the model learns the shape, not the brightness.',
              },
            ],
          },
          {
            type: 'check',
            id: 'accuracy-calc',
            prompt: 'A model gets 16 of 20 test examples right. What is its accuracy?',
            hint: 'Right answers ÷ total, then × 100.',
            options: [
              { id: 'a', text: '80%', correct: true, feedback: '16 ÷ 20 = 0.8, which is 80%.' },
              { id: 'b', text: '16%', correct: false, feedback: '16 is the count, not the percentage.' },
              { id: 'c', text: '4%', correct: false, feedback: '4 is the number it got wrong.' },
            ],
            explanation: 'Accuracy = right ÷ total × 100.',
          },
        ],
        summary: [
          'Test on new examples the model has never seen, like a fair exam.',
          'Accuracy is the percentage of test examples it gets right.',
          'A confusion matrix shows which groups get mixed up.',
          'Fix mistakes with more varied data, then retrain and retest.',
        ],
        next: 'Next, meet a different kind of model: a decision tree that learns by asking questions.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Why should you test a model on examples it has never seen?',
            multiple: false,
            options: [
              { id: 'a', text: 'To find out if it works on new things, not just what it memorised', correct: true, feedback: 'Exactly.' },
              { id: 'b', text: 'Because old examples get deleted', correct: false, feedback: 'They are not deleted; they just do not give a fair test.' },
              { id: 'c', text: 'It makes the accuracy higher', correct: false, feedback: 'It usually makes it lower, but honest.' },
            ],
            explanation: 'New test examples give an honest measure of real-world performance.',
          },
          {
            id: 'q2',
            prompt: 'A model gets 45 of 50 test examples right. What is its accuracy?',
            multiple: false,
            options: [
              { id: 'a', text: '90%', correct: true, feedback: '45 ÷ 50 = 0.9.' },
              { id: 'b', text: '45%', correct: false, feedback: 'Divide by the total, 50.' },
              { id: 'c', text: '5%', correct: false, feedback: '5 is how many it got wrong.' },
            ],
            explanation: 'Accuracy = right ÷ total × 100.',
          },
          {
            id: 'q3',
            prompt: 'What does a confusion matrix show you?',
            multiple: false,
            options: [
              { id: 'a', text: 'Which groups the model mixes up', correct: true, feedback: 'Yes.' },
              { id: 'b', text: 'How confused the student is', correct: false, feedback: 'It is about the model!' },
              { id: 'c', text: 'How long training took', correct: false, feedback: 'It shows predictions versus real answers.' },
            ],
            explanation: 'It compares real answers with predictions, so you can see every kind of mistake.',
          },
        ],
      },
      passPercent: 80,
    },
  ],
}
