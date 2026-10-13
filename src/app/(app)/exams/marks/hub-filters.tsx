'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Field, Input, Select } from '@/components/ui/input'

type Option = { id: string; label: string }

export function MarksHubFilters({
  exams,
  classes,
  sections,
  statuses,
  sources,
}: {
  exams: Option[]
  classes: Option[]
  sections: Option[]
  statuses: ReadonlyArray<{ value: string; label: string }>
  sources: ReadonlyArray<{ value: string; label: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (q === current) return
    const timer = setTimeout(() => setParams({ q }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Exam" htmlFor="mh-exam">
        <Select id="mh-exam" value={searchParams.get('exam') ?? ''} onChange={(e) => setParams({ exam: e.target.value })}>
          <option value="">All exams</option>
          {exams.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Class" htmlFor="mh-class">
        <Select id="mh-class" value={searchParams.get('classLevelId') ?? ''} onChange={(e) => setParams({ classLevelId: e.target.value, sectionId: '' })}>
          <option value="">All classes</option>
          {classes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Section" htmlFor="mh-section">
        <Select id="mh-section" value={searchParams.get('sectionId') ?? ''} onChange={(e) => setParams({ sectionId: e.target.value })}>
          <option value="">All sections</option>
          {sections.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Status" htmlFor="mh-status">
        <Select id="mh-status" value={searchParams.get('status') ?? ''} onChange={(e) => setParams({ status: e.target.value })}>
          <option value="">Any status</option>
          {statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Source" htmlFor="mh-source">
        <Select id="mh-source" value={searchParams.get('source') ?? ''} onChange={(e) => setParams({ source: e.target.value })}>
          <option value="">Any source</option>
          {sources.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Quick search" htmlFor="mh-q">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input id="mh-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject, teacher, student…" className="pl-8" />
        </div>
      </Field>
    </div>
  )
}
