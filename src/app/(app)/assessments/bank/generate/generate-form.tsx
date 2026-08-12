'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type QuestionTypeKey,
} from '@/lib/questions'

type Subject = { id: string; label: string }
type Chapter = { id: string; name: string; code: string | null; topics: { id: string; name: string }[] }

/**
 * The generation request.
 *
 * The chapter picker is the important control, not the count. A teacher who
 * generates "ten Science questions" gets ten questions about whatever the model
 * associates with Science; a teacher who picks chapters 1 to 3 gets ten
 * questions their class has actually been taught. So the chapters are chosen
 * first, and nothing can be generated until at least one is.
 */
export function GenerateForm({ subjects }: { subjects: Subject[] }) {
  const router = useRouter()
  const { push } = useToast()

  const [classSubjectId, setClassSubjectId] = React.useState(subjects[0]?.id ?? '')
  const [chapters, setChapters] = React.useState<Chapter[] | null>(null)
  const [chapterIds, setChapterIds] = React.useState<string[]>([])
  const [count, setCount] = React.useState('5')
  const [types, setTypes] = React.useState<QuestionTypeKey[]>(['MCQ'])
  const [difficulty, setDifficulty] = React.useState('MEDIUM')
  const [marks, setMarks] = React.useState('1')
  const [note, setNote] = React.useState('')
  const [running, setRunning] = React.useState(false)

  React.useEffect(() => {
    if (!classSubjectId) return
    let cancelled = false
    setChapters(null)
    setChapterIds([])
    fetch(`/api/v1/curriculum/topics?classSubjectId=${encodeURIComponent(classSubjectId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setChapters(body?.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setChapters([])
      })
    return () => {
      cancelled = true
    }
  }, [classSubjectId])

  const topicCount = (chapters ?? [])
    .filter((chapter) => chapterIds.includes(chapter.id))
    .reduce((sum, chapter) => sum + chapter.topics.length, 0)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setRunning(true)
    try {
      const res = await fetch('/api/v1/questions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          classSubjectId,
          chapterIds,
          count: Number(count),
          types,
          difficulty,
          marks: Number(marks),
          note: note.trim() || undefined,
        }),
      })
      const body = await res.json()

      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Nothing generated',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }

      const { created, duplicates, rejected, asked } = body.data
      const discarded = duplicates + rejected
      push({
        tone: 'success',
        title: `${created} draft${created === 1 ? '' : 's'} ready to review`,
        description:
          discarded > 0
            ? `${discarded} of ${asked} were discarded — ${duplicates} already in the bank, ${rejected} off syllabus.`
            : 'Read each one before approving it.',
      })
      router.push('/assessments/bank?status=DRAFT')
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <Field label="Class and subject" required>
            <Select
              value={classSubjectId}
              onChange={(event) => setClassSubjectId(event.target.value)}
              required
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="text-sm font-medium text-ink">Chapters</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Questions come only from what these chapters cover. Anything else is discarded.
            </p>

            {chapters === null ? (
              <p className="mt-2 text-sm text-ink-subtle">Loading the syllabus…</p>
            ) : chapters.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">
                This syllabus has no chapters yet.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {chapters.map((chapter) => (
                  <label key={chapter.id} className="flex items-start gap-2 text-sm text-ink">
                    <Checkbox
                      checked={chapterIds.includes(chapter.id)}
                      onChange={(event) =>
                        setChapterIds((prev) =>
                          event.target.checked
                            ? [...prev, chapter.id]
                            : prev.filter((id) => id !== chapter.id),
                        )
                      }
                    />
                    <span>
                      {chapter.code ? `${chapter.code} · ` : ''}
                      {chapter.name}
                      <span className="ml-2 text-xs text-ink-subtle tnum">
                        {chapter.topics.length} topics
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Formats</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUESTION_TYPES.map((type) => {
                const on = types.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTypes((prev) =>
                        on ? prev.filter((value) => value !== type) : [...prev, type],
                      )
                    }
                    className={
                      on
                        ? 'rounded-full border border-transparent bg-[var(--brand-500)] px-3 py-1 text-xs font-medium text-[var(--brand-contrast)]'
                        : 'rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-muted hover:bg-surface-2'
                    }
                  >
                    {QUESTION_TYPE_LABEL[type]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="How many" required>
              <Input
                type="number"
                min="1"
                max="15"
                value={count}
                onChange={(event) => setCount(event.target.value)}
                required
              />
            </Field>

            <Field label="Difficulty">
              <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                {DIFFICULTIES.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0) + level.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Marks each">
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={marks}
                onChange={(event) => setMarks(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Anything to add" hint="Optional — a steer, in your words">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Keep the numericals to two steps. Avoid diagram questions."
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={running || chapterIds.length === 0 || types.length === 0 || topicCount === 0}
        >
          {running ? 'Generating…' : `Generate ${count}`}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/assessments/bank')}>
          Cancel
        </Button>
        {chapterIds.length > 0 && (
          <span className="text-sm text-ink-subtle tnum">
            {topicCount} topics in scope
          </span>
        )}
      </div>
    </form>
  )
}
