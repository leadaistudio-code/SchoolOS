'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react'
import type { StudentListRow } from '@/server/modules/students/service'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn, formatMoney, initials } from '@/lib/utils'

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  ALUMNI: 'neutral',
  TRANSFERRED: 'neutral',
  WITHDRAWN: 'warning',
  SUSPENDED: 'danger',
}

export function StudentTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  currency,
  canEdit,
  canCreate,
}: {
  rows: StudentListRow[]
  total: number
  page: number
  pageSize: number
  sort?: string
  dir: 'asc' | 'desc'
  currency: string
  canEdit: boolean
  canCreate: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const setParam = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    router.push(`${pathname}?${next.toString()}`)
  }

  const toggleSort = (field: string) => {
    setParam((next) => {
      const nextDir = sort === field && dir === 'asc' ? 'desc' : 'asc'
      next.set('sort', field)
      next.set('dir', nextDir)
      next.delete('page')
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus className="size-5" />}
        title={params.toString() ? 'No students match these filters' : 'No students yet'}
        description={
          params.toString()
            ? 'Try widening or clearing the filters above.'
            : 'Add your first student, or import your existing roll from a CSV file.'
        }
        action={
          canCreate && !params.toString() ? (
            <Link href="/students/new" className={buttonVariants({ size: 'sm' })}>
              Add student
            </Link>
          ) : undefined
        }
      />
    )
  }

  return (
    <>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <SortableTH label="Student" field="firstName" sort={sort} dir={dir} onSort={toggleSort} />
              <SortableTH label="Admission no." field="admissionNo" sort={sort} dir={dir} onSort={toggleSort} />
              <TH>Class</TH>
              <TH>Guardian</TH>
              <TH align="right">Dues</TH>
              <SortableTH label="Status" field="status" sort={sort} dir={dir} onSort={toggleSort} />
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link href={`/students/${s.id}`} className="flex items-center gap-2.5 group">
                    <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-[11px] font-semibold text-ink-muted shrink-0">
                      {initials(s.firstName, s.lastName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] text-ink group-hover:text-[var(--brand-600)] truncate">
                        {s.firstName} {s.lastName}
                      </span>
                      {s.rollNumber ? (
                        <span className="block text-[12px] text-ink-subtle">Roll {s.rollNumber}</span>
                      ) : null}
                    </span>
                  </Link>
                </TD>
                <TD className="text-[13px] text-ink-muted tnum">{s.admissionNo}</TD>
                <TD className="text-[13px] text-ink-muted">
                  {s.className ? `${s.className}${s.sectionName ? ` · ${s.sectionName}` : ''}` : '-'}
                </TD>
                <TD>
                  {s.guardianName ? (
                    <span className="block text-[13px] text-ink">{s.guardianName}</span>
                  ) : (
                    <span className="text-[13px] text-ink-subtle">Not linked</span>
                  )}
                  {s.guardianPhone ? (
                    <span className="block text-[12px] text-ink-subtle">{s.guardianPhone}</span>
                  ) : null}
                </TD>
                <TD align="right">
                  <span className={cn('text-[13px]', s.dueMinor > 0 ? 'text-[var(--danger)] font-medium' : 'text-ink-subtle')}>
                    {s.dueMinor > 0 ? formatMoney(s.dueMinor, currency) : '-'}
                  </span>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[s.status] ?? 'neutral'}>{s.status.toLowerCase()}</Badge>
                </TD>
                <TD align="right">
                  <Link
                    href={canEdit ? `/students/${s.id}/edit` : `/students/${s.id}`}
                    className="text-[13px] text-[var(--brand-600)] hover:underline"
                  >
                    {canEdit ? 'Edit' : 'View'}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line">
        <p className="text-[12.5px] text-ink-muted">
          Showing <span className="tnum">{(page - 1) * pageSize + 1}</span>-
          <span className="tnum">{Math.min(page * pageSize, total)}</span> of{' '}
          <span className="tnum">{total}</span> students
        </p>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => setParam((n) => n.set('page', String(page - 1)))}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'disabled:opacity-45')}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </button>
          <span className="text-[12.5px] text-ink-muted px-2 tnum">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParam((n) => n.set('page', String(page + 1)))}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'disabled:opacity-45')}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </>
  )
}

function SortableTH({
  label,
  field,
  sort,
  dir,
  onSort,
}: {
  label: string
  field: string
  sort?: string
  dir: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  const active = sort === field
  return (
    <TH aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </TH>
  )
}
