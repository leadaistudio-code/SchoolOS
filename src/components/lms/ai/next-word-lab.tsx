'use client'

import * as React from 'react'
import { Dices, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STORIES } from '@/lib/lms/ai101/lab-data'
import { nextWords, pickNext, trainBigrams, words } from '@/lib/lms/ai101/ml'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useResult, type Of } from './use-result'

const OWN = 'own'
const GOAL = 6
const SHOWN = 6
const MIN_OWN_WORDS = 20

export function NextWordLab({ block }: { block: Of<'next-word-lab'> }) {
  const { result, record } = useResult(block.id)
  const [source, setSource] = React.useState(STORIES[0]!.id)
  const [own, setOwn] = React.useState('')
  const [sentence, setSentence] = React.useState<string[]>(['the'])

  const text = source === OWN ? own : (STORIES.find((s) => s.id === source)?.text ?? '')
  const ownTooShort = source === OWN && words(own).filter((w) => w !== '.').length < MIN_OWN_WORDS
  const model = React.useMemo(() => trainBigrams(text), [text])
  const last = sentence.at(-1)!
  const ended = last === '.'
  const options = ended ? [] : nextWords(model, last)
  const count = sentence.filter((w) => w !== '.').length

  function choose(source: string) {
    setSource(source)
    setSentence(['the'])
  }

  function add(word: string | undefined) {
    if (!word) return
    const next = [...sentence, word]
    setSentence(next)
    if (next.filter((w) => w !== '.').length >= GOAL && !result?.done) record({ done: true, score: 100 })
  }

  function autoWrite() {
    let s = [...sentence]
    for (let i = 0; i < 10 && s.at(-1) !== '.'; i++) {
      const w = pickNext(nextWords(model, s.at(-1)!), Math.random())
      if (!w) break
      s = [...s, w]
    }
    setSentence(s)
    if (s.filter((w) => w !== '.').length >= GOAL && !result?.done) record({ done: true, score: 100 })
  }

  const shown = sentence
    .map((w, i) => (w !== '.' && (i === 0 || sentence[i - 1] === '.') ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replaceAll(' .', '.')

  return (
    <ActivityCard kicker="Language model lab" title="A tiny language model" done={result?.done}>
      <p className="text-sm text-ink-muted">
        This model has read one short story. For every word, it counted which words came next. Now it suggests the next word, with its chances. Build a sentence of at least {GOAL} words by picking words, or let the model pick for you.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STORIES.map((s) => (
          <Pill key={s.id} active={source === s.id} onClick={() => choose(s.id)}>
            {s.title}
          </Pill>
        ))}
        <Pill active={source === OWN} onClick={() => choose(OWN)}>
          My own text
        </Pill>
      </div>
      {source === OWN ? (
        <div className="mt-3">
          <label htmlFor={`${block.id}-own`} className="text-sm font-medium text-ink">
            Type or paste a short story ({MIN_OWN_WORDS}+ words). It stays on this page and is not saved or sent anywhere.
          </label>
          <textarea
            id={`${block.id}-own`}
            value={own}
            onChange={(e) => {
              setOwn(e.target.value.slice(0, 3000))
              setSentence(['the'])
            }}
            rows={4}
            className="mt-1 w-full rounded-[var(--radius)] border border-line bg-surface p-2 text-sm"
          />
        </div>
      ) : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-muted">Read the story the model learned from</summary>
          <p className="mt-1 rounded-[var(--radius)] bg-surface-2 p-3 text-ink">{text}</p>
        </details>
      )}

      {ownTooShort ? (
        <Feedback tone="info">A model needs data. Type at least {MIN_OWN_WORDS} words that use “the” a few times.</Feedback>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Your sentence ({count} words)</p>
            <p className="mt-1 min-h-12 rounded-[var(--radius)] border-2 border-ink bg-surface px-3 py-2 text-lg font-medium text-ink" aria-live="polite">
              {shown}
              {!ended ? <span className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-ink align-middle" aria-hidden /> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => add(pickNext(options, Math.random()))} disabled={!options.length}>
                <Dices /> Let the model pick
              </Button>
              <Button size="sm" variant="secondary" onClick={autoWrite} disabled={!options.length}>
                Write up to 10 words
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSentence((s) => (s.length > 1 ? s.slice(0, -1) : s))} disabled={sentence.length < 2}>
                <Undo2 /> Undo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSentence(['the'])}>
                <RotateCcw /> Start again
              </Button>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">After “{last}”, the model predicts</p>
            {options.length ? (
              <ul className="mt-2 space-y-1.5">
                {options.slice(0, SHOWN).map((o) => (
                  <li key={o.word}>
                    <button type="button" onClick={() => add(o.word)} className="group w-full text-left" aria-label={`Add “${o.word}”, ${Math.round(o.chance * 100)}% chance`}>
                      <span className="flex justify-between text-sm">
                        <span className="font-medium text-ink group-hover:underline">{o.word === '.' ? '(end the sentence)' : o.word}</span>
                        <span className="tabular-nums text-ink-muted">{Math.round(o.chance * 100)}%</span>
                      </span>
                      <span className="mt-0.5 block h-2 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-[var(--brand-500)]" style={{ width: `${Math.max(4, o.chance * 100)}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
                {options.length > SHOWN ? <li className="text-xs text-ink-subtle">and {options.length - SHOWN} less likely words</li> : null}
              </ul>
            ) : (
              <div className="mt-2 space-y-2 text-sm text-ink-muted">
                <p>
                  {ended
                    ? count < GOAL
                      ? `The model ended the sentence after ${count} words. Keep going with a second sentence to reach ${GOAL}.`
                      : 'The sentence is finished. Start again to write another.'
                    : `The story never has a word after “${last}”, so the model is stuck. Undo or start again.`}
                </p>
                {ended && count < GOAL ? (
                  <Button size="sm" variant="secondary" onClick={() => setSentence((s) => [...s, 'the'])}>
                    Start a second sentence
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
      {result?.done ? (
        <Feedback tone="right">
          That is how a chatbot writes: predict a likely next word, add it, repeat. Notice the sentences sound like the story, because the model only knows what it read. A chatbot trained on billions of sentences does the same thing, just far better.
        </Feedback>
      ) : null}
    </ActivityCard>
  )
}
