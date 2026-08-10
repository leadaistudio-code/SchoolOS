'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { StudentListRow } from '@/server/modules/students/service'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { ClassSection, DueAmount, PersonCell } from '@/components/ui/identity'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn, formatMoney } from '@/lib/utils'

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
  const filtered = params.toString().length > 0

  const setParam = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    router.push(`${pathname}?${next.toString()}`)
  }

  const toggleSort = (field: string) => {
    setParam((next) => {
      next.set('sort', field)
      next.set('dir', sort === field && dir === 'asc' ? 'desc' : 'asc')
      next.delete('page')
    })
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? 'No students match these filters' : 'No students yet'}
        description={
          filtered
            ? 'Widen or clear the filters above to see more records.'
            : 'Add a student, or import your existing roll from a CSV file.'
        }
        action={
          canCreate && !filtered ? (
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
              <SortableTH
                label="Admission no."
                field="admissionNo"
                sort={sort}
                dir={dir}
                onSort={toggleSort}
              />
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
                  <PersonCell
                    firstName={s.firstName}
                    lastName={s.lastName}
                    secondary={s.rollNumber ? `Roll ${s.rollNumber}` : undefined}
                    href={`/students/${s.id}`}
                  />
                </TD>
                <TD className="tnum">{s.admissionNo}</TD>
                <TD>
                  <ClassSection className={s.className} section={s.sectionName} />
                </TD>
                <TD>
                  {s.guardianName ? (
                    <>
                      <span className="block text-sm text-ink truncate max-w-44">
                        {s.guardianName}
                      </span>
                      {s.guardianPhone ? (
                        <span className="block text-xs text-ink-subtle tnum">{s.guardianPhone}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-ink-subtle">Not linked</span>
                  )}
                </TD>
                <TD align="right">
                  <DueAmount formatted={formatMoney(s.dueMinor, currency)} due={s.dueMinor > 0} />
                </TD>
                <TD>
                  <StatusBadge status={s.status} />
                </TD>
                <TD align="right">
                  <Link
                    href={canEdit ? `/students/${s.id}/edit` : `/students/${s.id}`}
                    className="text-sm text-[var(--brand-600)] hover:underline"
                  >
                    {canEdit ? 'Edit' : 'View'}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      <Pagination total={total} page={page} pageSize={pageSize} label="students" />
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
        className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
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
