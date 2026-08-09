'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function TimetablePicker({
  sections,
  teachers,
  sectionId,
  staffId,
}: {
  sections: { id: string; label: string }[]
  teachers: { id: string; label: string }[]
  sectionId?: string
  staffId?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const isTeacherView = !!staffId

  const go = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`)

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      {/* Two ways of reading the same data: by class, or by teacher. */}
      <div className="inline-flex rounded-lg border border-line p-0.5" role="tablist">
        {[
          { key: 'class', label: 'By class' },
          { key: 'teacher', label: 'By teacher' },
        ].map((tab) => {
          const active = (tab.key === 'teacher') === isTeacherView
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => {
                const next = new URLSearchParams()
                if (tab.key === 'teacher') next.set('staffId', teachers[0]?.id ?? '')
                else next.set('sectionId', sectionId ?? sections[0]?.id ?? '')
                go(next)
              }}
              className={cn(
                'px-3 h-7 rounded-md text-[12.5px] transition-colors',
                active
                  ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)] font-medium'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {isTeacherView ? (
        <Select
          value={staffId}
          aria-label="Select teacher"
          className="w-56"
          onChange={(e) => {
            const next = new URLSearchParams(params.toString())
            next.set('staffId', e.target.value)
            next.delete('sectionId')
            go(next)
          }}
        >
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      ) : (
        <Select
          value={sectionId}
          aria-label="Select section"
          className="w-56"
          onChange={(e) => {
            const next = new URLSearchParams()
            next.set('sectionId', e.target.value)
            go(next)
          }}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}
