import Link from 'next/link'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { lessonKind } from '@/lib/lms/options'
import { cn } from '@/lib/utils'
import { KindIcon } from './kind-icon'

type OutlineModule = {
  id: string
  title: string
  lessons: { id: string; title: string; kind: string; durationMinutes: number | null }[]
}

/** Module and lesson list. With `completed`, ticks what the learner finished. */
export function CourseOutline({
  modules,
  lessonHref,
  completed,
  scores,
  currentLessonId,
  compact,
  lockedLessonIds,
  lockedHref,
}: {
  modules: OutlineModule[]
  lessonHref: (lessonId: string) => string
  completed?: Set<string>
  scores?: Map<string, number | null>
  currentLessonId?: string
  compact?: boolean
  lockedLessonIds?: Set<string>
  /** Where locked lessons send the learner (usually the course unlock CTA). */
  lockedHref?: string
}) {
  return (
    <div className="space-y-3">
      {modules.map((m, mi) => (
        <Card key={m.id}>
          <CardHeader className={cn(compact && 'min-h-9 py-1.5')}>
            <CardTitle className={cn('truncate', compact && 'text-sm')}>
              <span className="text-ink-subtle font-normal mr-1.5">{mi + 1}.</span>
              {m.title}
            </CardTitle>
          </CardHeader>
          {m.lessons.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-subtle">No lessons yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {m.lessons.map((l) => {
                const done = completed?.has(l.id)
                const score = scores?.get(l.id)
                const current = l.id === currentLessonId
                const locked = lockedLessonIds?.has(l.id)
                const rowClass = cn(
                  'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                  locked ? 'cursor-not-allowed opacity-70' : 'hover:bg-surface-2',
                  current && !locked && 'bg-[var(--brand-50)] font-medium',
                )
                const body = (
                  <>
                    {locked ? (
                      <Lock className="size-4 shrink-0 text-ink-subtle" aria-label="Locked" />
                    ) : completed ? (
                      done ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" />
                      ) : (
                        <Circle className="size-4 shrink-0 text-ink-subtle" aria-label="Not done" />
                      )
                    ) : null}
                    <KindIcon kind={l.kind} className="text-ink-subtle" />
                    <span className="flex-1 min-w-0 truncate text-ink">{l.title}</span>
                    {!compact ? (
                      <span className="text-xs text-ink-subtle whitespace-nowrap">
                        {locked ? 'Unlock · ' : ''}
                        {score !== undefined && score !== null ? `${score}% · ` : ''}
                        {lessonKind(l.kind).label}
                        {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                      </span>
                    ) : null}
                  </>
                )
                return (
                  <li key={l.id}>
                    {locked ? (
                      <Link href={lockedHref ?? '#'} className={rowClass} aria-disabled title="Unlock the full course to open this lesson">
                        {body}
                      </Link>
                    ) : (
                      <Link href={lessonHref(l.id)} aria-current={current ? 'page' : undefined} className={rowClass}>
                        {body}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}
