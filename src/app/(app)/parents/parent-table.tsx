'use client'

import Link from 'next/link'
import { FileDown, MessageSquare } from 'lucide-react'
import type { ParentRow } from '@/server/modules/people/service'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox } from '@/components/ui/input'
import { PersonCell } from '@/components/ui/identity'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export function ParentTable({
  rows,
  total,
  page,
  pageSize,
  canExport,
  canMessage,
  canBroadcast,
  canEdit,
}: {
  rows: ParentRow[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
  canMessage: boolean
  canBroadcast: boolean
  canEdit?: boolean
}) {
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))
  const recipientIds = selectedRows.flatMap((row) => row.userId ? [row.userId] : [])

  return (
    <>
      <BulkSelectionBar count={selection.selected.size} noun="parent" onClear={selection.clear}>
        {canExport ? (
          <button
            type="button"
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            onClick={() => downloadCsv(
              'parents-selected.csv',
              ['Parent', 'Phone', 'Email', 'Occupation', 'Children', 'Portal access'],
              selectedRows.map((row) => [
                `${row.firstName} ${row.lastName}`,
                row.phone,
                row.email,
                row.occupation,
                row.children.join('; '),
                row.hasLogin ? 'Active' : 'No login',
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
                  aria-label="Select all parents on this page"
                />
              </TH>
              <TH>Parent</TH>
              <TH>Contact</TH>
              <TH>Children</TH>
              <TH>Portal access</TH>
              <TH align="right"><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((parent) => (
              <TR key={parent.id}>
                <TD>
                  <Checkbox
                    checked={selection.selected.has(parent.id)}
                    onChange={() => selection.toggle(parent.id)}
                    aria-label={`Select ${parent.firstName} ${parent.lastName}`}
                  />
                </TD>
                <TD>
                  <PersonCell
                    firstName={parent.firstName}
                    lastName={parent.lastName}
                    secondary={parent.occupation ?? undefined}
                    href={`/parents/${parent.id}`}
                  />
                </TD>
                <TD className="text-sm text-ink-muted">
                  {parent.phone ? <span className="block">{parent.phone}</span> : null}
                  {parent.email ? (
                    <span className="block max-w-56 truncate text-xs text-ink-subtle">{parent.email}</span>
                  ) : null}
                  {!parent.phone && !parent.email ? '—' : null}
                </TD>
                <TD className="text-sm text-ink-muted">
                  {parent.childCount === 0 ? (
                    <span className="text-ink-subtle">None linked</span>
                  ) : (
                    <>
                      <span className="block">{parent.children.slice(0, 2).join(', ')}</span>
                      {parent.childCount > 2 ? (
                        <span className="block text-xs text-ink-subtle">+{parent.childCount - 2} more</span>
                      ) : null}
                    </>
                  )}
                </TD>
                <TD>
                  <Badge tone={parent.hasLogin ? 'success' : 'neutral'}>
                    {parent.hasLogin ? 'active' : 'no login'}
                  </Badge>
                </TD>
                <TD align="right">
                  <div className="flex items-center justify-end gap-2">
                    {canEdit ? (
                      <Link
                        href={`/parents/${parent.id}/edit`}
                        className="text-sm text-[var(--brand-600)] hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
                    <Link
                      href={`/parents/${parent.id}`}
                      className="text-sm text-[var(--brand-600)] hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination total={total} page={page} pageSize={pageSize} label="parents" />
    </>
  )
}
