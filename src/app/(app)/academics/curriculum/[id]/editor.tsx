'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

/**
 * The syllabus editor.
 *
 * Chapters hold topics; topics carry the summary that later grounds question
 * generation. Ordering is by explicit up/down rather than drag: the list is
 * read far more often than it is rearranged, keyboard and touch both work
 * without a second implementation, and a chapter list is short enough that a
 * move is one or two clicks.
 *
 * Every mutation posts and then refreshes the server component, so what is on
 * screen is always what the database returned rather than a local guess that
 * can drift from it.
 */

type Outcome = { id: string; statement: string; bloomLevel: string | null; position: number }
type Topic = {
  id: string
  name: string
  summary: string | null
  weightage: number | null
  position: number
  outcomes: Outcome[]
}
type Chapter = {
  id: string
  name: string
  code: string | null
  periods: number | null
  description: string | null
  position: number
  topics: Topic[]
}
export type CurriculumTree = {
  id: string
  title: string | null
  board: string | null
  description: string | null
  isPublished: boolean
  classSubject: {
    classLevel: { name: string }
    subject: { name: string }
  }
  chapters: Chapter[]
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const parsed = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(parsed?.error?.message ?? 'Something went wrong. Please try again.')
  }
  return parsed?.data
}

export function SyllabusEditor({
  curriculum,
  canManage,
}: {
  curriculum: CurriculumTree
  canManage: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [openChapter, setOpenChapter] = React.useState<string | null>(
    curriculum.chapters[0]?.id ?? null,
  )

  const topicCount = curriculum.chapters.reduce((sum, c) => sum + c.topics.length, 0)

  const run = React.useCallback(
    async (work: () => Promise<unknown>, success?: string) => {
      setBusy(true)
      try {
        await work()
        if (success) push({ tone: 'success', title: success })
        router.refresh()
      } catch (err) {
        push({
          tone: 'error',
          title: 'Not saved',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        setBusy(false)
      }
    },
    [push, router],
  )

  function moveChapter(index: number, delta: number) {
    const ids = curriculum.chapters.map((c) => c.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    void run(() => send(`/api/v1/curriculum/${curriculum.id}/reorder`, 'POST', { ids }))
  }

  function moveTopic(chapter: Chapter, index: number, delta: number) {
    const ids = chapter.topics.map((t) => t.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    void run(() => send(`/api/v1/curriculum/chapters/${chapter.id}/reorder`, 'POST', { ids }))
  }

  return (
    <div className="flex flex-col gap-4">
      {!curriculum.isPublished && (
        <Notice tone="warning" title="This syllabus is a draft">
          Question papers can only be set from a published syllabus. Publish it once the chapters
          and topics are in place.
        </Notice>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Badge tone={curriculum.isPublished ? 'success' : 'warning'}>
            {curriculum.isPublished ? 'published' : 'draft'}
          </Badge>
          <span className="text-sm text-ink-muted tnum">
            {curriculum.chapters.length} chapters · {topicCount} topics
          </span>
          {curriculum.board && <span className="text-sm text-ink-subtle">{curriculum.board}</span>}
        </div>

        {canManage && (
          <Button
            variant={curriculum.isPublished ? 'secondary' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  send(`/api/v1/curriculum/${curriculum.id}`, 'PATCH', {
                    isPublished: !curriculum.isPublished,
                  }),
                curriculum.isPublished ? 'Moved back to draft' : 'Syllabus published',
              )
            }
          >
            {curriculum.isPublished ? 'Move to draft' : 'Publish'}
          </Button>
        )}
      </Card>

      {curriculum.chapters.length === 0 ? (
        <Card>
          <EmptyState
            title="No chapters yet"
            description="Add the chapters this subject covers this year. Topics go inside each chapter."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {curriculum.chapters.map((chapter, index) => {
            const open = openChapter === chapter.id
            return (
              <Card key={chapter.id} className="overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setOpenChapter(open ? null : chapter.id)}
                    aria-expanded={open}
                  >
                    <div className="flex items-center gap-2">
                      {chapter.code && (
                        <span className="text-xs font-medium text-ink-subtle tnum">
                          {chapter.code}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-ink">{chapter.name}</span>
                      <span className="text-xs text-ink-subtle tnum">
                        {chapter.topics.length} {chapter.topics.length === 1 ? 'topic' : 'topics'}
                      </span>
                    </div>
                    {chapter.description && (
                      <p className="mt-1 text-sm text-ink-muted">{chapter.description}</p>
                    )}
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Move chapter up"
                        variant="ghost"
                        disabled={busy || index === 0}
                        onClick={() => moveChapter(index, -1)}
                      >
                        <ChevronUp />
                      </IconButton>
                      <IconButton
                        label="Move chapter down"
                        variant="ghost"
                        disabled={busy || index === curriculum.chapters.length - 1}
                        onClick={() => moveChapter(index, 1)}
                      >
                        <ChevronDown />
                      </IconButton>
                      <IconButton
                        label={`Delete chapter ${chapter.name}`}
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete "${chapter.name}" and its ${chapter.topics.length} topics?`,
                            )
                          )
                            return
                          void run(
                            () => send(`/api/v1/curriculum/chapters/${chapter.id}`, 'DELETE'),
                            'Chapter deleted',
                          )
                        }}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  )}
                </div>

                {open && (
                  <div className="border-t border-line bg-surface-2/40 p-4">
                    {chapter.topics.length === 0 ? (
                      <p className="text-sm text-ink-muted">
                        No topics yet. A topic with a short summary is what a question paper is set
                        from.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {chapter.topics.map((topic, topicIndex) => (
                          <li
                            key={topic.id}
                            className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-surface p-3"
                          >
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-ink">{topic.name}</span>
                                {topic.weightage != null && (
                                  <Badge tone="neutral">{topic.weightage}%</Badge>
                                )}
                                {topic.outcomes.length > 0 && (
                                  <span className="text-xs text-ink-subtle tnum">
                                    {topic.outcomes.length} outcomes
                                  </span>
                                )}
                              </div>
                              {topic.summary && (
                                <p className="mt-1 text-sm text-ink-muted">{topic.summary}</p>
                              )}
                            </div>

                            {canManage && (
                              <div className="flex items-center gap-1">
                                <IconButton
                                  label="Move topic up"
                                  variant="ghost"
                                  disabled={busy || topicIndex === 0}
                                  onClick={() => moveTopic(chapter, topicIndex, -1)}
                                >
                                  <ChevronUp />
                                </IconButton>
                                <IconButton
                                  label="Move topic down"
                                  variant="ghost"
                                  disabled={busy || topicIndex === chapter.topics.length - 1}
                                  onClick={() => moveTopic(chapter, topicIndex, 1)}
                                >
                                  <ChevronDown />
                                </IconButton>
                                <IconButton
                                  label={`Delete topic ${topic.name}`}
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      () => send(`/api/v1/curriculum/topics/${topic.id}`, 'DELETE'),
                                      'Topic deleted',
                                    )
                                  }
                                >
                                  <Trash2 />
                                </IconButton>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {canManage && (
                      <AddTopic
                        chapterId={chapter.id}
                        busy={busy}
                        onSubmit={(body) =>
                          run(
                            () => send('/api/v1/curriculum/topics', 'POST', body),
                            'Topic added',
                          )
                        }
                      />
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {canManage && (
        <AddChapter
          curriculumId={curriculum.id}
          busy={busy}
          onSubmit={(body) =>
            run(() => send('/api/v1/curriculum/chapters', 'POST', body), 'Chapter added')
          }
        />
      )}
    </div>
  )
}

function AddChapter({
  curriculumId,
  busy,
  onSubmit,
}: {
  curriculumId: string
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim()) return
          await onSubmit({
            curriculumId,
            name: name.trim(),
            code: code.trim() || undefined,
          })
          setName('')
          setCode('')
        }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ch 1"
          aria-label="Chapter number"
          className="sm:w-24"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chapter name"
          aria-label="Chapter name"
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus /> Add chapter
        </Button>
      </form>
    </Card>
  )
}

function AddTopic({
  chapterId,
  busy,
  onSubmit,
}: {
  chapterId: string
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [summary, setSummary] = React.useState('')

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim()) return
        await onSubmit({
          chapterId,
          name: name.trim(),
          summary: summary.trim() || undefined,
        })
        setName('')
        setSummary('')
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Topic name"
        aria-label="Topic name"
      />
      <Textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="What this topic covers, in a sentence or two. This is what a generated question is held to."
        aria-label="Topic summary"
        rows={2}
      />
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
          <Plus /> Add topic
        </Button>
      </div>
    </form>
  )
}
