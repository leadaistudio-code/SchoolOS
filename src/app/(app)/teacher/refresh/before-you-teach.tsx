'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import type { TeachingSubjectOption } from '@/server/modules/teacher-refresh/service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Select, Checkbox } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/**
 * The on-demand "Before You Teach" refresher.
 *
 * A teacher picks a subject they teach and, if they like, the exact topics for
 * the lesson ahead; leaving topics unticked refreshes the whole subject. The
 * subject list is the teacher's own assignments — there is nothing here to pick
 * that isn't theirs to teach — so the choice is always safe by construction.
 */
export function BeforeYouTeach({ subjects }: { subjects: TeachingSubjectOption[] }) {
  const router = useRouter()
  const { push } = useToast()

  const [csId, setCsId] = React.useState(subjects[0]?.classSubjectId ?? '')
  const [topicIds, setTopicIds] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  const subject = subjects.find((s) => s.classSubjectId === csId) ?? subjects[0]

  // Topics grouped by chapter, so a long syllabus reads as a table of contents
  // rather than a flat wall of checkboxes.
  const byChapter = React.useMemo(() => {
    const groups = new Map<string, { id: string; name: string }[]>()
    for (const t of subject?.topics ?? []) {
      const list = groups.get(t.chapterName) ?? []
      list.push({ id: t.id, name: t.name })
      groups.set(t.chapterName, list)
    }
    return [...groups.entries()]
  }, [subject])

  function chooseSubject(id: string) {
    setCsId(id)
    setTopicIds(new Set())
  }

  function toggleTopic(id: string) {
    setTopicIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function start() {
    if (!subject) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/teacher-refresh/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          classSubjectId: subject.classSubjectId,
          topicIds: [...topicIds],
          type: 'PRE_LECTURE',
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not build a refresher',
          description:
            body?.error?.message ?? 'There may not be questions for these topics yet.',
        })
        return
      }
      router.push(`/teacher/refresh/${body.data.assessmentId}/take`)
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subject" htmlFor="byt-subject">
            <Select id="byt-subject" value={csId} onChange={(e) => chooseSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.classSubjectId} value={s.classSubjectId}>
                  {s.className} · {s.subjectName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {byChapter.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-ink">Topics</p>
            <p className="text-xs text-ink-subtle mt-0.5 mb-2">
              Tick the topics for your next lesson, or leave them all unticked to refresh the whole
              subject.
            </p>
            <div className="max-h-64 overflow-y-auto scroll-thin rounded-[var(--radius-sm)] border border-line divide-y divide-[var(--border)]">
              {byChapter.map(([chapter, topics]) => (
                <div key={chapter} className="p-2.5">
                  <p className="text-xs font-semibold text-ink-muted mb-1.5">{chapter}</p>
                  <div className="space-y-1.5">
                    {topics.map((t) => (
                      <label key={t.id} className="flex items-start gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={topicIds.has(t.id)}
                          onChange={() => toggleTopic(t.id)}
                          className="mt-0.5"
                        />
                        <span className="text-ink">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-subtle">
            No published topics for this subject yet — starting a refresher will draw on the whole
            subject’s question bank.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-subtle">
            {topicIds.size > 0
              ? `${topicIds.size} topic${topicIds.size > 1 ? 's' : ''} selected`
              : 'Whole subject'}
          </p>
          <Button onClick={start} loading={busy} disabled={!subject}>
            <Sparkles aria-hidden />
            Start refresher
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
