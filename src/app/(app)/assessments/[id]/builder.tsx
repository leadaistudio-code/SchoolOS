'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type QuestionTypeKey,
} from '@/lib/questions'

type Placement = {
  id: string
  position: number
  marks: number
  textSnapshot: string
  optionsSnapshot: unknown
  answerSnapshot: string | null
  typeSnapshot: string
  difficultySnapshot: string
  questionId: string | null
}

type Section = {
  id: string
  title: string
  instructions: string | null
  position: number
  questions: Placement[]
}

type Assessment = {
  id: string
  title: string
  totalMarks: number
  status: string
  classSubjectId: string
  sections: Section[]
}

type Blueprint = {
  declared: number
  placed: number
  difference: number
  balanced: boolean
  questionCount: number
  byType: Record<string, number>
  byDifficulty: Record<string, number>
}

type BankQuestion = {
  id: string
  text: string
  type: string
  marks: number
  difficulty: string
  topics: { topic: { name: string } }[]
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const parsed = await res.json().catch(() => null)
  if (!res.ok) throw new Error(parsed?.error?.message ?? 'Something went wrong. Please try again.')
  return parsed?.data
}

/**
 * The paper builder.
 *
 * The marks bar at the top is the point of the screen. A teacher declares "this
 * is a 40-mark paper" before placing anything, then places questions; those two
 * numbers disagree for most of the time the paper is being built, which is
 * fine. What is not fine is printing a paper headed "Maximum Marks: 40" that
 * adds up to 38 — so the difference is always on screen, and approval refuses
 * while it is non-zero.
 */
export function PaperBuilder({
  assessment,
  blueprint,
  canEdit,
  canApprove,
  canCreate,
}: {
  assessment: Assessment
  blueprint: Blueprint
  canEdit: boolean
  canApprove: boolean
  canCreate: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [picking, setPicking] = React.useState<string | null>(null)

  const run = React.useCallback(
    async (work: () => Promise<unknown>, success?: string) => {
      setBusy(true)
      try {
        await work()
        if (success) push({ tone: 'success', title: success })
        router.refresh()
        return true
      } catch (err) {
        push({
          tone: 'error',
          title: 'Not saved',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
        return false
      } finally {
        setBusy(false)
      }
    },
    [push, router],
  )

  function movePlacement(section: Section, index: number, delta: number) {
    const ids = section.questions.map((question) => question.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    void run(() => send(`/api/v1/assessments/sections/${section.id}/reorder`, 'POST', { ids }))
  }

  let printedNumber = 0

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Placed</p>
              <p className="text-lg font-semibold tnum text-ink">
                {blueprint.placed}
                <span className="text-ink-subtle"> / {blueprint.declared}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Questions</p>
              <p className="text-lg font-semibold tnum text-ink">{blueprint.questionCount}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIFFICULTIES.map((level) =>
                blueprint.byDifficulty[level] ? (
                  <Badge key={level} tone="neutral">
                    {blueprint.byDifficulty[level]} {level.toLowerCase()}
                  </Badge>
                ) : null,
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canApprove && assessment.status !== 'APPROVED' && (
              <Button
                disabled={busy || !blueprint.balanced || blueprint.questionCount === 0}
                onClick={() =>
                  run(() => send(`/api/v1/assessments/${assessment.id}/approve`, 'POST'), 'Paper approved')
                }
              >
                Approve
              </Button>
            )}
            {canApprove && assessment.status === 'APPROVED' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => send(`/api/v1/assessments/${assessment.id}/approve`, 'DELETE'),
                    'Paper reopened',
                  )
                }
              >
                Reopen
              </Button>
            )}
            {canCreate && assessment.status === 'APPROVED' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const result = await send(`/api/v1/assessments/${assessment.id}/sets`, 'POST')
                    push({
                      tone: 'success',
                      title: `Set ${result.setLabel} created`,
                      description:
                        result.reused > 0
                          ? `${result.reused} questions were reused — the bank had no alternative at the same marks and difficulty.`
                          : 'Every question was replaced with a different one.',
                    })
                    router.push(`/assessments/${result.id}`)
                    router.refresh()
                  } catch (err) {
                    push({
                      tone: 'error',
                      title: 'Could not build the set',
                      description: err instanceof Error ? err.message : 'Please try again.',
                    })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Generate alternate set
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!blueprint.balanced && blueprint.questionCount > 0 && (
        <Notice tone="warning" title="The paper does not add up">
          The questions come to {blueprint.placed} marks against a declared total of{' '}
          {blueprint.declared} — {blueprint.difference > 0 ? 'over' : 'short'} by{' '}
          {Math.abs(blueprint.difference)}. Change the marks on a question, or change the paper
          total. It cannot be approved until they agree.
        </Notice>
      )}

      {assessment.sections.map((section, sectionIndex) => (
        <Card key={section.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{section.title}</CardTitle>
              <p className="mt-1 text-sm text-ink-muted">
                {section.questions.length} questions ·{' '}
                {section.questions.reduce((sum, question) => sum + question.marks, 0)} marks
                {section.instructions ? ` · ${section.instructions}` : ''}
              </p>
            </div>

            {canEdit && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setPicking(picking === section.id ? null : section.id)}
                >
                  <Plus /> Add questions
                </Button>
                {assessment.sections.length > 1 && (
                  <IconButton
                    label={`Delete ${section.title}`}
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Delete ${section.title} and its questions?`)) return
                      void run(
                        () => send(`/api/v1/assessments/sections/${section.id}`, 'DELETE'),
                        'Section deleted',
                      )
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="flex flex-col gap-2">
            {section.questions.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nothing here yet. Add questions from the bank.
              </p>
            ) : (
              section.questions.map((placement, index) => {
                printedNumber += 1
                return (
                  <div
                    key={placement.id}
                    className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-surface p-3"
                  >
                    <span className="mt-0.5 text-sm font-medium tnum text-ink-subtle">
                      {printedNumber}.
                    </span>

                    <div className="flex-1">
                      <p className="text-sm text-ink">{placement.textSnapshot}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-subtle">
                          {QUESTION_TYPE_LABEL[placement.typeSnapshot as QuestionTypeKey] ??
                            placement.typeSnapshot}
                        </span>
                        <Badge tone="neutral">{placement.difficultySnapshot.toLowerCase()}</Badge>
                        {!placement.questionId && (
                          <Badge tone="warning">no longer in the bank</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {canEdit ? (
                        <Input
                          type="number"
                          min="0.5"
                          step="0.5"
                          defaultValue={String(placement.marks)}
                          aria-label={`Marks for question ${printedNumber}`}
                          className="w-20"
                          onBlur={(event) => {
                            const marks = Number(event.target.value)
                            if (!marks || marks === placement.marks) return
                            void run(() =>
                              send(`/api/v1/assessments/placements/${placement.id}`, 'PATCH', {
                                marks,
                              }),
                            )
                          }}
                        />
                      ) : (
                        <span className="text-sm tnum text-ink-muted">{placement.marks}</span>
                      )}

                      {canEdit && (
                        <>
                          <IconButton
                            label="Move up"
                            variant="ghost"
                            disabled={busy || index === 0}
                            onClick={() => movePlacement(section, index, -1)}
                          >
                            <ChevronUp />
                          </IconButton>
                          <IconButton
                            label="Move down"
                            variant="ghost"
                            disabled={busy || index === section.questions.length - 1}
                            onClick={() => movePlacement(section, index, 1)}
                          >
                            <ChevronDown />
                          </IconButton>
                          <IconButton
                            label="Remove from paper"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  send(`/api/v1/assessments/placements/${placement.id}`, 'DELETE'),
                                'Removed from the paper',
                              )
                            }
                          >
                            <Trash2 />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}

            {picking === section.id && canEdit && (
              <QuestionPicker
                classSubjectId={assessment.classSubjectId}
                alreadyPlaced={assessment.sections.flatMap((s) =>
                  s.questions.map((q) => q.questionId).filter(Boolean),
                )}
                onClose={() => setPicking(null)}
                onPlace={async (questionIds) => {
                  const done = await run(
                    () =>
                      send(`/api/v1/assessments/sections/${section.id}/questions`, 'POST', {
                        questionIds,
                      }),
                    `${questionIds.length} added to ${section.title}`,
                  )
                  if (done) setPicking(null)
                }}
              />
            )}
          </CardContent>

          {canEdit && sectionIndex === assessment.sections.length - 1 && (
            <div className="border-t border-line p-3">
              <AddSection
                assessmentId={assessment.id}
                nextTitle={`Section ${String.fromCharCode(65 + assessment.sections.length)}`}
                busy={busy}
                onSubmit={(body) =>
                  run(() => send('/api/v1/assessments/sections', 'POST', body), 'Section added')
                }
              />
            </div>
          )}
        </Card>
      ))}

      {assessment.sections.length === 0 && (
        <Card>
          <EmptyState title="No sections" description="Add a section to begin placing questions." />
        </Card>
      )}
    </div>
  )
}

function AddSection({
  assessmentId,
  nextTitle,
  busy,
  onSubmit,
}: {
  assessmentId: string
  nextTitle: string
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>
}) {
  const [title, setTitle] = React.useState(nextTitle)
  const [instructions, setInstructions] = React.useState('')

  React.useEffect(() => setTitle(nextTitle), [nextTitle])

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!title.trim()) return
        await onSubmit({
          assessmentId,
          title: title.trim(),
          instructions: instructions.trim() || undefined,
        })
        setInstructions('')
      }}
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Section title"
        className="sm:w-40"
      />
      <Input
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Instructions for this section, if any"
        aria-label="Section instructions"
        className="flex-1"
      />
      <Button type="submit" variant="secondary" disabled={busy || !title.trim()}>
        <Plus /> Add section
      </Button>
    </form>
  )
}

/**
 * Picking from the bank.
 *
 * Filtered to the paper's own class-subject server-side, so this cannot reach
 * another subject's questions however it is driven. Questions already in the
 * paper are shown as such rather than hidden — a teacher deliberately repeating
 * one across sections is rare but legitimate, and silently dropping it from the
 * list looks like a bug.
 */
function QuestionPicker({
  classSubjectId,
  alreadyPlaced,
  onPlace,
  onClose,
}: {
  classSubjectId: string
  alreadyPlaced: (string | null)[]
  onPlace: (questionIds: string[]) => void
  onClose: () => void
}) {
  const [questions, setQuestions] = React.useState<BankQuestion[] | null>(null)
  const [selected, setSelected] = React.useState<string[]>([])
  const [type, setType] = React.useState('')
  const [difficulty, setDifficulty] = React.useState('')

  React.useEffect(() => {
    const params = new URLSearchParams({
      classSubjectId,
      status: 'APPROVED',
      pageSize: '50',
    })
    if (type) params.set('type', type)
    if (difficulty) params.set('difficulty', difficulty)

    let cancelled = false
    setQuestions(null)
    fetch(`/api/v1/questions?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setQuestions(body?.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setQuestions([])
      })
    return () => {
      cancelled = true
    }
  }, [classSubjectId, type, difficulty])

  const placed = new Set(alreadyPlaced.filter(Boolean) as string[])

  return (
    <div className="mt-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={type}
          onChange={(event) => setType(event.target.value)}
          aria-label="Filter by type"
          className="sm:w-48"
        >
          <option value="">All types</option>
          {QUESTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {QUESTION_TYPE_LABEL[value]}
            </option>
          ))}
        </Select>

        <Select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
          aria-label="Filter by difficulty"
          className="sm:w-40"
        >
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((level) => (
            <option key={level} value={level}>
              {level.charAt(0) + level.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => onPlace(selected)}
            type="button"
          >
            Add {selected.length > 0 ? selected.length : ''}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto">
        {questions === null ? (
          <p className="text-sm text-ink-subtle">Loading the bank…</p>
        ) : questions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No approved questions match. Add some to the bank first.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {questions.map((question) => {
              const on = selected.includes(question.id)
              return (
                <li key={question.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((prev) =>
                        on ? prev.filter((id) => id !== question.id) : [...prev, question.id],
                      )
                    }
                    className={
                      on
                        ? 'w-full rounded-[var(--radius-sm)] border border-[var(--brand-500)] bg-[var(--brand-50)] p-2.5 text-left'
                        : 'w-full rounded-[var(--radius-sm)] border border-line bg-surface p-2.5 text-left hover:bg-surface-2'
                    }
                  >
                    <p className="text-sm text-ink">{question.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                      <span>{QUESTION_TYPE_LABEL[question.type as QuestionTypeKey]}</span>
                      <span className="tnum">{question.marks} marks</span>
                      <span>{question.difficulty.toLowerCase()}</span>
                      {placed.has(question.id) && <Badge tone="info">already in this paper</Badge>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
