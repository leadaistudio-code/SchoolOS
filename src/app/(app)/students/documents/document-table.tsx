'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Download, Trash2 } from 'lucide-react'
import { Table, TableWrap, TBody, TD, TH, THead, TR, RowActions } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { useToast } from '@/components/ui/toast'
import { documentCategoryLabel, expiryState } from '@/lib/student-documents'
import type { StudentDocumentRow } from '@/server/modules/students/documents'
import { deleteStudentDocumentAction, setDocumentVerifiedAction } from './actions'

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export function DocumentTable({
  rows,
  total,
  page,
  pageSize,
  canManage,
}: {
  rows: StudentDocumentRow[]
  total: number
  page: number
  pageSize: number
  canManage: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [removing, setRemoving] = React.useState<StudentDocumentRow | null>(null)

  const toggleVerified = (row: StudentDocumentRow) =>
    startTransition(async () => {
      const result = await setDocumentVerifiedAction(row.id, !row.isVerified, row.student.id)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Document updated' : 'Could not update',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      if (!removing) return
      const result = await deleteStudentDocumentAction(removing.id, removing.student.id)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Document removed' : 'Could not remove',
        description: result.message,
      })
      if (result.ok) {
        setRemoving(null)
        router.refresh()
      }
    })

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No documents match this view"
        description="Clear the filters, or upload the first paper against a student record."
      />
    )
  }

  return (
    <>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Document</TH>
              <TH>Type</TH>
              <TH>Valid until</TH>
              <TH>Added</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const expiry = expiryState(row.expiresOn)
              return (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/students/${row.student.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {row.student.firstName} {row.student.lastName}
                    </Link>
                    <span className="block text-xs text-ink-subtle">
                      {row.student.admissionNo}
                      {row.student.className
                        ? ` · ${row.student.className} ${row.student.sectionName ?? ''}`
                        : ''}
                    </span>
                  </TD>

                  <TD>
                    <span className="text-ink">{row.title}</span>
                    <span className="block text-xs text-ink-subtle">
                      {fileSize(row.sizeBytes)}
                      {row.uploadedBy ? ` · ${row.uploadedBy}` : ''}
                    </span>
                  </TD>

                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{documentCategoryLabel(row.category)}</span>
                      {row.isVerified ? (
                        <Badge tone="success" dot>
                          checked
                        </Badge>
                      ) : null}
                    </div>
                  </TD>

                  <TD>
                    {row.expiresOn ? (
                      <span
                        className={
                          expiry === 'expired'
                            ? 'text-[var(--danger)] font-medium'
                            : expiry === 'soon'
                              ? 'text-warning font-medium'
                              : undefined
                        }
                      >
                        {DATE.format(new Date(row.expiresOn))}
                        {expiry === 'expired' ? ' — expired' : ''}
                      </span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </TD>

                  <TD>{DATE.format(new Date(row.createdAt))}</TD>

                  <TD align="right">
                    <RowActions>
                      <a
                        href={`/api/v1/files/${encodeURIComponent(row.storageKey)}`}
                        className="text-ink-subtle hover:text-ink"
                        aria-label={`Download ${row.title}`}
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                      {canManage ? (
                        <>
                          <IconButton
                            variant="ghost"
                            small
                            label={
                              row.isVerified
                                ? `Remove the check on ${row.title}`
                                : `Mark ${row.title} as checked`
                            }
                            disabled={pending}
                            onClick={() => toggleVerified(row)}
                          >
                            <BadgeCheck
                              className={row.isVerified ? 'text-success' : undefined}
                              aria-hidden
                            />
                          </IconButton>
                          <IconButton
                            variant="ghost"
                            small
                            label={`Remove ${row.title}`}
                            onClick={() => setRemoving(row)}
                          >
                            <Trash2 aria-hidden />
                          </IconButton>
                        </>
                      ) : null}
                    </RowActions>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </TableWrap>

      <Pagination total={total} page={page} pageSize={pageSize} label="documents" />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this document"
        description={
          removing
            ? `${removing.title}, filed against ${removing.student.firstName} ${removing.student.lastName}.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="danger" onClick={remove} loading={pending}>
              Remove it
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          The file itself is deleted from storage and cannot be recovered. The record that it
          existed — who uploaded it and who removed it — stays in the audit log.
        </p>
      </Dialog>
    </>
  )
}
