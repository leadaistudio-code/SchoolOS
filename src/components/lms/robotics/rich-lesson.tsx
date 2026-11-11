'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  GraduationCap,
  Lightbulb,
  Loader2,
  NotebookPen,
  PartyPopper,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { RichBlock, RichContent, RichVideo } from '@/lib/lms/rich'
import { cn } from '@/lib/utils'
import { LessonText } from '../lesson-text'
import { QuizRunner } from '../lesson-player'
import { ProjectPanel, type ProjectInput, type ProjectSubmissionView, type UploadProjectFile } from '../project-panel'
import type { LmsResult, PlayerLesson, QuizActionResult } from '../types'
import {
  ChecklistActivity,
  MatchActivity,
  MissionsActivity,
  QuickCheck,
  ResourcesBlock,
  SequenceActivity,
  SortActivity,
  StepsBlock,
  TruthTableActivity,
  WiringActivity,
} from './activities'
import { Diagram } from './diagrams'
import { CodeLab, CodeView, IrSimulator, KitExplorer, MotorLab } from './labs'
import { LessonStateProvider, useLessonState, type SaveState } from './lesson-state'
import { LineSimulator, type SimRecord } from './line-sim'
import { LessonVideo } from './video-player'

const STAGES: Record<NonNullable<RichContent['stage']>, string> = {
  watch: 'Watch',
  understand: 'Understand',
  experiment: 'Experiment',
  practise: 'Practise',
  build: 'Build',
  test: 'Test',
  improve: 'Improve',
  demonstrate: 'Demonstrate',
}

export type RichLessonProps = {
  lesson: PlayerLesson
  content: RichContent
  /** Already filtered: learners only receive ready media. */
  video: RichVideo | null
  videoIsDraft?: boolean
  saved: { state: Record<string, unknown>; videoSeconds: number; bestScorePercent: number | null }
  completed: boolean
  markDone?: () => Promise<LmsResult & { courseComplete?: boolean }>
  submitQuiz: (answers: Record<string, string[]>) => Promise<QuizActionResult>
  saveState?: SaveState
  project?: ProjectSubmissionView | null
  submitProject?: (input: ProjectInput) => Promise<LmsResult>
  uploadProjectFile?: UploadProjectFile
  nextHref: string | null
  finishHref: string
  preview?: boolean
  resources?: { title: string; href: string; note?: string }[]
  /** Rendered in the right-hand column on wide screens, below the lesson on narrow ones. */
  aside?: React.ReactNode
}

export function RichLesson(props: RichLessonProps) {
  return (
    <LessonStateProvider lessonId={props.lesson.id} initial={props.saved.state} save={props.preview ? undefined : props.saveState}>
      <RichLessonBody {...props} />
    </LessonStateProvider>
  )
}

function RichLessonBody({
  lesson,
  content,
  video,
  videoIsDraft,
  saved,
  completed,
  markDone,
  submitQuiz,
  project,
  submitProject,
  uploadProjectFile,
  nextHref,
  finishHref,
  preview,
  resources,
  aside,
}: RichLessonProps) {
  const router = useRouter()
  const { push } = useToast()
  const { state } = useLessonState()
  const [pending, startTransition] = React.useTransition()
  const [done, setDone] = React.useState(completed)
  const [courseDone, setCourseDone] = React.useState(false)
  const hasQuiz = lesson.quiz.length > 0
  const activities = content.blocks.filter((b) => 'id' in b && b.type !== 'checklist')
  const finished = activities.filter((b) => (state[`a:${(b as { id: string }).id}`] as { done?: boolean } | undefined)?.done).length
  const sims = Object.entries(state).filter(([k]) => k.startsWith('sim:') && !k.endsWith(':tutorial'))
  const virtualReady = ['s-curve', 'sharp'].every((t) => sims.some(([, v]) => (v as SimRecord)?.finished?.[t]))

  function complete() {
    if (!markDone) return
    startTransition(async () => {
      const result = await markDone()
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (!result.ok) return
      setDone(true)
      if (result.courseComplete) setCourseDone(true)
      else if (nextHref) router.push(nextHref)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <article className="min-w-0 space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {content.stage ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 font-semibold uppercase tracking-wide text-white">
                <Sparkles className="size-3" aria-hidden /> {STAGES[content.stage]}
              </span>
            ) : null}
            {lesson.durationMinutes ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
                <Clock className="size-3" aria-hidden /> About {lesson.durationMinutes} min
              </span>
            ) : null}
            {done ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 font-medium text-success">
                <CheckCircle2 className="size-3" aria-hidden /> Completed
              </span>
            ) : null}
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
              <Target className="size-3.5" aria-hidden /> In this lesson you will
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {content.objectives.map((o) => (
                <li key={o} className="flex gap-2 text-sm text-ink">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </header>

        {video ? <LessonVideo video={video} resumeAt={saved.videoSeconds} draft={videoIsDraft} /> : null}

        <LessonText text={content.intro} className="max-w-3xl text-[15px]" />

        {content.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}

        {lesson.kind === 'PROJECT' ? (
          submitProject && !preview ? (
            <>
              {lesson.body ? <LessonText text={lesson.body} className="max-w-3xl" /> : null}
              <ProjectPanel submission={project ?? null} submit={submitProject} upload={uploadProjectFile} capstone virtualReady={virtualReady} />
            </>
          ) : (
            <>
              {lesson.body ? <LessonText text={lesson.body} className="max-w-3xl" /> : null}
              <Notice tone="info" title="Final challenge">
                Students hand in photos, code and a video link, a teacher-verified run, or their simulator results. A teacher approves it under Project reviews, which completes the lesson.
              </Notice>
            </>
          )
        ) : null}

        {hasQuiz ? (
          <section aria-labelledby={`kc-${lesson.id}`} className="rounded-[var(--radius-lg)] border-2 border-ink p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">{lesson.kind === 'QUIZ' ? 'Final assessment' : 'Knowledge check'}</p>
            <h2 id={`kc-${lesson.id}`} className="mt-0.5 text-lg font-semibold text-ink">
              {lesson.kind === 'QUIZ' ? 'Show what you know' : 'Check your understanding'}
            </h2>
            <p className="mb-3 mt-1 text-sm text-ink-muted">Pass with {lesson.passPercent}% to complete this lesson. You can try as many times as you like; your best score counts.</p>
            <QuizRunner
              key={lesson.id}
              lesson={lesson}
              bestScore={saved.bestScorePercent}
              submitQuiz={submitQuiz}
              preview={preview}
              onPassed={(courseComplete) => {
                setDone(true)
                if (courseComplete) setCourseDone(true)
                router.refresh()
              }}
            />
          </section>
        ) : null}

        <section className="rounded-[var(--radius-lg)] bg-[#0b0b0d] p-5 text-white" aria-label="Lesson summary">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
            <BookOpen className="size-3.5" aria-hidden /> What you learned
          </p>
          <ul className="mt-2 space-y-1.5">
            {content.summary.map((s) => (
              <li key={s} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f0a63c]" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
          {content.next ? (
            <p className="mt-4 border-t border-white/15 pt-3 text-sm text-white/80">
              {/^next\b/i.test(content.next) ? null : <span className="font-semibold text-white">Next: </span>}
              {content.next}
            </p>
          ) : null}
        </section>

        {courseDone ? (
          <Notice tone="success" title="Course complete">
            <p className="flex items-center gap-2">
              <PartyPopper className="size-4" aria-hidden /> You finished Robotics 101. Your certificate is ready on the course page.
            </p>
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!hasQuiz && lesson.kind !== 'PROJECT' && !preview ? (
            done ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Done
              </span>
            ) : (
              <Button loading={pending} onClick={complete}>
                <Check /> Mark as done{nextHref ? ' and continue' : ''}
              </Button>
            )
          ) : null}
          {nextHref ? (
            <Link href={nextHref} className={buttonVariants({ variant: done || preview ? 'primary' : 'ghost' })}>
              Next lesson <ArrowRight />
            </Link>
          ) : done || preview ? (
            <Link href={finishHref} className={buttonVariants({ variant: 'secondary' })}>
              Back to the course
            </Link>
          ) : null}
        </div>
      </article>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Notes and resources">
        <LessonProgressCard activities={activities.length} finished={finished} preview={preview} />
        <NotesCard />
        {resources?.length ? (
          <div className="rounded-[var(--radius-lg)] border border-line p-4">
            <p className="text-sm font-semibold text-ink">Downloads</p>
            <ul className="mt-2 space-y-1.5">
              {resources.map((r) => (
                <li key={r.href}>
                  <a href={r.href} download className="text-sm text-[var(--brand-600)] underline-offset-4 hover:underline">
                    {r.title}
                  </a>
                  {r.note ? <span className="block text-xs text-ink-subtle">{r.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {aside}
      </aside>
    </div>
  )
}

function LessonProgressCard({ activities, finished, preview }: { activities: number; finished: number; preview?: boolean }) {
  const { status } = useLessonState()
  return (
    <div className="rounded-[var(--radius-lg)] border border-line p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <GraduationCap className="size-4" aria-hidden /> This lesson
      </p>
      {activities ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={activities} aria-valuenow={finished} aria-label="Activities completed">
            <div className="h-full rounded-full bg-[var(--success)] transition-[width]" style={{ width: `${(finished / activities) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {finished} of {activities} activities done
          </p>
        </>
      ) : null}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle" role="status">
        {preview ? (
          'Preview: nothing is saved'
        ) : status === 'saving' ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
          </>
        ) : status === 'offline' ? (
          <>
            <CloudOff className="size-3" aria-hidden /> Offline: saved on this device, will retry
          </>
        ) : status === 'saved' ? (
          <>
            <Check className="size-3" aria-hidden /> All work saved
          </>
        ) : (
          'Your work saves automatically'
        )}
      </p>
    </div>
  )
}

function NotesCard() {
  const { get, set, readOnly } = useLessonState()
  const [value, setValue] = React.useState(() => get<string>('notes', ''))
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <div className="rounded-[var(--radius-lg)] border border-line p-4">
      <label htmlFor="lesson-notes" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <NotebookPen className="size-4" aria-hidden /> My notes
      </label>
      <textarea
        id="lesson-notes"
        rows={6}
        maxLength={4000}
        value={value}
        placeholder="Write what you learned, questions to ask, or your sensor readings."
        onChange={(e) => {
          const v = e.target.value
          setValue(v)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => set('notes', v), 700)
        }}
        className="mt-2 w-full resize-y rounded-[var(--radius)] border border-line bg-surface p-2 text-sm text-ink"
      />
      {readOnly ? <p className="text-xs text-ink-subtle">Preview: notes are not saved.</p> : null}
    </div>
  )
}

/* -------------------------------------------------------------- blocks */

const CALLOUT: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  tip: { icon: Lightbulb, className: 'border-[#f0a63c] bg-[#fdf3e3]', label: 'Tip' },
  safety: { icon: ShieldAlert, className: 'border-[var(--danger)] bg-danger-bg', label: 'Safety' },
  word: { icon: BookOpen, className: 'border-[#2f5fb3] bg-[#e8f0fb]', label: 'New words' },
  life: { icon: Sparkles, className: 'border-[#2e9e6a] bg-success-bg', label: 'Real world' },
  teacher: { icon: GraduationCap, className: 'border-line bg-surface-2', label: 'For the teacher' },
  mistake: { icon: AlertTriangle, className: 'border-[var(--warning)] bg-warning-bg', label: 'Watch out' },
}

function Block({ block }: { block: RichBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <section className="max-w-3xl space-y-2">
          {block.heading ? <h2 className="text-lg font-semibold text-ink">{block.heading}</h2> : null}
          <LessonText text={block.body} className="text-[15px]" />
        </section>
      )
    case 'callout': {
      const c = CALLOUT[block.tone]!
      const Icon = c.icon
      return (
        <aside className={cn('max-w-3xl rounded-[var(--radius-lg)] border-l-4 p-4', c.className)} aria-label={c.label}>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon className="size-4" aria-hidden /> {block.title}
          </p>
          <LessonText text={block.body} className="mt-1.5" />
        </aside>
      )
    }
    case 'figure':
      return (
        <figure className="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt} className="w-full rounded-[var(--radius-lg)] border border-line" loading="lazy" />
          {block.caption ? <figcaption className="mt-1.5 text-xs text-ink-muted">{block.caption}</figcaption> : null}
        </figure>
      )
    case 'diagram':
      return (
        <figure className="max-w-3xl overflow-hidden rounded-[var(--radius-lg)] border border-line">
          <Diagram name={block.name} />
          {block.caption ? <figcaption className="border-t border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">{block.caption}</figcaption> : null}
        </figure>
      )
    case 'check':
      return <QuickCheck block={block} />
    case 'sort':
      return <SortActivity block={block} />
    case 'sequence':
      return <SequenceActivity block={block} />
    case 'match':
      return <MatchActivity block={block} />
    case 'kit':
      return <KitExplorer block={block} />
    case 'ir-sim':
      return <IrSimulator block={block} />
    case 'motor-lab':
      return <MotorLab block={block} />
    case 'line-sim':
      return <LineSimulator block={block} />
    case 'truth-table':
      return <TruthTableActivity block={block} />
    case 'wiring':
      return <WiringActivity block={block} />
    case 'code-lab':
      return <CodeLab block={block} />
    case 'code':
      return <CodeView block={block} />
    case 'checklist':
      return <ChecklistActivity block={block} />
    case 'steps':
      return <StepsBlock block={block} />
    case 'missions':
      return <MissionsActivity block={block} />
    case 'resources':
      return <ResourcesBlock block={block} />
  }
}
