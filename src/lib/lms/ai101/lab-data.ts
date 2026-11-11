import { knn } from './ml'

/** Data for the AI for Young Builders labs. Fixed, so every student sees the same results. */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296
  }
}

const around = (r: () => number, c: number, spread: number) => Math.max(0.3, Math.min(9.7, c + (r() + r() + r() - 1.5) * spread))

/* ------------------------------------------------------------- k-NN lab */

export type Dot = { x: number; y: number; label: number }

/** Fruit by sweetness (x) and size (y), 0–10. Label 0 = mango, 1 = lemon. Overlap near the middle on purpose. */
export const FRUIT_LABELS = ['Mango', 'Lemon']
export const FRUIT: Dot[] = (() => {
  const r = rng(7)
  const out: Dot[] = []
  for (let i = 0; i < 14; i++) out.push({ x: around(r, 7, 2.6), y: around(r, 6.6, 2.6), label: 0 })
  for (let i = 0; i < 14; i++) out.push({ x: around(r, 3, 2.6), y: around(r, 3.2, 2.6), label: 1 })
  out.push({ x: 4.6, y: 5.4, label: 0 }, { x: 5.6, y: 4.4, label: 1 }, { x: 5.2, y: 5.6, label: 1 })
  return out
})()

/* ------------------------------------------------------------ bias lab */

/**
 * Leaf checker: spots (x) and yellowness (y), 0–10. Label 0 = healthy, 1 =
 * diseased. Group 0 = mango leaves, group 1 = neem leaves, which are naturally
 * paler, so their healthy leaves sit where mango's diseased ones do.
 */
export type GroupDot = Dot & { group: number }
export const LEAF_LABELS = ['Healthy', 'Diseased']
export const LEAF_GROUPS = ['Mango leaves', 'Neem leaves']

function leaves(seed: number, group: number, perLabel: number): GroupDot[] {
  const r = rng(seed)
  const out: GroupDot[] = []
  const centres = group === 0 ? [[2.5, 2.5], [6, 6.5]] : [[4.2, 7], [7.8, 8.6]]
  for (let label = 0; label < 2; label++)
    for (let i = 0; i < perLabel; i++) out.push({ x: around(r, centres[label]![0]!, 1.8), y: around(r, centres[label]![1]!, 1.5), label, group })
  return out
}

export const LEAF_TRAIN_START: GroupDot[] = [...leaves(11, 0, 12), ...leaves(12, 1, 1)]
/** Each "add more neem leaves" press adds the next batch (5 healthy, 5 diseased). */
export const LEAF_EXTRA: GroupDot[] = leaves(13, 1, 15)
export const LEAF_TEST: GroupDot[] = [...leaves(21, 0, 10), ...leaves(22, 1, 10)]
export const LEAF_BATCHES = 3

function leafBatch(n: number): GroupDot[] {
  const healthy = LEAF_EXTRA.filter((d) => d.label === 0).slice(n * 5, n * 5 + 5)
  const sick = LEAF_EXTRA.filter((d) => d.label === 1).slice(n * 5, n * 5 + 5)
  return [...healthy, ...sick]
}

export function leafTrain(batches: number) {
  return [...LEAF_TRAIN_START, ...Array.from({ length: batches }, (_, i) => leafBatch(i)).flat()]
}

function groupAccuracy(train: GroupDot[], group: number) {
  const ex = train.map((d) => ({ label: d.label, v: [d.x, d.y] }))
  const mine = LEAF_TEST.filter((t) => t.group === group)
  return Math.round((mine.filter((t) => knn(ex, [t.x, t.y], 3, 2)!.label === t.label).length / mine.length) * 100)
}

/** Test accuracy per leaf group after `batches` extra neem batches; fixed when neem is good and the gap is small. */
export function biasFixed(batches: number) {
  const train = leafTrain(batches)
  const a = groupAccuracy(train, 0)
  const b = groupAccuracy(train, 1)
  return { a, b, fixed: b >= 80 && Math.abs(a - b) <= 15 }
}

/* ------------------------------------------------------------ tree lab */

export const ANIMAL_FEATURES = [
  { id: 'feathers', ask: 'Has feathers?' },
  { id: 'fur', ask: 'Has fur or hair?' },
  { id: 'water', ask: 'Lives in water?' },
  { id: 'flies', ask: 'Can fly?' },
  { id: 'eggs', ask: 'Lays eggs?' },
  { id: 'scales', ask: 'Has scales?' },
] as const

export type AnimalFeature = (typeof ANIMAL_FEATURES)[number]['id']
export type Animal = { name: string; kind: 'Bird' | 'Mammal' | 'Fish' } & Record<AnimalFeature, boolean>
export const ANIMAL_KINDS = ['Bird', 'Mammal', 'Fish'] as const

const a = (name: string, kind: Animal['kind'], f: Partial<Record<AnimalFeature, boolean>>): Animal => ({
  name,
  kind,
  feathers: false,
  fur: false,
  water: false,
  flies: false,
  eggs: false,
  scales: false,
  ...f,
})

export const ANIMALS_TRAIN: Animal[] = [
  a('Sparrow', 'Bird', { feathers: true, flies: true, eggs: true }),
  a('Parrot', 'Bird', { feathers: true, flies: true, eggs: true }),
  a('Peacock', 'Bird', { feathers: true, flies: true, eggs: true }),
  a('Hen', 'Bird', { feathers: true, eggs: true }),
  a('Dog', 'Mammal', { fur: true }),
  a('Cow', 'Mammal', { fur: true }),
  a('Tiger', 'Mammal', { fur: true }),
  a('Goldfish', 'Fish', { water: true, eggs: true, scales: true }),
  a('Rohu', 'Fish', { water: true, eggs: true, scales: true }),
  a('Shark', 'Fish', { water: true, scales: true }),
]

/** Unusual animals the tree has never seen. */
export const ANIMALS_TEST: Animal[] = [
  a('Penguin', 'Bird', { feathers: true, water: true, eggs: true }),
  a('Bat', 'Mammal', { fur: true, flies: true }),
  a('Dolphin', 'Mammal', { water: true }),
  a('Duck', 'Bird', { feathers: true, water: true, flies: true, eggs: true }),
  a('Seahorse', 'Fish', { water: true, eggs: true }),
]

/* ------------------------------------------------------------ word lab */

export const SCORE_WORDS = ['delicious', 'tasty', 'fresh', 'love', 'great', 'cold', 'stale', 'soggy', 'boring', 'awful'] as const
/** Scores the model already knows; the learner sets the rest. */
export const FIXED_SCORES: Record<string, number> = { good: 1, bad: -1 }

export const REVIEWS: { text: string; happy: boolean; not?: boolean }[] = [
  { text: 'The samosas were hot and delicious', happy: true },
  { text: 'The bread was stale and the tea was cold', happy: false },
  { text: 'I love the fresh fruit salad', happy: true },
  { text: 'The noodles were soggy and boring', happy: false },
  { text: 'Great taste and a tasty chutney', happy: true },
  { text: 'The soup was awful', happy: false },
  { text: 'The dal was not good today', happy: false, not: true },
  { text: 'The paneer was not bad at all', happy: true, not: true },
]

/* ------------------------------------------------------- next-word lab */

export const STORIES: { id: string; title: string; text: string }[] = [
  {
    id: 'monsoon',
    title: 'The monsoon',
    text: 'The monsoon came to the village. The rain fell on the fields and the rain fell on the school roof. The children ran to the window. The children saw the river grow. The farmers were happy because the rain was good for the fields. The rain stopped in the evening and the children ran outside. The children made paper boats and the boats sailed on the water. The monsoon is the best time of the year.',
  },
  {
    id: 'cricket',
    title: 'The cricket match',
    text: 'The match started in the morning. Priya was the captain of the team. Priya hit the ball and the ball flew over the boundary. The crowd cheered for the team. Then Arjun bowled the ball and the ball hit the stumps. The team needed six runs. Priya hit the ball high and the ball went over the boundary again. The team won the match and the crowd cheered. Priya and Arjun lifted the cup.',
  },
  {
    id: 'robot',
    title: 'The school robot',
    text: 'The school has a small robot. The robot follows a black line on the floor. The robot reads the line with two sensors. When the robot sees the line it turns. The students built the robot in the lab. The students wrote the code for the robot. The robot carried the books to the library. The teacher was proud of the students and the students were proud of the robot.',
  },
]

/* ----------------------------------------------------------- pixel lab */

export const PIXEL_SIZE = 10
export const PIXEL_PUZZLES: { id: string; title: string; rows: string[] }[] = [
  { id: 'heart', title: 'Secret picture 1', rows: ['0000000000', '0110001100', '1111011110', '1111111111', '1111111111', '0111111110', '0011111100', '0001111000', '0000110000', '0000000000'] },
  { id: 'house', title: 'Secret picture 2', rows: ['0000110000', '0001111000', '0011111100', '0111111110', '1111111111', '0100000010', '0101101010', '0101101010', '0100110010', '0111111110'] },
]
