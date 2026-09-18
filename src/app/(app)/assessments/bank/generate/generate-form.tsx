'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, FileStack, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type QuestionTypeKey,
} from '@/lib/questions'
import { cn } from '@/lib/utils'

type Subject = { id: string; label: string; hasSyllabus: boolean }
type Chapter = { id: string; name: string; code: string | null; topics: { id: string; name: string }[] }
type Textbook = {
  id: string
  classSubjectId: string
  board: string
  title: string
  pageCount: number
  status: 'PROCESSING' | 'READY' | 'FAILED'
}
type AssessmentType = { id: string; name: string; marks: number | null; minutes: number | null }

const COMMON_TYPES: QuestionTypeKey[] = [
  'MCQ',
  'TRUE_FALSE',
  'FILL_BLANK',
  'SHORT',
  'LONG',
  'NUMERICAL',
  'HOTS',
]

function errorCopy(code?: string, message?: string): { title: string; description: string } {
  switch (code) {
    case 'AI_PROVIDER_ERROR':
      return {
        title: 'Generation timed out',
        description: message ?? 'Try fewer textbook pages or fewer questions, then generate again.',
      }
    case 'AI_BAD_OUTPUT':
    case 'AI_NO_OUTPUT':
      return {
        title: 'Could not read the draft questions',
        description: message ?? 'Please try again with fewer questions.',
      }
    case 'AI_REFUSED':
      return {
        title: 'Generation declined',
        description: message ?? 'Narrow the chapters or reword your note, then try again.',
      }
    case 'NOTHING_USABLE':
      return {
        title: 'Nothing usable was kept',
        description: message ?? 'Try a different chapter, format, or smaller page range.',
      }
    case 'NO_SYLLABUS':
      return {
        title: 'Syllabus not ready',
        description: message ?? 'Publish the syllabus, or switch to an uploaded textbook.',
      }
    case 'EMPTY_PAGE_RANGE':
      return {
        title: 'No readable text on those pages',
        description: message ?? 'Choose a different page range from a searchable PDF.',
      }
    case 'SOURCE_TOO_LARGE':
      return {
        title: 'Page range too large',
        description: message ?? 'Select fewer pages and generate again.',
      }
    case 'RATE_LIMITED':
      return {
        title: 'Too many requests',
        description: 'Wait a moment, then try again.',
      }
    default:
      return {
        title: 'Nothing generated',
        description: message ?? 'Please try again.',
      }
  }
}

/**
 * The generation request.
 *
 * The chapter picker is the important control, not the count. A teacher who
 * generates "ten Science questions" gets ten questions about whatever the model
 * associates with Science; a teacher who picks chapters 1 to 3 gets ten
 * questions their class has actually been taught.
 */
export function GenerateForm({
  subjects,
  initialTextbooks,
  assessmentTypes,
  canCreatePaper,
  initialClassSubjectId,
  initialAssessmentTypeId,
  initialCount,
  initialTitle,
  initialTotalMarks,
  initialDurationMinutes,
  initialInstructions,
  initialEasyPct,
  initialMediumPct,
  initialHardPct,
  initialChapterIds,
  initialChapterWeights,
  initialCreatePaper,
}: {
  subjects: Subject[]
  initialTextbooks: Textbook[]
  assessmentTypes: AssessmentType[]
  canCreatePaper: boolean
  initialClassSubjectId?: string
  initialAssessmentTypeId?: string
  initialCount?: string
  initialTitle?: string
  initialTotalMarks?: string
  initialDurationMinutes?: string
  initialInstructions?: string
  initialEasyPct?: string
  initialMediumPct?: string
  initialHardPct?: string
  initialChapterIds?: string[]
  initialChapterWeights?: { chapterId: string; percent: number }[]
  initialCreatePaper?: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const abortRef = React.useRef<AbortController | null>(null)

  const defaultSubject =
    (initialClassSubjectId && subjects.some((s) => s.id === initialClassSubjectId)
      ? initialClassSubjectId
      : subjects[0]?.id) ?? ''

  const hasMix =
    initialEasyPct != null && initialMediumPct != null && initialHardPct != null

  const [classSubjectId, setClassSubjectId] = React.useState(defaultSubject)
  const [sourceMode, setSourceMode] = React.useState<'SYLLABUS' | 'TEXTBOOK'>(
    (subjects.find((s) => s.id === defaultSubject)?.hasSyllabus ?? subjects[0]?.hasSyllabus)
      ? 'SYLLABUS'
      : 'TEXTBOOK',
  )
  const [textbooks, setTextbooks] = React.useState(initialTextbooks)
  const [textbookId, setTextbookId] = React.useState('')
  const [pageStart, setPageStart] = React.useState('1')
  const [pageEnd, setPageEnd] = React.useState('5')
  const [bookTitle, setBookTitle] = React.useState('')
  const [board, setBoard] = React.useState('CBSE / NCERT')
  const [publisher, setPublisher] = React.useState('NCERT')
  const [bookFile, setBookFile] = React.useState<File | null>(null)
  const [rightsConfirmed, setRightsConfirmed] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [chapters, setChapters] = React.useState<Chapter[] | null>(null)
  const [chapterIds, setChapterIds] = React.useState<string[]>(initialChapterIds ?? [])
  const [count, setCount] = React.useState(
    initialCount && Number(initialCount) > 0 ? initialCount : '5',
  )
  const [types, setTypes] = React.useState<QuestionTypeKey[]>(['MCQ'])
  const [showAllTypes, setShowAllTypes] = React.useState(false)
  const [difficulty, setDifficulty] = React.useState('MEDIUM')
  const [useMix, setUseMix] = React.useState(Boolean(hasMix))
  const [easyPct, setEasyPct] = React.useState(initialEasyPct ?? '30')
  const [mediumPct, setMediumPct] = React.useState(initialMediumPct ?? '50')
  const [hardPct, setHardPct] = React.useState(initialHardPct ?? '20')
  const [marks, setMarks] = React.useState('1')
  const [note, setNote] = React.useState(initialInstructions ? '' : '')
  const [createPaper, setCreatePaper] = React.useState(
    Boolean(initialCreatePaper || initialAssessmentTypeId),
  )
  const [assessmentTypeId, setAssessmentTypeId] = React.useState(
    (initialAssessmentTypeId && assessmentTypes.some((t) => t.id === initialAssessmentTypeId)
      ? initialAssessmentTypeId
      : assessmentTypes[0]?.id) ?? '',
  )
  const [paperTitle, setPaperTitle] = React.useState(initialTitle ?? '')
  const [durationMinutes, setDurationMinutes] = React.useState(
    initialDurationMinutes ??
      String(
        (initialAssessmentTypeId
          ? assessmentTypes.find((t) => t.id === initialAssessmentTypeId)?.minutes
          : assessmentTypes[0]?.minutes) ?? 60,
      ),
  )
  const [paperTotalMarks, setPaperTotalMarks] = React.useState(initialTotalMarks ?? '')
  const [paperInstructions, setPaperInstructions] = React.useState(initialInstructions ?? '')
  const [chapterWeights] = React.useState(initialChapterWeights ?? [])
  const [running, setRunning] = React.useState(false)
  const [phase, setPhase] = React.useState<'idle' | 'preparing' | 'generating' | 'saving'>('idle')

  const availableTextbooks = textbooks.filter(
    (book) => book.classSubjectId === classSubjectId && book.status === 'READY',
  )
  const selectedTextbook = availableTextbooks.find((book) => book.id === textbookId)
  const typeOptions = showAllTypes ? QUESTION_TYPES : COMMON_TYPES

  React.useEffect(() => {
    if (!classSubjectId) return
    let cancelled = false
    setChapters(null)
    // Preserve wizard-preselected chapters on first load for this subject.
    setChapterIds((prev) =>
      initialClassSubjectId === classSubjectId && (initialChapterIds?.length ?? 0) > 0
        ? initialChapterIds!
        : prev.length && classSubjectId === defaultSubject
          ? prev
          : [],
    )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when subject changes
  }, [classSubjectId])

  React.useEffect(() => {
    if (sourceMode !== 'TEXTBOOK') return
    const first = textbooks.find(
      (book) => book.classSubjectId === classSubjectId && book.status === 'READY',
    )
    setTextbookId(first?.id ?? '')
    setPageStart('1')
    setPageEnd(String(Math.min(5, first?.pageCount ?? 5)))
  }, [classSubjectId, sourceMode, textbooks])

  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const topicCount = (chapters ?? [])
    .filter((chapter) => chapterIds.includes(chapter.id))
    .reduce((sum, chapter) => sum + chapter.topics.length, 0)
  const pageCountInScope =
    Number(pageEnd) >= Number(pageStart) ? Number(pageEnd) - Number(pageStart) + 1 : 0
  const pageRangeValid =
    Boolean(textbookId) &&
    Number(pageStart) >= 1 &&
    Number(pageEnd) >= Number(pageStart) &&
    Number(pageEnd) - Number(pageStart) <= 29 &&
    Number(pageEnd) <= (selectedTextbook?.pageCount ?? 0)
  const sourceReady =
    sourceMode === 'TEXTBOOK' ? pageRangeValid : chapterIds.length > 0 && topicCount > 0
  const canSubmit =
    sourceReady &&
    types.length > 0 &&
    Number(count) >= 1 &&
    (!createPaper ||
      (Boolean(assessmentTypeId) && paperTitle.trim().length >= 3 && Boolean(durationMinutes)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit || running) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 170_000)

    setRunning(true)
    setPhase('preparing')
    window.setTimeout(() => {
      if (!controller.signal.aborted) setPhase('generating')
    }, 600)

    try {
      const res = await fetch('/api/v1/questions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          classSubjectId,
          sourceMode,
          textbookId: sourceMode === 'TEXTBOOK' ? textbookId : undefined,
          pageStart: sourceMode === 'TEXTBOOK' ? Number(pageStart) : undefined,
          pageEnd: sourceMode === 'TEXTBOOK' ? Number(pageEnd) : undefined,
          chapterIds: sourceMode === 'SYLLABUS' ? chapterIds : [],
          chapterWeights:
            sourceMode === 'SYLLABUS' && chapterWeights.length > 0 ? chapterWeights : [],
          count: Number(count),
          types,
          difficulty,
          difficultyMix: useMix
            ? {
                easy: Number(easyPct),
                medium: Number(mediumPct),
                hard: Number(hardPct),
              }
            : undefined,
          marks: Number(marks),
          createPaper,
          assessmentTypeId: createPaper ? assessmentTypeId : undefined,
          paperTitle: createPaper ? paperTitle.trim() : undefined,
          paperTotalMarks:
            createPaper && paperTotalMarks ? Number(paperTotalMarks) : undefined,
          durationMinutes: createPaper ? Number(durationMinutes) : undefined,
          paperInstructions:
            createPaper && paperInstructions.trim() ? paperInstructions.trim() : undefined,
          note: note.trim() || undefined,
        }),
      })

      setPhase('saving')

      let body: {
        data?: {
          created: number
          duplicates: number
          rejected: number
          asked: number
          paperId?: string
        }
        error?: { message?: string; code?: string }
      } | null = null
      try {
        body = await res.json()
      } catch {
        const copy = errorCopy(
          res.status === 502 || res.status === 503 || res.status === 504
            ? 'AI_PROVIDER_ERROR'
            : undefined,
        )
        push({ tone: 'error', ...copy })
        return
      }

      if (!res.ok) {
        push({ tone: 'error', ...errorCopy(body?.error?.code, body?.error?.message) })
        return
      }

      const { created, duplicates, rejected, asked, paperId } = body!.data!
      const shortfall = asked - created
      push({
        tone: created < asked ? 'info' : 'success',
        title: paperId
          ? `Draft paper ready · ${created} of ${asked} questions`
          : `${created} of ${asked} draft${created === 1 ? '' : 's'} ready to review`,
        description:
          shortfall > 0
            ? `${shortfall} not kept (${duplicates} already in the bank, ${rejected} failed source checks). Widen the page range or lower the count for a fuller set.`
            : 'Review each draft before approving it for a paper.',
      })
      router.push(paperId ? `/assessments/${paperId}` : '/assessments/bank?status=DRAFT')
      router.refresh()
    } catch (error) {
      if (controller.signal.aborted) {
        push({
          tone: 'error',
          title: 'Generation cancelled',
          description: 'No questions were saved.',
        })
      } else {
        push({
          tone: 'error',
          title: 'Network error',
          description: 'Try fewer textbook pages or fewer questions, then generate again.',
        })
      }
      void error
    } finally {
      window.clearTimeout(timeout)
      setRunning(false)
      setPhase('idle')
    }
  }

  async function uploadBook() {
    if (!bookFile || !bookTitle.trim() || !board.trim() || !rightsConfirmed) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', bookFile)
      form.set('classSubjectId', classSubjectId)
      form.set('title', bookTitle.trim())
      form.set('board', board.trim())
      form.set('publisher', publisher.trim())
      form.set('rightsConfirmed', 'true')
      const response = await fetch('/api/v1/textbooks', { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) {
        push({
          tone: 'error',
          title: 'Textbook could not be added',
          description: body?.error?.message ?? 'Check the PDF and try again.',
        })
        return
      }
      const created: Textbook = {
        id: body.data.id,
        classSubjectId,
        board: board.trim(),
        title: body.data.title,
        pageCount: body.data.pageCount,
        status: body.data.status,
      }
      setTextbooks((current) => [created, ...current.filter((book) => book.id !== created.id)])
      setTextbookId(created.id)
      setPageStart('1')
      setPageEnd(String(Math.min(5, created.pageCount)))
      setBookTitle('')
      setBookFile(null)
      setRightsConfirmed(false)
      push({
        tone: 'success',
        title: 'Textbook ready',
        description: `${created.pageCount} pages extracted. You can ground questions in this book.`,
      })
    } catch {
      push({ tone: 'error', title: 'Upload failed', description: 'Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="relative flex flex-col gap-4" onSubmit={submit}>
      {running ? (
        <div
          className="rounded-[var(--radius-lg)] border border-[var(--brand-100)] bg-[var(--brand-50)] px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--brand-600)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {phase === 'preparing'
                  ? 'Preparing source…'
                  : phase === 'saving'
                    ? 'Saving drafts…'
                    : 'Generating questions…'}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                This usually takes 20–90 seconds. Stay on this page until drafts appear for review.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-6 place-items-center rounded-[var(--radius-sm)] bg-[var(--brand-50)] text-xs font-semibold text-[var(--brand-600)]">
              1
            </span>
            Source
          </CardTitle>
          <span className="text-xs text-ink-subtle">What the AI is allowed to use</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class and subject" required>
              <Select
                value={classSubjectId}
                onChange={(event) => {
                  const id = event.target.value
                  setClassSubjectId(id)
                  setSourceMode(
                    subjects.find((item) => item.id === id)?.hasSyllabus ? 'SYLLABUS' : 'TEXTBOOK',
                  )
                }}
                required
                disabled={running}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Question source" required>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => setSourceMode('TEXTBOOK')}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors',
                    sourceMode === 'TEXTBOOK'
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-ink'
                      : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-2',
                  )}
                >
                  <BookOpen className="size-4 shrink-0" aria-hidden />
                  Textbook pages
                </button>
                <button
                  type="button"
                  disabled={
                    running || !subjects.find((item) => item.id === classSubjectId)?.hasSyllabus
                  }
                  onClick={() => setSourceMode('SYLLABUS')}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
                    sourceMode === 'SYLLABUS'
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-ink'
                      : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-2',
                  )}
                >
                  <FileStack className="size-4 shrink-0" aria-hidden />
                  Published syllabus
                </button>
              </div>
            </Field>
          </div>

          {sourceMode === 'TEXTBOOK' ? (
            <div className="space-y-4 rounded-[var(--radius)] border border-line bg-surface-2/60 p-4">
              {availableTextbooks.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]">
                  <Field label="Textbook" required>
                    <Select
                      value={textbookId}
                      disabled={running}
                      onChange={(event) => {
                        const id = event.target.value
                        const book = availableTextbooks.find((item) => item.id === id)
                        setTextbookId(id)
                        setPageStart('1')
                        setPageEnd(String(Math.min(5, book?.pageCount ?? 5)))
                      }}
                    >
                      {availableTextbooks.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.board} · {book.title} ({book.pageCount} pages)
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="From page" required>
                    <Input
                      type="number"
                      min="1"
                      max={selectedTextbook?.pageCount}
                      value={pageStart}
                      disabled={running}
                      onChange={(event) => setPageStart(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="To page"
                    required
                    hint="Start with 3–5 pages for reliable results"
                  >
                    <Input
                      type="number"
                      min={pageStart || '1'}
                      max={selectedTextbook?.pageCount}
                      value={pageEnd}
                      disabled={running}
                      onChange={(event) => setPageEnd(event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No textbook is ready for this class and subject. Upload a searchable PDF below.
                </p>
              )}

              <div className="border-t border-line pt-4">
                <p className="text-sm font-medium text-ink">Upload a textbook PDF</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Prefer a searchable PDF. Image-only scans need OCR before upload.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Board or module" required>
                    <Input
                      value={board}
                      disabled={running}
                      onChange={(event) => setBoard(event.target.value)}
                      placeholder="CBSE / NCERT, ICSE, HSC…"
                    />
                  </Field>
                  <Field label="Publisher">
                    <Input
                      value={publisher}
                      disabled={running}
                      onChange={(event) => setPublisher(event.target.value)}
                      placeholder="NCERT"
                    />
                  </Field>
                  <Field label="Book title" required>
                    <Input
                      value={bookTitle}
                      disabled={running}
                      onChange={(event) => setBookTitle(event.target.value)}
                      placeholder="Physics Part I"
                    />
                  </Field>
                  <Field label="PDF file" required>
                    <Input
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={running}
                      onChange={(event) => setBookFile(event.target.files?.[0] ?? null)}
                    />
                  </Field>
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
                  <Checkbox
                    checked={rightsConfirmed}
                    disabled={running}
                    onChange={(event) => setRightsConfirmed(event.target.checked)}
                  />
                  <span>
                    I confirm the school may use this book for internal teaching and assessment.
                  </span>
                </label>
                <Button
                  className="mt-3"
                  type="button"
                  variant="secondary"
                  loading={uploading}
                  disabled={
                    running || !bookFile || !bookTitle.trim() || !board.trim() || !rightsConfirmed
                  }
                  onClick={uploadBook}
                >
                  {uploading ? 'Extracting textbook…' : 'Upload and extract'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Chapters in scope</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    Questions are limited to these chapters. Off-syllabus drafts are discarded.
                  </p>
                </div>
                {chapters && chapters.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={running}
                    onClick={() =>
                      setChapterIds(
                        chapterIds.length === chapters.length
                          ? []
                          : chapters.map((chapter) => chapter.id),
                      )
                    }
                  >
                    {chapterIds.length === chapters.length ? 'Clear all' : 'Select all'}
                  </Button>
                ) : null}
              </div>

              {chapters === null ? (
                <p className="mt-3 text-sm text-ink-subtle">Loading syllabus…</p>
              ) : chapters.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">This syllabus has no chapters yet.</p>
              ) : (
                <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-[var(--radius)] border border-line p-3">
                  {chapters.map((chapter) => (
                    <label
                      key={chapter.id}
                      className="flex items-start gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-sm text-ink hover:bg-surface-2"
                    >
                      <Checkbox
                        checked={chapterIds.includes(chapter.id)}
                        disabled={running}
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-6 place-items-center rounded-[var(--radius-sm)] bg-[var(--brand-50)] text-xs font-semibold text-[var(--brand-600)]">
              2
            </span>
            Blueprint
          </CardTitle>
          <span className="text-xs text-ink-subtle">Formats, difficulty and count</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Question formats</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {typeOptions.map((type) => {
                const on = types.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    disabled={running}
                    onClick={() =>
                      setTypes((prev) =>
                        on ? prev.filter((value) => value !== type) : [...prev, type],
                      )
                    }
                    className={cn(
                      'rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-transparent bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                        : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-2',
                    )}
                  >
                    {QUESTION_TYPE_LABEL[type]}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[var(--brand-600)] hover:underline"
              disabled={running}
              onClick={() => setShowAllTypes((value) => !value)}
            >
              {showAllTypes ? 'Show common formats' : 'Show all formats'}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="How many"
              required
              hint={
                sourceMode === 'TEXTBOOK' && pageRangeValid && Number(count) > pageCountInScope * 2
                  ? `With ${pageCountInScope} pages, aim for about ${Math.max(5, pageCountInScope * 2)} questions`
                  : 'Up to 15 per run'
              }
            >
              <Input
                type="number"
                min="1"
                max="15"
                value={count}
                disabled={running}
                onChange={(event) => setCount(event.target.value)}
                required
              />
            </Field>
            <Field label="Difficulty">
              <Select
                value={difficulty}
                disabled={running || useMix}
                onChange={(event) => setDifficulty(event.target.value)}
              >
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
                disabled={running}
                onChange={(event) => setMarks(event.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={useMix}
              disabled={running}
              onChange={(event) => setUseMix(event.target.checked)}
            />
            Use difficulty mix (easy / medium / hard %)
          </label>
          {useMix ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Easy %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={easyPct}
                  disabled={running}
                  onChange={(e) => setEasyPct(e.target.value)}
                />
              </Field>
              <Field label="Medium %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={mediumPct}
                  disabled={running}
                  onChange={(e) => setMediumPct(e.target.value)}
                />
              </Field>
              <Field label="Hard %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={hardPct}
                  disabled={running}
                  onChange={(e) => setHardPct(e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <Field label="Teacher note" hint="Optional guidance for the model">
            <Textarea
              value={note}
              disabled={running}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Keep numericals to two steps. Avoid diagram questions."
            />
          </Field>
        </CardContent>
      </Card>

      {canCreatePaper ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="grid size-6 place-items-center rounded-[var(--radius-sm)] bg-[var(--brand-50)] text-xs font-semibold text-[var(--brand-600)]">
                3
              </span>
              Draft paper
            </CardTitle>
            <span className="text-xs text-ink-subtle">Optional</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={createPaper}
                disabled={running}
                onChange={(event) => setCreatePaper(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-ink">
                  Also create a draft question paper
                </span>
                <span className="block text-xs text-ink-subtle">
                  Questions are placed automatically. Review and approve before use.
                </span>
              </span>
            </label>

            {createPaper ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Kind of test" required>
                  <Select
                    value={assessmentTypeId}
                    disabled={running}
                    onChange={(event) => {
                      const id = event.target.value
                      const type = assessmentTypes.find((item) => item.id === id)
                      setAssessmentTypeId(id)
                      if (type?.minutes) setDurationMinutes(String(type.minutes))
                      if (!paperTitle.trim() && type) setPaperTitle(type.name)
                    }}
                  >
                    {assessmentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Paper title" required>
                  <Input
                    value={paperTitle}
                    disabled={running}
                    onChange={(event) => setPaperTitle(event.target.value)}
                    placeholder="Mid-Term Examination 2026"
                  />
                </Field>
                <Field label="Time allowed (minutes)" required>
                  <Input
                    type="number"
                    min="5"
                    max="360"
                    value={durationMinutes}
                    disabled={running}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                  />
                </Field>
                <p className="text-xs text-ink-subtle sm:col-span-3">
                  Maximum marks will be {Number(count || 0) * Number(marks || 0)} if every requested
                  question passes source checks.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-surface/95 px-3 py-2.5 backdrop-blur">
        <Button type="submit" loading={running} disabled={!canSubmit || running}>
          <Sparkles className="size-4" aria-hidden />
          {running
            ? 'Generating…'
            : createPaper
              ? 'Generate draft paper'
              : `Generate ${count || 0} questions`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={running}
          onClick={() => router.push('/assessments/bank')}
        >
          Cancel
        </Button>
        {sourceMode === 'SYLLABUS' && chapterIds.length > 0 ? (
          <span className="text-xs text-ink-subtle tnum">{topicCount} topics in scope</span>
        ) : null}
        {sourceMode === 'TEXTBOOK' && pageRangeValid ? (
          <span className="text-xs text-ink-subtle tnum">
            {pageCountInScope} textbook page{pageCountInScope === 1 ? '' : 's'} in scope
          </span>
        ) : null}
      </div>
    </form>
  )
}
