'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { cn } from '@/lib/utils'

type Subject = {
  id: string
  label: string
  hasSyllabus: boolean
  classLevelId: string
}
type PaperType = { id: string; name: string; marks: number | null; minutes: number | null }
type SectionOption = { id: string; name: string; classLevelId: string }
type Chapter = { id: string; name: string; code: string | null; topics: { id: string; name: string }[] }

const STEPS = [
  'Class & subject',
  'Syllabus',
  'Assessment type',
  'Configuration',
  'Generate',
] as const

/**
 * Guided path into the existing generate pipeline.
 * Collects class → chapters/weightage → type → difficulty mix, then opens Generate.
 */
export function AiAssessmentWizard({
  subjects,
  types,
  sections,
}: {
  subjects: Subject[]
  types: PaperType[]
  sections: SectionOption[]
}) {
  const router = useRouter()
  const [step, setStep] = React.useState(0)
  const [classSubjectId, setClassSubjectId] = React.useState(subjects[0]?.id ?? '')
  const [sectionId, setSectionId] = React.useState('')
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? '')
  const [title, setTitle] = React.useState(types[0]?.name ?? 'AI Assessment')
  const [totalMarks, setTotalMarks] = React.useState(String(types[0]?.marks ?? 40))
  const [durationMinutes, setDurationMinutes] = React.useState(String(types[0]?.minutes ?? 60))
  const [questionCount, setQuestionCount] = React.useState('10')
  const [instructions, setInstructions] = React.useState('')
  const [easyPct, setEasyPct] = React.useState('30')
  const [mediumPct, setMediumPct] = React.useState('50')
  const [hardPct, setHardPct] = React.useState('20')
  const [chapters, setChapters] = React.useState<Chapter[] | null>(null)
  const [chapterIds, setChapterIds] = React.useState<string[]>([])
  const [weights, setWeights] = React.useState<Record<string, string>>({})
  const [entireSyllabus, setEntireSyllabus] = React.useState(true)

  const subject = subjects.find((s) => s.id === classSubjectId)
  const sectionOptions = sections.filter((s) => s.classLevelId === subject?.classLevelId)
  const mixSum = Number(easyPct) + Number(mediumPct) + Number(hardPct)
  const selectedChapters = chapters?.filter((c) => chapterIds.includes(c.id)) ?? []
  const weightSum = selectedChapters.reduce((sum, c) => sum + Number(weights[c.id] || 0), 0)

  React.useEffect(() => {
    if (!classSubjectId) return
    let cancelled = false
    setChapters(null)
    setChapterIds([])
    setWeights({})
    setEntireSyllabus(true)
    setSectionId('')
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

  function pickType(id: string) {
    setTypeId(id)
    const type = types.find((t) => t.id === id)
    if (type?.marks) setTotalMarks(String(type.marks))
    if (type?.minutes) setDurationMinutes(String(type.minutes))
    if (type) setTitle(type.name)
  }

  function toggleChapter(id: string) {
    setEntireSyllabus(false)
    setChapterIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      setWeights((w) => {
        const copy = { ...w }
        if (!next.includes(id)) delete copy[id]
        else if (!copy[id]) {
          const even = next.length > 0 ? Math.floor(100 / next.length) : 0
          for (const cid of next) copy[cid] = String(even)
          const assigned = next.reduce((s, cid) => s + Number(copy[cid] || 0), 0)
          if (next[0]) copy[next[0]] = String(Number(copy[next[0]]) + (100 - assigned))
        }
        return copy
      })
      return next
    })
  }

  function continueToGenerate() {
    const params = new URLSearchParams({
      classSubjectId,
      assessmentTypeId: typeId,
      count: questionCount,
      totalMarks,
      durationMinutes,
      title,
      easyPct,
      mediumPct,
      hardPct,
      createPaper: '1',
    })
    if (sectionId) params.set('sectionId', sectionId)
    if (instructions.trim()) params.set('instructions', instructions.trim())
    if (!entireSyllabus && chapterIds.length > 0) {
      params.set('chapterIds', chapterIds.join(','))
      const weightPayload = chapterIds.map((id) => `${id}:${weights[id] || 0}`).join(',')
      params.set('chapterWeights', weightPayload)
    }
    router.push(`/assessments/bank/generate?${params.toString()}`)
  }

  const canLeaveSyllabus =
    entireSyllabus || (chapterIds.length > 0 && (chapterIds.length === 1 || weightSum === 100))

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={cn(
              'rounded-full px-3 py-1 text-sm',
              index === step
                ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                : 'bg-[var(--surface-2)] text-[var(--muted)]',
            )}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Class, section & subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Class · Subject" required>
              <Select
                value={classSubjectId}
                onChange={(e) => setClassSubjectId(e.target.value)}
                required
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.hasSyllabus ? '' : ' (no published syllabus)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Section (optional)" hint="Leave blank for the whole class level">
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Entire class</option>
                {sectionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="button" onClick={() => setStep(1)} disabled={!classSubjectId}>
              Continue
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Syllabus scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!subject?.hasSyllabus ? (
              <Notice tone="info" title="No published syllabus">
                You can still generate from an uploaded textbook on the next screen.
              </Notice>
            ) : chapters === null ? (
              <p className="text-sm text-[var(--muted)]">Loading chapters…</p>
            ) : chapters.length === 0 ? (
              <Notice tone="warning" title="No chapters found">
                Publish curriculum chapters, or use a textbook when generating.
              </Notice>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={entireSyllabus}
                    onChange={(e) => {
                      setEntireSyllabus(e.target.checked)
                      if (e.target.checked) {
                        setChapterIds([])
                        setWeights({})
                      }
                    }}
                  />
                  Entire published syllabus
                </label>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-[8px] border border-[var(--border)] p-3">
                  {chapters.map((chapter) => (
                    <div key={chapter.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex flex-1 items-center gap-2">
                        <Checkbox
                          checked={entireSyllabus || chapterIds.includes(chapter.id)}
                          disabled={entireSyllabus}
                          onChange={() => toggleChapter(chapter.id)}
                        />
                        <span>
                          {chapter.code ? `${chapter.code} · ` : ''}
                          {chapter.name}
                          <span className="text-[var(--muted)]">
                            {' '}
                            ({chapter.topics.length} topics)
                          </span>
                        </span>
                      </label>
                      {!entireSyllabus && chapterIds.includes(chapter.id) && chapterIds.length > 1 ? (
                        <Input
                          className="w-20"
                          type="number"
                          min={1}
                          max={100}
                          aria-label={`Weight for ${chapter.name}`}
                          value={weights[chapter.id] ?? ''}
                          onChange={(e) =>
                            setWeights((prev) => ({ ...prev, [chapter.id]: e.target.value }))
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
                {!entireSyllabus && chapterIds.length > 1 ? (
                  <p
                    className={cn(
                      'text-xs',
                      weightSum === 100 ? 'text-[var(--muted)]' : 'text-[var(--danger)]',
                    )}
                  >
                    Chapter weightage: {weightSum}% (must be 100%)
                  </p>
                ) : null}
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(2)} disabled={!canLeaveSyllabus}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assessment type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Type" required>
              <Select value={typeId} onChange={(e) => pickType(e.target.value)} required>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Total marks" required>
                <Input
                  type="number"
                  min={1}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                />
              </Field>
              <Field label="Duration (min)" required>
                <Input
                  type="number"
                  min={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
              </Field>
              <Field label="Questions" required>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Easy %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={easyPct}
                  onChange={(e) => setEasyPct(e.target.value)}
                />
              </Field>
              <Field label="Medium %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={mediumPct}
                  onChange={(e) => setMediumPct(e.target.value)}
                />
              </Field>
              <Field label="Hard %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={hardPct}
                  onChange={(e) => setHardPct(e.target.value)}
                />
              </Field>
            </div>
            {mixSum !== 100 ? (
              <p className="text-xs text-[var(--danger)]">Difficulty mix must total 100% (now {mixSum}%).</p>
            ) : null}
            <Field label="Instructions (optional)">
              <Textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(4)} disabled={mixSum !== 100}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate with AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Notice tone="info" title="Uses your question bank pipeline">
              Next you pick any remaining options (textbook pages if needed) and generate drafts.
              Difficulty mix and chapter weightage are passed into the generator. Nothing reaches
              students until you approve.
            </Notice>
            <ul className="space-y-1 text-sm text-[var(--fg)]">
              <li>
                <span className="text-[var(--muted)]">Subject:</span> {subject?.label}
              </li>
              <li>
                <span className="text-[var(--muted)]">Syllabus:</span>{' '}
                {entireSyllabus
                  ? 'Entire published syllabus'
                  : `${chapterIds.length} chapter(s)`}
              </li>
              <li>
                <span className="text-[var(--muted)]">Paper:</span> {title} · {totalMarks} marks ·{' '}
                {durationMinutes} min
              </li>
              <li>
                <span className="text-[var(--muted)]">Mix:</span> {easyPct}% / {mediumPct}% /{' '}
                {hardPct}%
              </li>
            </ul>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button type="button" onClick={continueToGenerate}>
                Open AI generate
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
