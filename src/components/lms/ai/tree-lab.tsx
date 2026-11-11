'use client'

import * as React from 'react'
import { Check, FlaskConical, GitBranch, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ANIMAL_FEATURES, ANIMAL_KINDS, ANIMALS_TEST, ANIMALS_TRAIN, type Animal, type AnimalFeature } from '@/lib/lms/ai101/lab-data'
import { classify, type TreeNode } from '@/lib/lms/ai101/ml'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useResult, type Of } from './use-result'

const MAX_DEPTH = 3
const UNSET = ''

type Saved = { tree: TreeNode; tested: boolean }
type Path = ('yes' | 'no')[]

const ask = (q: string) => ANIMAL_FEATURES.find((f) => f.id === q)?.ask ?? q

function update(node: TreeNode, path: Path, next: TreeNode): TreeNode {
  if (!path.length) return next
  if (typeof node === 'string') return node
  const [head, ...rest] = path
  return { ...node, [head!]: update(node[head!], rest, next) }
}

/** Which training animals arrive at the node at `path`. */
function arriving(tree: TreeNode, path: Path, animals: Animal[]) {
  return animals.filter((a) => {
    let node = tree
    for (const step of path) {
      if (typeof node === 'string') return false
      const answer = a[node.q as AnimalFeature] ? 'yes' : 'no'
      if (answer !== step) return false
      node = node[step]
    }
    return true
  })
}

/** Questions already asked on the way down to `path`. */
function asked(tree: TreeNode, path: Path) {
  const out: string[] = []
  let node = tree
  for (const step of path) {
    if (typeof node === 'string') break
    out.push(node.q)
    node = node[step]
  }
  return out
}

const label = (kind: string) => kind || '?'

export function TreeLab({ block }: { block: Of<'tree-lab'> }) {
  const { result, record } = useResult(block.id)
  const { get, set } = useLessonState()
  const saved = get<Saved>(`tree:${block.id}`, { tree: UNSET, tested: false })
  const { tree } = saved

  const train = ANIMALS_TRAIN.map((a) => ({ a, got: classify(tree, a) }))
  const right = train.filter((t) => t.got === t.a.kind).length
  const perfect = right === train.length
  const test = ANIMALS_TEST.map((a) => ({ a, got: classify(tree, a) }))
  const testRight = test.filter((t) => t.got === t.a.kind).length
  const testScore = Math.round((testRight / test.length) * 100)

  function change(path: Path, next: TreeNode) {
    set(`tree:${block.id}`, { tree: update(tree, path, next), tested: false } satisfies Saved)
  }

  function runTest() {
    set(`tree:${block.id}`, { tree, tested: true } satisfies Saved)
    record({ done: true, score: testScore })
  }

  return (
    <ActivityCard kicker="Decision tree lab" title="Build an animal sorter" done={result?.done}>
      <p className="text-sm text-ink-muted">
        Build a tree of yes-or-no questions that sorts these {ANIMALS_TRAIN.length} animals into birds, mammals and fish. Add a question, then choose an answer at the end of each branch. You can go {MAX_DEPTH} questions deep.
      </p>
      <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3">
        <NodeEditor node={tree} path={[]} tree={tree} onChange={change} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Training animals: {right} of {train.length} right
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
            {train.map(({ a, got }) => (
              <li key={a.name} className={cn('flex items-center gap-1.5', got === a.kind ? 'text-success' : 'text-ink')}>
                {got === a.kind ? <Check className="size-3.5 shrink-0" aria-hidden /> : <X className="size-3.5 shrink-0 text-[var(--danger)]" aria-hidden />}
                {a.name}
                <span className="text-ink-subtle">→ {label(got)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Unusual animals it has never seen</p>
          {saved.tested ? (
            <>
              <ul className="mt-2 space-y-1 text-sm" role="status">
                {test.map(({ a, got }) => (
                  <li key={a.name} className="flex items-center gap-1.5">
                    {got === a.kind ? <Check className="size-3.5 shrink-0 text-success" aria-hidden /> : <X className="size-3.5 shrink-0 text-[var(--danger)]" aria-hidden />}
                    <strong className="font-medium">{a.name}</strong>
                    <span className="text-ink-subtle">
                      tree said {label(got)}, really a {a.kind.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
              <Feedback tone={testRight === test.length ? 'right' : 'info'}>
                {testRight === test.length
                  ? 'Every unusual animal sorted correctly. Your questions capture what really makes a bird, mammal or fish.'
                  : `${testRight} of ${test.length} right. Your tree was perfect on the training animals but not on these. Can you change a question so more of them work without breaking the training ones?`}
              </Feedback>
            </>
          ) : (
            <div className="mt-2 space-y-2 text-sm">
              <p className="text-ink-muted">{perfect ? 'All training animals are right. Now the real test: animals the tree has never seen.' : 'Get every training animal right first, then test your tree.'}</p>
              <Button size="sm" onClick={runTest} disabled={!perfect}>
                <FlaskConical /> Test on new animals
              </Button>
            </div>
          )}
        </div>
      </div>
      {tree !== UNSET ? (
        <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink" onClick={() => set(`tree:${block.id}`, { tree: UNSET, tested: false } satisfies Saved)}>
          <RotateCcw className="size-3" aria-hidden /> Start a new tree
        </button>
      ) : null}
    </ActivityCard>
  )
}

function NodeEditor({ node, path, tree, onChange }: { node: TreeNode; path: Path; tree: TreeNode; onChange: (path: Path, next: TreeNode) => void }) {
  const here = arriving(tree, path, ANIMALS_TRAIN)
  if (typeof node === 'string') {
    return (
      <div className="min-w-[9rem] rounded-[var(--radius)] border border-line bg-surface p-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-muted">Answer</span>
          <select
            value={node}
            onChange={(e) => onChange(path, e.target.value)}
            className="min-h-8 rounded-[var(--radius-sm)] border border-line bg-surface px-1.5 text-sm"
            aria-label={`Answer for ${path.length ? path.join(' then ') : 'the start'}`}
          >
            <option value={UNSET}>?</option>
            {ANIMAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-ink-subtle">{here.length ? here.map((a) => a.name).join(', ') : 'No animals reach here'}</p>
        {path.length < MAX_DEPTH ? (
          <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-600)] hover:underline" onClick={() => onChange(path, { q: (ANIMAL_FEATURES.find((f) => !asked(tree, path).includes(f.id)) ?? ANIMAL_FEATURES[0]).id, yes: UNSET, no: UNSET })}>
            <GitBranch className="size-3" aria-hidden /> Ask a question here
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="min-w-max">
      <div className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border-2 border-ink bg-surface px-2 py-1.5 text-sm">
        <select
          value={node.q}
          onChange={(e) => onChange(path, { ...node, q: e.target.value })}
          className="min-h-8 rounded-[var(--radius-sm)] border border-line bg-surface px-1.5 text-sm font-medium"
          aria-label="Question"
        >
          {ANIMAL_FEATURES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.ask}
            </option>
          ))}
        </select>
        <button type="button" className="rounded p-1 text-ink-subtle hover:text-[var(--danger)]" onClick={() => onChange(path, UNSET)} aria-label={`Remove the question “${ask(node.q)}”`}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex gap-3 border-l-2 border-line pl-3">
        {(['yes', 'no'] as const).map((side) => (
          <div key={side}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{side}</p>
            <NodeEditor node={node[side]} path={[...path, side]} tree={tree} onChange={onChange} />
          </div>
        ))}
      </div>
    </div>
  )
}
