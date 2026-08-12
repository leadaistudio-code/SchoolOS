'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import {
  BLOOM_LABEL,
  BLOOM_LEVELS,
  OPTION_TYPES,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  type QuestionTypeKey,
} from '@/lib/questions'

type Subject = { id: string; label: string; hasSyllabus: boolean }
type Chapter = { id: string; name: string; code: string | null; topics: { id: string; name: string }[] }
type Similar = { id: string; text: string; marks: number; score: number; exact: boolean }
type Option = { text: string; isCorrect: boolean; matchWith: string }

const EMPTY_OPTION: Option = { text: '', isCorrect: false, matchWith: '' }

/**
 * Question entry.
 *
 * Two things here are not decoration. The option editor changes shape with the
 * type, because a match-the-following pair and an MCQ choice are not the same
 * object and pretending otherwise produces a form that validates and then marks
 * wrongly. And the duplicate check runs before the save, not after: a repeat
 * caught while the teacher is still looking at the question can be changed,
 * where one reported afterwards has already reached the bank.
 */
export function QuestionForm({ subjects }: { subjects: Subject[] }) {
  const router = useRouter()
  const { push } = useToast()

  const [classSubjectId, setClassSubjectId] = React.useState(subjects[0]?.id ?? '')
  const [text, setText] = React.useState('')
  const [type, setType] = React.useState<QuestionTypeKey>('MCQ')
  const [difficulty, setDifficulty] = React.useState('MEDIUM')
  const [marks, setMarks] = React.useState('1')
  const [bloomLevel, setBloomLevel] = React.useState('')
  const [solution, setSolution] = React.useState('')
  const [explanation, setExplanation] = React.useState('')
  const [source, setSource] = React.useState('')
  const [isShared, setIsShared] = React.useState(false)
  const [options, setOptions] = React.useState<Option[]>([{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }])
  const [topicIds, setTopicIds] = React.useState<string[]>([])

  const [chapters, setChapters] = React.useState<Chapter[]>([])
  const [similar, setSimilar] = React.useState<Similar[] | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const needsOptions = OPTION_TYPES.includes(type)
  const isMatch = type === 'MATCH'
  const subject = subjects.find((s) => s.id === classSubjectId)

  // Topics follow the chosen subject. Cleared alongside, so a tag from the
  // previous subject can never be submitted against this one.
  React.useEffect(() => {
    if (!classSubjectId) return
    setTopicIds([])
    let cancelled = false
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

  // True/false writes its own options — the teacher only marks which is right.
  React.useEffect(() => {
    if (type === 'TRUE_FALSE') {
      setOptions([
        { text: 'True', isCorrect: true, matchWith: '' },
        { text: 'False', isCorrect: false, matchWith: '' },
      ])
    }
  }, [type])

  async function checkDuplicates() {
    if (text.trim().length < 5 || !classSubjectId) return
    setChecking(true)
    try {
      const res = await fetch('/api/v1/questions/similar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classSubjectId, text: text.trim() }),
      })
      const body = await res.json()
      setSimilar(res.ok ? body.data : [])
    } catch {
      setSimilar([])
    } finally {
      setChecking(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})

    const payload = {
      classSubjectId,
      text: text.trim(),
      type,
      difficulty,
      marks: Number(marks),
      bloomLevel: bloomLevel || undefined,
      solution: solution.trim() || undefined,
      explanation: explanation.trim() || undefined,
      source: source.trim() || undefined,
      isShared,
      topicIds,
      options: needsOptions
        ? options
            .filter((option) => option.text.trim())
            .map((option) => ({
              text: option.text.trim(),
              isCorrect: option.isCorrect,
              matchWith: isMatch ? option.matchWith.trim() || undefined : undefined,
            }))
        : [],
    }

    try {
      const res = await fetch('/api/v1/questions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()

      if (!res.ok) {
        // The API returns field paths from Zod; surface them beside the field
        // rather than as one opaque banner.
        const fields = body?.error?.details
        if (Array.isArray(fields)) {
          setErrors(
            Object.fromEntries(
              fields.map((issue: { path?: string[]; message: string }) => [
                issue.path?.[0] ?? 'form',
                issue.message,
              ]),
            ),
          )
        }
        push({
          tone: 'error',
          title: 'Not saved',
          description: body?.error?.message ?? 'Check the highlighted fields.',
        })
        return
      }

      push({ tone: 'success', title: 'Question added' })
      router.push('/assessments/bank')
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>The question</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class and subject" required>
              <Select
                value={classSubjectId}
                onChange={(event) => setClassSubjectId(event.target.value)}
                required
              >
                {subjects.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Type" required>
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as QuestionTypeKey)}
              >
                {QUESTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {QUESTION_TYPE_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Question" required error={errors.text}>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onBlur={checkDuplicates}
              rows={4}
              required
              placeholder="Write the question exactly as a student should read it."
            />
          </Field>

          {checking && <p className="text-sm text-ink-subtle">Checking for repeats…</p>}

          {similar && similar.length > 0 && (
            <Notice tone="warning" title="You may have asked this before">
              <ul className="mt-2 flex flex-col gap-2">
                {similar.map((match) => (
                  <li key={match.id} className="text-sm">
                    <Badge tone={match.exact ? 'warning' : 'neutral'}>
                      {match.exact ? 'identical' : `${Math.round(match.score * 100)}% alike`}
                    </Badge>{' '}
                    <span className="text-ink-muted">{match.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-muted">
                Save anyway if this is a deliberate variant — repeats are only a problem when they
                are accidental.
              </p>
            </Notice>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Marks" required error={errors.marks}>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={marks}
                onChange={(event) => setMarks(event.target.value)}
                required
              />
            </Field>

            <Field label="Difficulty">
              <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
            </Field>

            <Field label="Bloom's level" hint="Optional">
              <Select value={bloomLevel} onChange={(event) => setBloomLevel(event.target.value)}>
                <option value="">Not set</option>
                {BLOOM_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {BLOOM_LABEL[level]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {needsOptions && (
        <Card>
          <CardHeader>
            <CardTitle>{isMatch ? 'Pairs' : 'Options'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {errors.options && <p className="text-sm text-danger">{errors.options}</p>}

            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                {!isMatch && (
                  <Checkbox
                    checked={option.isCorrect}
                    aria-label={`Option ${index + 1} is correct`}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, isCorrect: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                )}
                <Input
                  value={option.text}
                  placeholder={isMatch ? 'Left-hand item' : `Option ${index + 1}`}
                  aria-label={isMatch ? `Pair ${index + 1} left` : `Option ${index + 1}`}
                  disabled={type === 'TRUE_FALSE'}
                  onChange={(event) =>
                    setOptions((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, text: event.target.value } : row)),
                    )
                  }
                />
                {isMatch && (
                  <Input
                    value={option.matchWith}
                    placeholder="Matches with"
                    aria-label={`Pair ${index + 1} right`}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, matchWith: event.target.value } : row,
                        ),
                      )
                    }
                  />
                )}
                {type !== 'TRUE_FALSE' && options.length > 2 && (
                  <IconButton
                    label={`Remove option ${index + 1}`}
                    variant="ghost"
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
            ))}

            {type !== 'TRUE_FALSE' && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOptions((prev) => [...prev, { ...EMPTY_OPTION }])}
                >
                  <Plus /> Add {isMatch ? 'pair' : 'option'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Answer and filing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Expected answer"
            hint="Required for descriptive questions worth 3 marks or more"
            error={errors.solution}
          >
            <Textarea
              value={solution}
              onChange={(event) => setSolution(event.target.value)}
              rows={3}
              placeholder="The answer, or the points an answer must make to earn full marks."
            />
          </Field>

          <Field label="Explanation" hint="Shown to students with their result, never before">
            <Textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={2}
            />
          </Field>

          <Field label="Source" hint="Textbook, chapter or paper this came from">
            <Input value={source} onChange={(event) => setSource(event.target.value)} />
          </Field>

          <div>
            <p className="text-sm font-medium text-ink">Topics</p>
            {!subject?.hasSyllabus ? (
              <p className="mt-1 text-sm text-ink-muted">
                This subject has no syllabus yet. The question will save without topic tags, but a
                generated paper cannot find it until the syllabus exists.
              </p>
            ) : chapters.length === 0 ? (
              <p className="mt-1 text-sm text-ink-muted">No chapters in the syllabus yet.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {chapters.map((chapter) => (
                  <div key={chapter.id}>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                      {chapter.code ? `${chapter.code} · ` : ''}
                      {chapter.name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {chapter.topics.length === 0 ? (
                        <span className="text-sm text-ink-subtle">No topics</span>
                      ) : (
                        chapter.topics.map((topic) => {
                          const on = topicIds.includes(topic.id)
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setTopicIds((prev) =>
                                  on ? prev.filter((id) => id !== topic.id) : [...prev, topic.id],
                                )
                              }
                              className={
                                on
                                  ? 'rounded-full border border-transparent bg-[var(--brand-500)] px-3 py-1 text-xs font-medium text-[var(--brand-contrast)]'
                                  : 'rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-muted hover:bg-surface-2'
                              }
                            >
                              {topic.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />
            Share with other teachers in this school
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving || !text.trim() || !classSubjectId}>
          {saving ? 'Saving…' : 'Add to bank'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/assessments/bank')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
