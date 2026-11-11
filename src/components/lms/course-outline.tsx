import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
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
}: {
  modules: OutlineModule[]
  lessonHref: (lessonId: string) => string
  completed?: Set<string>
  scores?: Map<string, number | null>
  currentLessonId?: string
  compact?: boolean
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
                return (
                  <li key={l.id}>
                    <Link
                      href={lessonHref(l.id)}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-surface-2',
                        current && 'bg-[var(--brand-50)] font-medium',
                      )}
                    >
                      {completed ? (
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
                          {score !== undefined && score !== null ? `${score}% · ` : ''}
                          {lessonKind(l.kind).label}
                          {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                        </span>
                      ) : null}
                    </Link>
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
