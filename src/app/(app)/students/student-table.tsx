'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, FileDown, MessageSquare } from 'lucide-react'
import type { StudentListRow } from '@/server/modules/students/service'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { ClassSection, DueAmount, PersonCell } from '@/components/ui/identity'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn, formatMoney } from '@/lib/utils'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'

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
  canSeeFeeAmounts,
  canExport,
  canMessage,
  canBroadcast,
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
  /** When false, show Paid/Due only — never rupee amounts (teachers). */
  canSeeFeeAmounts: boolean
  canExport: boolean
  canMessage: boolean
  canBroadcast: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filtered = params.toString().length > 0
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))
  const recipientIds = selectedRows.flatMap((row) => row.userId ? [row.userId] : [])

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
      <BulkSelectionBar
        count={selection.selected.size}
        noun="student"
        onClear={selection.clear}
      >
        {canExport ? (
          <button
            type="button"
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            onClick={() => downloadCsv(
              'students-selected.csv',
              ['Student', 'Admission no.', 'Class', 'Section', 'Guardian', 'Phone', 'Status'],
              selectedRows.map((row) => [
                `${row.firstName} ${row.lastName}`,
                row.admissionNo,
                row.className,
                row.sectionName,
                row.guardianName,
                row.guardianPhone,
                row.status,
              ]),
            )}
          >
            <FileDown aria-hidden />
            Export
          </button>
        ) : null}
        {canMessage && recipientIds.length > 0 && (recipientIds.length === 1 || canBroadcast) ? (
          <Link
            href={`/communication/messages?compose=1&to=${encodeURIComponent(recipientIds.join(','))}`}
            className={buttonVariants({ size: 'sm' })}
          >
            <MessageSquare aria-hidden />
            Message {recipientIds.length}
          </Link>
        ) : null}
      </BulkSelectionBar>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>
                <Checkbox
                  checked={selection.allSelected}
                  onChange={selection.toggleAll}
                  aria-label="Select all students on this page"
                />
              </TH>
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
                  <Checkbox
                    checked={selection.selected.has(s.id)}
                    onChange={() => selection.toggle(s.id)}
                    aria-label={`Select ${s.firstName} ${s.lastName}`}
                  />
                </TD>
                <TD>
                  <PersonCell
                    firstName={s.firstName}
                    lastName={s.lastName}
                    secondary={s.rollNumber ? `Roll ${s.rollNumber}` : undefined}
                    href={`/students/${s.id}`}
                    avatarUrl={s.photoUrl}
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
                  {canSeeFeeAmounts ? (
                    <DueAmount formatted={formatMoney(s.dueMinor, currency)} due={s.dueMinor > 0} />
                  ) : (
                    <span
                      className={cn(
                        'text-sm font-medium',
                        s.dueMinor > 0 ? 'text-[var(--danger)]' : 'text-ink-muted',
                      )}
                    >
                      {s.dueMinor > 0 ? 'Due' : 'Paid'}
                    </span>
                  )}
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
