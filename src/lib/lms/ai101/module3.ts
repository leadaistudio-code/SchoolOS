import type { ModuleDef } from '@/lib/lms/curriculum'

export const MODULE_3: ModuleDef = {
  key: 'm3',
  title: 'AI that reads and talks',
  summary: 'Decision trees, teaching AI to read feelings in words, how chatbots predict the next word, and talking to a real AI safely.',
  lessons: [
    {
      slug: 'ai101-08-trees',
      title: 'Decision trees: AI that asks questions',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'a08',
      content: {
        version: 1,
        stage: 'experiment',
        intro:
          'Remember the game where you guess an animal by asking yes-or-no questions? A decision tree is an AI that plays that game. It is one of the easiest models to understand, because you can read every decision it makes.',
        objectives: [
          'Explain how a decision tree makes a prediction',
          'Build a tree that sorts animals by asking good questions',
          'Explain why a tree that is perfect on training data can still fail on new data',
        ],
        blocks: [
          { type: 'diagram', name: 'decision-tree', caption: 'Start at the top. Answer each question and follow the branch until you reach an answer.' },
          {
            type: 'text',
            heading: 'Twenty questions, for computers',
            body: 'A **decision tree** starts with one question at the top (the **root**). Each answer leads down a **branch** to another question, until you reach a **leaf**: the prediction.\n\nThe skill is choosing good questions. A good question splits the examples into groups that are as pure as possible. “Does it have feathers?” is brilliant for finding birds. “Is it brown?” is not, because birds, fish and mammals can all be brown.\n\nComputers build trees by trying every possible question and keeping the one that splits the data best. You will do it by hand.',
          },
          { type: 'tree-lab', id: 'animal-tree' },
          {
            type: 'callout',
            tone: 'life',
            title: 'Trees you can trust',
            body: 'Because you can read every step, decision trees are used where people need to understand *why*: for example, helping decide which patients a nurse should see first, or whether a loan application needs a closer look. A person can check each question and spot unfair ones.',
          },
          {
            type: 'check',
            id: 'good-question',
            prompt: 'You want to separate fish from mammals. Which is the best first question?',
            options: [
              { id: 'a', text: '“Does it have fur or hair?”', correct: true, feedback: 'Yes. Almost every mammal has some fur or hair; fish never do.' },
              { id: 'b', text: '“Is it bigger than a cat?”', correct: false, feedback: 'Both fish and mammals come in every size.' },
              { id: 'c', text: '“Does it live in water?”', correct: false, feedback: 'Close, but whales, dolphins and otters are mammals that live in water.' },
            ],
            explanation: 'Pick the question that splits the groups most cleanly. Watch out for exceptions like whales.',
          },
        ],
        summary: [
          'A decision tree predicts by asking a chain of yes-or-no questions.',
          'Good questions split the examples into pure groups.',
          'You can read every step, so people can check a tree’s decisions.',
          'A tree perfect on training data can still fail on unusual new examples, like whales or penguins.',
        ],
        next: 'Next, teach an AI to read: can it tell whether a message is happy or upset?',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'In a decision tree, what is a leaf?',
            multiple: false,
            options: [
              { id: 'a', text: 'The final answer at the end of a branch', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'The first question', correct: false, feedback: 'That is the root.' },
              { id: 'c', text: 'A picture of a plant', correct: false, feedback: 'Here a leaf is where the tree gives its prediction.' },
            ],
            explanation: 'Root = first question, branches = answers, leaves = predictions.',
          },
          {
            id: 'q2',
            prompt: 'Your tree says “lives in water → fish”. Which animal will it get wrong?',
            multiple: false,
            options: [
              { id: 'a', text: 'A dolphin', correct: true, feedback: 'Yes. Dolphins live in water but are mammals.' },
              { id: 'b', text: 'A goldfish', correct: false, feedback: 'A goldfish is a fish, so the tree is right.' },
              { id: 'c', text: 'A sparrow', correct: false, feedback: 'Sparrows do not live in water, so they go down the other branch.' },
            ],
            explanation: 'Exceptions break simple rules. Test your tree on unusual examples.',
          },
          {
            id: 'q3',
            prompt: 'Why might a doctor prefer a decision tree to a mystery model?',
            multiple: false,
            options: [
              { id: 'a', text: 'They can read and check every step of its decision', correct: true, feedback: 'Exactly. It explains itself.' },
              { id: 'b', text: 'Trees are always 100% accurate', correct: false, feedback: 'No model is always right.' },
              { id: 'c', text: 'Trees do not need data', correct: false, feedback: 'They learn from data too.' },
            ],
            explanation: 'Trees are explainable, which matters when decisions affect people.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-09-words',
      title: 'Teaching AI to read: words and feelings',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'a09',
      content: {
        version: 1,
        stage: 'experiment',
        intro:
          'Companies read thousands of reviews and messages every day to find out how people feel. That job is called sentiment analysis. In this lesson you will build a simple one, find where it breaks, and fix it.',
        objectives: [
          'Explain how a computer can turn words into numbers',
          'Build a word-score model that sorts reviews into happy and unhappy',
          'Explain why words like “not” make language hard for AI',
        ],
        blocks: [
          { type: 'diagram', name: 'sentiment', caption: 'Give each word a score, add them up: above zero is happy, below zero is unhappy.' },
          {
            type: 'text',
            heading: 'Words become numbers',
            body: 'Just as pictures become pixel numbers, words must become numbers for a computer. One simple way: give every word a **score**. “Delicious” might be +2, “cold” −1, “awful” −2, “the” 0.\n\nTo judge a review, add up the scores of its words. Positive total: happy. Negative total: unhappy. This is called **sentiment analysis**.\n\nReal AI learns these scores from millions of reviews instead of a person typing them in, but the idea is the same.',
          },
          { type: 'word-lab', id: 'canteen-reviews' },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'Language is tricky',
            body: '“Not bad at all” is a compliment, but adding up “not” and “bad” makes it sound negative. Sarcasm (“Oh great, cold samosas again”) is even harder. Modern AI looks at whole sentences and word order, not single words, which is one reason it needs so much data.',
          },
          {
            type: 'check',
            id: 'sarcasm',
            prompt: 'Which review would a simple word-score model most likely get wrong?',
            options: [
              { id: 'a', text: '“Oh wonderful, the bus is late again.”', correct: true, feedback: 'Yes. “Wonderful” scores high, but the writer is annoyed. That is sarcasm.' },
              { id: 'b', text: '“The food was delicious.”', correct: false, feedback: '“Delicious” scores high and the review is happy. Easy.' },
              { id: 'c', text: '“The room was dirty and smelly.”', correct: false, feedback: 'Two negative words, unhappy review. Easy.' },
            ],
            explanation: 'Sarcasm says the opposite of the words, so word scores are fooled.',
          },
        ],
        summary: [
          'Words must become numbers for an AI; giving each word a score is one simple way.',
          'Adding word scores gives a sentiment: happy or unhappy.',
          'Words like “not”, and sarcasm, break simple word counting.',
          'Real language AI looks at whole sentences and learns from huge amounts of text.',
        ],
        next: 'Next, find out how chatbots write whole sentences: by predicting the next word, again and again.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'What is sentiment analysis?',
            multiple: false,
            options: [
              { id: 'a', text: 'Working out whether text sounds happy, unhappy or neutral', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Checking spelling', correct: false, feedback: 'That is a spell checker.' },
              { id: 'c', text: 'Translating languages', correct: false, feedback: 'That is translation.' },
            ],
            explanation: 'Sentiment analysis judges the feeling in a piece of text.',
          },
          {
            id: 'q2',
            prompt: 'Scores: great +2, food +0, was +0, cold −1. What is the total for “food was great”?',
            multiple: false,
            options: [
              { id: 'a', text: '+2, happy', correct: true, feedback: 'Yes: 0 + 0 + 2.' },
              { id: 'b', text: '−1, unhappy', correct: false, feedback: '“Cold” is not in this sentence.' },
              { id: 'c', text: '0, neutral', correct: false, feedback: '“Great” adds +2.' },
            ],
            explanation: 'Add the score of every word in the sentence.',
          },
          {
            id: 'q3',
            prompt: 'Why is “not good” hard for a simple word-score model?',
            multiple: false,
            options: [
              { id: 'a', text: '“Good” adds points even though “not” flips the meaning', correct: true, feedback: 'Exactly.' },
              { id: 'b', text: 'Because “not” is a long word', correct: false, feedback: 'Length does not matter.' },
              { id: 'c', text: 'It is not hard', correct: false, feedback: 'Word scores ignore order, so “not” causes mistakes.' },
            ],
            explanation: 'Simple scores ignore word order, so negation like “not” fools them.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-10-next-word',
      title: 'How chatbots write: predicting the next word',
      kind: 'INTERACTIVE',
      minutes: 15,
      videoId: 'a10',
      content: {
        version: 1,
        stage: 'experiment',
        intro:
          'Chatbots seem to think, but at their heart they do one thing over and over: predict the next word. In this lesson you will train a tiny language model on a short story and watch it write.',
        objectives: [
          'Explain how a language model writes by predicting the next word',
          'Train a tiny language model and generate sentences with it',
          'Explain why chatbots can sound confident and still be wrong',
        ],
        blocks: [
          { type: 'diagram', name: 'next-word', caption: 'After “The cat sat on the”, the model gives every possible next word a chance, then picks one.' },
          {
            type: 'text',
            heading: 'One word at a time',
            body: 'A **language model** has read a huge amount of text. From it, it learned which words tend to follow which. Give it “The cat sat on the” and it knows “mat”, “floor” and “sofa” are likely, and “banana” is not.\n\nTo write an answer, it predicts one word, adds it, then predicts the next, and the next. Big chatbots learned from billions of sentences, so their predictions are very good. Your model will learn from one short story, so it will be much simpler, but it works the same way.',
          },
          { type: 'next-word-lab', id: 'tiny-lm' },
          {
            type: 'callout',
            tone: 'mistake',
            title: 'Sounding right is not being right',
            body: 'A language model picks words that *sound* likely, not words it has checked are true. That is why chatbots sometimes invent facts, books or quotes that do not exist. People call this **hallucination**. Always check important facts somewhere you trust.',
          },
          {
            type: 'check',
            id: 'hallucinate',
            prompt: 'A chatbot confidently tells you a book title that does not exist. Why can that happen?',
            options: [
              { id: 'a', text: 'It predicts words that sound likely, without checking they are true', correct: true, feedback: 'Yes. It is a word predictor, not a fact checker.' },
              { id: 'b', text: 'It is lying on purpose', correct: false, feedback: 'It has no purpose or wishes. It is predicting words.' },
              { id: 'c', text: 'The book exists but is hidden', correct: false, feedback: 'The model simply made up a likely-sounding title.' },
            ],
            explanation: 'Language models generate likely text, so always verify facts.',
          },
        ],
        summary: [
          'A language model writes by predicting the next word, again and again.',
          'It learns which words follow which from the text it was trained on.',
          'More training text gives better, more natural predictions.',
          'Likely-sounding is not the same as true, so check important facts.',
        ],
        next: 'Next, talk to a real AI chatbot, safely, and learn to ask it good questions.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'At its heart, what does a chatbot’s language model do?',
            multiple: false,
            options: [
              { id: 'a', text: 'Predicts the next word, again and again', correct: true, feedback: 'Correct.' },
              { id: 'b', text: 'Looks up every answer in a big book of facts', correct: false, feedback: 'It predicts words; it does not look everything up.' },
              { id: 'c', text: 'Asks a person to type the answer', correct: false, feedback: 'No person types the answers.' },
            ],
            explanation: 'Language models generate text one predicted word at a time.',
          },
          {
            id: 'q2',
            prompt: 'Your tiny model learned only from a story about cricket. What will its sentences be about?',
            multiple: false,
            options: [
              { id: 'a', text: 'Mostly cricket, using words from that story', correct: true, feedback: 'Yes. It only knows the words it was trained on.' },
              { id: 'b', text: 'Anything in the world', correct: false, feedback: 'It has never seen words outside its story.' },
              { id: 'c', text: 'Only maths', correct: false, feedback: 'It learned from a cricket story.' },
            ],
            explanation: 'A model can only use patterns from its training text.',
          },
          {
            id: 'q3',
            prompt: 'What is an AI “hallucination”?',
            multiple: false,
            options: [
              { id: 'a', text: 'When the AI makes up something false that sounds believable', correct: true, feedback: 'Exactly.' },
              { id: 'b', text: 'When the AI has a dream', correct: false, feedback: 'AI does not dream.' },
              { id: 'c', text: 'When the screen flickers', correct: false, feedback: 'It is about made-up information.' },
            ],
            explanation: 'Hallucinations are confident but false outputs. Check facts.',
          },
        ],
      },
      passPercent: 80,
    },
    {
      slug: 'ai101-11-chat',
      title: 'Talk to a real AI, safely',
      kind: 'INTERACTIVE',
      minutes: 18,
      videoId: 'a11',
      content: {
        version: 1,
        stage: 'practise',
        intro:
          'Now you know how chatbots work, it is time to use one. You will talk to a real AI model through a safe study helper, learn to write clear prompts, and practise checking what it tells you.',
        objectives: [
          'Write clear, specific prompts',
          'Use an AI to explain an idea, then check its answer',
          'Follow the Safe AI rules while chatting',
        ],
        blocks: [
          { type: 'diagram', name: 'chatbot-flow', caption: 'Your message is checked for safety, the model predicts a reply, and the reply is checked again before you see it.' },
          {
            type: 'text',
            heading: 'Prompts: how you ask matters',
            body: 'The message you give an AI is called a **prompt**. Clear prompts get better answers.\n\n- **Vague:** “Tell me about space.”\n- **Clear:** “Explain in 3 short points why Mars looks red, for a Class 7 student.”\n\nA good prompt says **what** you want, **how long**, and **who it is for**. If the answer is not right, ask again more clearly, or ask it to explain more simply.',
          },
          {
            type: 'sort',
            id: 'prompt-quality',
            title: 'Clear or vague?',
            prompt: 'Sort these prompts.',
            bins: [
              { id: 'clear', label: 'Clear prompt' },
              { id: 'vague', label: 'Too vague' },
            ],
            items: [
              { id: 'p1', text: '“Help.”', bin: 'vague', why: 'Help with what? The AI has to guess.' },
              { id: 'p2', text: '“Give me 3 tips to remember the planets in order, for Class 6.”', bin: 'clear', why: 'Says what, how many, and who for.' },
              { id: 'p3', text: '“Explain photosynthesis in 4 simple steps.”', bin: 'clear', why: 'A clear topic and a clear shape for the answer.' },
              { id: 'p4', text: '“Stuff about history.”', bin: 'vague', why: 'History is huge. Which part?' },
              { id: 'p5', text: '“Quiz me with 3 questions on fractions, then tell me the answers.”', bin: 'clear', why: 'A clear task with a clear format.' },
            ],
          },
          {
            type: 'callout',
            tone: 'safety',
            title: 'Before you chat',
            body: 'This helper is for learning. It will not answer questions that are unsafe, and messages that contain personal details are blocked before they reach the AI. Your teacher can see how much the class uses it. **Never type your name, address, phone number, school or passwords.** If anything worries you, stop and tell an adult.',
          },
          { type: 'ai-chat', id: 'study-helper' },
          {
            type: 'check',
            id: 'check-facts',
            prompt: 'The AI tells you the height of Mount Everest. What should you do before using it in your project?',
            options: [
              { id: 'a', text: 'Check it in a textbook or trusted website', correct: true, feedback: 'Yes. Always verify facts from an AI.' },
              { id: 'b', text: 'Use it: AI is always right', correct: false, feedback: 'AI can be wrong, even when it sounds sure.' },
              { id: 'c', text: 'Ask the AI if it is sure, and trust whatever it says', correct: false, feedback: 'Asking helps, but the AI can be wrong about being right. Check a trusted source.' },
            ],
            explanation: 'Treat AI answers as a starting point and verify them.',
          },
        ],
        summary: [
          'A prompt is the message you give an AI; clear prompts get better answers.',
          'Say what you want, how long, and who it is for.',
          'Keep personal details out of every prompt.',
          'Check important facts from AI with a trusted source.',
        ],
        next: 'Next, find out how AI can be unfair, and what you can do about it.',
      },
      quiz: {
        questions: [
          {
            id: 'q1',
            prompt: 'Which prompt will probably get the most useful answer?',
            multiple: false,
            options: [
              { id: 'a', text: '“Explain how rainbows form in 3 short points for a Class 6 student.”', correct: true, feedback: 'Yes: clear topic, length and audience.' },
              { id: 'b', text: '“Rainbows.”', correct: false, feedback: 'Too vague. What about rainbows?' },
              { id: 'c', text: '“Tell me everything.”', correct: false, feedback: 'Far too vague.' },
            ],
            explanation: 'Clear prompts say what, how long and who for.',
          },
          {
            id: 'q2',
            prompt: 'Which of these should you never type into a chatbot?',
            multiple: false,
            options: [
              { id: 'a', text: 'Your home address', correct: true, feedback: 'Right. Keep it private.' },
              { id: 'b', text: 'A question about volcanoes', correct: false, feedback: 'That is a fine question.' },
              { id: 'c', text: '“Explain this more simply, please”', correct: false, feedback: 'That is a great follow-up prompt.' },
            ],
            explanation: 'Never share personal details with an AI.',
          },
          {
            id: 'q3',
            prompt: 'The AI’s answer is too hard to understand. What is a good next step?',
            multiple: false,
            options: [
              { id: 'a', text: 'Ask it to explain more simply, with an example', correct: true, feedback: 'Yes. Follow-up prompts improve answers.' },
              { id: 'b', text: 'Give up', correct: false, feedback: 'A clearer follow-up usually helps.' },
              { id: 'c', text: 'Copy it into your homework anyway', correct: false, feedback: 'Use AI to learn, not to copy, and say when you used it.' },
            ],
            explanation: 'Refine your prompt: ask for simpler words, an example or a shorter answer.',
          },
        ],
      },
      passPercent: 80,
    },
  ],
}
