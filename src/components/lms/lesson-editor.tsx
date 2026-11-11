'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { CODE_LANGUAGES, LMS_LESSON_KINDS, type Quiz, type QuizQuestion } from '@/lib/lms/options'
import { documentEmbedUrl, videoEmbedUrl, videoFileUrl } from '@/lib/lms/media'
import { cn } from '@/lib/utils'
import { KindIcon, fillPath } from './kind-icon'
import { LessonText } from './lesson-text'
import type { EditableLesson, LmsResult } from './types'

const newId = () => Math.random().toString(36).slice(2, 10)

function blankQuestion(): QuizQuestion {
  return {
    id: newId(),
    prompt: '',
    multiple: false,
    options: [
      { id: newId(), text: '', correct: true },
      { id: newId(), text: '', correct: false },
    ],
    explanation: '',
  }
}

export function LessonEditor({
  lesson,
  courseId,
  moduleId,
  createLesson,
  updateLesson,
  lessonPath,
  backHref,
  previewPath,
}: {
  /** Lesson preview route, `:course` and `:lesson`. */
  previewPath?: string
  lesson: EditableLesson
  courseId: string
  /** Required when adding a new lesson. */
  moduleId?: string
  createLesson: (moduleId: string, input: unknown) => Promise<LmsResult>
  updateLesson: (id: string, input: unknown) => Promise<LmsResult>
  /** Lesson editor route, `:course` and `:lesson`. */
  lessonPath: string
  backHref: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState({
    title: lesson.title,
    kind: lesson.kind,
    durationMinutes: lesson.durationMinutes ? String(lesson.durationMinutes) : '',
    videoUrl: lesson.videoUrl ?? '',
    body: lesson.body ?? '',
    documentUrl: lesson.documentUrl ?? '',
    codeLanguage: lesson.codeLanguage ?? 'python',
    code: lesson.code ?? '',
    passPercent: String(lesson.passPercent),
  })
  const [questions, setQuestions] = React.useState<QuizQuestion[]>(
    () => (lesson.quiz as Quiz | null)?.questions ?? [blankQuestion()],
  )
  const [showPreview, setShowPreview] = React.useState(false)
  const hasDraft = lesson.draftContent != null
  const [contentJson, setContentJson] = React.useState(() => {
    const source = lesson.draftContent ?? lesson.content
    return source ? JSON.stringify(source, null, 2) : ''
  })
  const contentDirty = React.useRef(false)
  const contentError = React.useMemo(() => {
    if (form.kind !== 'INTERACTIVE' || !contentJson.trim()) return null
    try {
      JSON.parse(contentJson)
      return null
    } catch (err) {
      return (err as Error).message
    }
  }, [contentJson, form.kind])
  const quizKind = form.kind === 'QUIZ' || form.kind === 'INTERACTIVE'

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const updateQuestion = (qi: number, patch: Partial<QuizQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)))

  function toggleCorrect(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qi) return q
        return {
          ...q,
          options: q.options.map((o, j) =>
            q.multiple ? (j === oi ? { ...o, correct: !o.correct } : o) : { ...o, correct: j === oi },
          ),
        }
      }),
    )
  }

  function save(andNew: boolean, publish = false) {
    const interactiveQuiz = form.kind === 'INTERACTIVE' && questions.some((q) => q.prompt.trim())
    const payload = {
      ...form,
      quiz:
        form.kind === 'QUIZ' || interactiveQuiz
          ? {
              questions: questions
                .filter((q) => form.kind === 'QUIZ' || q.prompt.trim())
                .map((q) => ({
                  ...q,
                  explanation: q.explanation || undefined,
                  hint: q.hint || undefined,
                  options: q.options.map((o) => ({ ...o, text: o.text, feedback: o.feedback || undefined })),
                })),
            }
          : undefined,
      ...(form.kind === 'INTERACTIVE' && (contentDirty.current || publish || !lesson.id) ? { content: contentJson, publish } : {}),
    }
    startTransition(async () => {
      const result = lesson.id ? await updateLesson(lesson.id, payload) : await createLesson(moduleId!, payload)
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (!result.ok) return
      if (andNew && moduleId) {
        router.push(fillPath(lessonPath, { course: courseId, lesson: 'new' }) + `?module=${moduleId}&t=${Date.now()}`)
      } else {
        router.push(backHref)
      }
      router.refresh()
    })
  }

  const embed = form.kind === 'VIDEO' ? videoEmbedUrl(form.videoUrl) : null
  const videoFile = form.kind === 'VIDEO' && !embed ? videoFileUrl(form.videoUrl) : null
  const docEmbed = form.kind === 'DOCUMENT' ? documentEmbedUrl(form.documentUrl) : null

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <Field label="Lesson type">
            <div className="flex flex-wrap gap-2">
              {LMS_LESSON_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k.value }))}
                  aria-pressed={form.kind === k.value}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 h-9 text-sm transition-colors',
                    form.kind === k.value
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)] font-medium'
                      : 'border-line-strong text-ink-muted hover:bg-surface-2',
                  )}
                >
                  <KindIcon kind={k.value} />
                  {k.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field label="Title" required htmlFor="l-title">
              <Input id="l-title" value={form.title} onChange={set('title')} placeholder="How an IR sensor sees a line" />
            </Field>
            <Field label="Length (minutes)" htmlFor="l-min">
              <Input id="l-min" type="number" min={1} max={600} value={form.durationMinutes} onChange={set('durationMinutes')} />
            </Field>
          </div>

          {form.kind === 'VIDEO' ? (
            <Field
              label="YouTube or Vimeo link"
              required
              htmlFor="l-video"
              hint="Unlisted YouTube videos work well: students can watch, but the video is not searchable. A direct link to an .mp4 file also works."
              error={form.videoUrl && !embed && !videoFile ? 'This does not look like a YouTube, Vimeo or .mp4 link' : undefined}
            >
              <Input id="l-video" value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://youtu.be/…" />
            </Field>
          ) : null}
          {embed ? (
            <div className="aspect-video max-w-2xl overflow-hidden rounded-[var(--radius)] border border-line bg-black">
              <iframe src={embed} title="Video preview" className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          ) : null}
          {videoFile ? (
            <div className="aspect-video max-w-2xl overflow-hidden rounded-[var(--radius)] border border-line bg-black">
              <video src={videoFile} title="Video preview" className="size-full" controls playsInline preload="metadata" />
            </div>
          ) : null}

          {form.kind === 'DOCUMENT' ? (
            <Field label="Link to the PDF, Google Drive file or slides" required htmlFor="l-doc" hint={docEmbed ? 'Shown inside the lesson' : 'Students open it in a new tab'}>
              <Input id="l-doc" value={form.documentUrl} onChange={set('documentUrl')} placeholder="https://drive.google.com/file/d/…" />
            </Field>
          ) : null}

          {form.kind === 'CODE' ? (
            <>
              <Field label="Language" htmlFor="l-lang" className="max-w-56">
                <Select id="l-lang" value={form.codeLanguage} onChange={set('codeLanguage')}>
                  {CODE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Code" required htmlFor="l-code">
                <Textarea id="l-code" rows={14} value={form.code} onChange={set('code')} className="font-mono text-sm" spellCheck={false} />
              </Field>
            </>
          ) : null}

          {form.kind === 'INTERACTIVE' ? (
            <div className="space-y-2">
              {hasDraft ? (
                <Notice tone="warning" title="Unpublished changes">
                  Students still see the published version (v{lesson.contentVersion ?? 1}). Preview the lesson, then publish when it is ready.
                </Notice>
              ) : null}
              {previewPath && lesson.id ? (
                <div className="flex flex-wrap gap-3 text-sm">
                  <a className="text-[var(--brand-600)] hover:underline" href={fillPath(previewPath, { course: courseId, lesson: lesson.id })} target="_blank" rel="noreferrer">
                    Preview published version
                  </a>
                  {hasDraft ? (
                    <a className="text-[var(--brand-600)] hover:underline" href={`${fillPath(previewPath, { course: courseId, lesson: lesson.id })}?draft=1`} target="_blank" rel="noreferrer">
                      Preview saved draft
                    </a>
                  ) : null}
                </div>
              ) : null}
              <Field
                label="Interactive content (JSON)"
                required
                htmlFor="l-content"
                hint="Intro, objectives, video, activity blocks, summary. Saving keeps it as a draft; students only see it after you publish."
                error={contentError ? `Not valid JSON: ${contentError}` : undefined}
              >
                <Textarea
                  id="l-content"
                  rows={18}
                  value={contentJson}
                  onChange={(e) => {
                    contentDirty.current = true
                    setContentJson(e.target.value)
                  }}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}

          {form.kind !== 'QUIZ' && form.kind !== 'INTERACTIVE' ? (
            <Field
              label={form.kind === 'PROJECT' ? 'Project brief' : form.kind === 'TEXT' ? 'Lesson' : 'Notes for students'}
              required={form.kind === 'TEXT' || form.kind === 'PROJECT'}
              htmlFor="l-body"
              hint="# Heading, - list item, 1. numbered, **bold**, `code`, ``` for a code block. Links become clickable."
            >
              <Textarea id="l-body" rows={form.kind === 'TEXT' || form.kind === 'PROJECT' ? 14 : 5} value={form.body} onChange={set('body')} />
            </Field>
          ) : null}
          {form.body && form.kind !== 'QUIZ' && form.kind !== 'INTERACTIVE' ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? 'Hide preview' : 'Preview text'}
              </Button>
              {showPreview ? (
                <div className="mt-2 rounded-[var(--radius)] border border-line p-4">
                  <LessonText text={form.body} />
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {quizKind ? (
        <Card>
          <CardHeader>
            <CardTitle>{form.kind === 'INTERACTIVE' ? 'Knowledge check (graded)' : 'Questions'}</CardTitle>
            <div className="flex items-center gap-2">
              <label htmlFor="l-pass" className="text-sm text-ink-muted">Pass mark %</label>
              <Input id="l-pass" type="number" min={0} max={100} value={form.passPercent} onChange={set('passPercent')} className="w-20" />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <Notice tone="info">Tick the right answer. Students see the answers and explanations only after they submit.</Notice>
            {questions.map((q, qi) => (
              <div key={q.id} className="space-y-2 border-b border-line pb-5 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-semibold text-ink-subtle w-6">{qi + 1}.</span>
                  <Textarea
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                    placeholder="Which sensor does a line-follower use to see the track?"
                    aria-label={`Question ${qi + 1}`}
                  />
                  <IconButton small label="Remove question" disabled={questions.length <= 1} onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}>
                    <Trash2 />
                  </IconButton>
                </div>
                <div className="pl-8 space-y-1.5">
                  {q.options.map((o, oi) => (
                    <div key={o.id} className="flex items-center gap-2">
                      {q.multiple ? (
                        <Checkbox checked={o.correct} onChange={() => toggleCorrect(qi, oi)} aria-label="Correct answer" />
                      ) : (
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={o.correct}
                          onChange={() => toggleCorrect(qi, oi)}
                          aria-label="Correct answer"
                          className="size-4 accent-[var(--brand-500)] cursor-pointer"
                        />
                      )}
                      <Input
                        value={o.text}
                        onChange={(e) =>
                          updateQuestion(qi, { options: q.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })
                        }
                        placeholder={`Option ${oi + 1}`}
                        className={cn(o.correct && 'border-[var(--success)]')}
                      />
                      <Input
                        value={o.feedback ?? ''}
                        onChange={(e) =>
                          updateQuestion(qi, { options: q.options.map((x, j) => (j === oi ? { ...x, feedback: e.target.value } : x)) })
                        }
                        placeholder="Feedback if chosen (optional)"
                        aria-label={`Feedback for option ${oi + 1}`}
                        className="hidden md:block"
                      />
                      <IconButton
                        small
                        label="Remove option"
                        disabled={q.options.length <= 2}
                        onClick={() => updateQuestion(qi, { options: q.options.filter((_, j) => j !== oi) })}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {q.options.length < 6 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateQuestion(qi, { options: [...q.options, { id: newId(), text: '', correct: false }] })}
                      >
                        <Plus /> Option
                      </Button>
                    ) : null}
                    <label className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
                      <Checkbox
                        checked={q.multiple}
                        onChange={(e) => {
                          const multiple = e.target.checked
                          let seen = false
                          updateQuestion(qi, {
                            multiple,
                            options: multiple
                              ? q.options
                              : q.options.map((o) => {
                                  const keep = o.correct && !seen
                                  if (o.correct) seen = true
                                  return { ...o, correct: keep }
                                }),
                          })
                        }}
                      />
                      More than one right answer
                    </label>
                  </div>
                  <Input
                    value={q.explanation ?? ''}
                    onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                    placeholder="Explanation shown after submitting (optional)"
                  />
                  <Input
                    value={q.hint ?? ''}
                    onChange={(e) => updateQuestion(qi, { hint: e.target.value })}
                    placeholder="Hint students can open before answering (optional)"
                  />
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])} disabled={questions.length >= 50}>
              <Plus /> Add question
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {form.kind === 'INTERACTIVE' && lesson.id ? (
          <>
            <Button loading={pending} disabled={!!contentError} onClick={() => save(false, true)}>Publish to students</Button>
            <Button variant="secondary" disabled={pending || !!contentError} onClick={() => save(false)}>Save draft</Button>
          </>
        ) : (
          <Button loading={pending} disabled={!!contentError} onClick={() => save(false)}>Save lesson</Button>
        )}
        {!lesson.id ? (
          <Button variant="secondary" disabled={pending} onClick={() => save(true)}>Save and add another</Button>
        ) : null}
        <Button variant="ghost" onClick={() => router.push(backHref)}>Cancel</Button>
      </div>
    </div>
  )
}
