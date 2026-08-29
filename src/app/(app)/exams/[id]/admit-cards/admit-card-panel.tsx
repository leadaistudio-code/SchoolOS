'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, RefreshCw, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import {
  approveAdmitCardAction,
  generateAdmitCardsAction,
  refreshAdmitCardFeesAction,
  rejectAdmitCardAction,
} from '../../admit-cards/actions'

type Row = {
  id: string
  number: string
  status: string
  feeDueMinor: number
  rejectedReason: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
    photoUrl: string | null
    enrollments: {
      classLevel: { name: string }
      section: { name: string } | null
      rollNumber: number | null
    }[]
  }
}

export function AdmitCardPanel({
  examId,
  rows,
  canGenerate,
  canApprove,
}: {
  examId: string
  rows: Row[]
  canGenerate: boolean
  canApprove: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, title: string) =>
    startTransition(async () => {
      const result = await fn()
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title,
        description: result.message,
      })
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canGenerate ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => generateAdmitCardsAction(examId), 'Generate')}>
              <UserPlus aria-hidden /> Generate for all students
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || rows.length === 0}
              onClick={() => run(() => refreshAdmitCardFeesAction(examId), 'Refresh fees')}
            >
              <RefreshCw aria-hidden /> Refresh fee status
            </Button>
          </>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No admit cards yet. Generate cards for every student enrolled in this exam&apos;s classes. The
          principal approves each card after confirming fees are paid.
        </p>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Class</TH>
                <TH>Fee due</TH>
                <TH>Status</TH>
                <TH align="right"> </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const enrollment = row.student.enrollments[0]
                const classLabel = enrollment
                  ? `${enrollment.classLevel.name}${enrollment.section ? ` · ${enrollment.section.name}` : ''}`
                  : '—'
                return (
                  <TR key={row.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        {row.student.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.student.photoUrl}
                            alt=""
                            className="size-8 rounded-full object-cover border border-line"
                          />
                        ) : (
                          <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-xs text-ink-subtle">
                            {row.student.firstName[0]}
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {row.student.firstName} {row.student.lastName}
                          </p>
                          <p className="text-xs text-ink-subtle">{row.student.admissionNo}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-sm text-ink-muted">{classLabel}</TD>
                    <TD className="text-sm tnum">
                      {row.feeDueMinor > 0 ? (
                        <span className="text-[var(--danger)]">{formatMoney(row.feeDueMinor)}</span>
                      ) : (
                        <span className="text-[var(--success)]">Clear</span>
                      )}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          row.status === 'APPROVED'
                            ? 'success'
                            : row.status === 'REJECTED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {row.status.toLowerCase()}
                      </Badge>
                      {row.rejectedReason ? (
                        <p className="text-xs text-ink-subtle mt-0.5">{row.rejectedReason}</p>
                      ) : null}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        {row.status === 'APPROVED' ? (
                          <Link
                            href={`/exams/admit-cards/${row.id}`}
                            className="text-sm font-medium text-brand-600 hover:underline"
                          >
                            Print
                          </Link>
                        ) : canApprove && row.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending || row.feeDueMinor > 0}
                              title={
                                row.feeDueMinor > 0
                                  ? 'Fees must be cleared before approval'
                                  : 'Approve admit card'
                              }
                              onClick={() =>
                                run(() => approveAdmitCardAction(row.id, examId), 'Approve')
                              }
                            >
                              <Check aria-hidden /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt('Reason for rejection?')
                                if (!reason?.trim()) return
                                run(
                                  () => rejectAdmitCardAction(row.id, examId, reason.trim()),
                                  'Reject',
                                )
                              }}
                            >
                              <X aria-hidden />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  )
}
