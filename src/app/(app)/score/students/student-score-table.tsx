'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { bandMeta, type ComposedScore } from '@/lib/score'
import { Badge } from '@/components/ui/badge'

export type StudentScoreRow = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  className: string
  sectionName: string
  rollNumber: number | null
  composed: ComposedScore
}

/**
 * Every student, ranked.
 *
 * Rows open in place rather than linking away to explain themselves. Somebody
 * scanning a class for problems is comparing children against each other, and
 * sending them to a detail page and back for each one would destroy the
 * comparison they are in the middle of making.
 */
export function StudentScoreTable({ rows }: { rows: StudentScoreRow[] }) {
  const [open, setOpen] = React.useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No students match this view"
        description="Clear the filters, or check that the class has students enrolled in the current session."
      />
    )
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH align="right">#</TH>
            <TH>Student</TH>
            <TH>Class</TH>
            <TH align="right">Score</TH>
            <TH>Band</TH>
            <TH>Weakest area</TH>
            <TH align="right">Why</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row, index) => {
            const expanded = open === row.studentId
            const weakest = row.composed.parts
              .filter((p) => p.score !== null)
              .sort((a, b) => a.score! - b.score!)[0]

            return (
              <React.Fragment key={row.studentId}>
                <TR>
                  <TD align="right" className="text-ink-subtle">
                    {index + 1}
                  </TD>
                  <TD>
                    <Link
                      href={`/students/${row.studentId}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {row.firstName} {row.lastName}
                    </Link>
                    <span className="block text-xs text-ink-subtle">{row.admissionNo}</span>
                  </TD>
                  <TD>
                    {row.className} {row.sectionName}
                    {row.rollNumber !== null ? (
                      <span className="block text-xs text-ink-subtle tnum">
                        Roll {row.rollNumber}
                      </span>
                    ) : null}
                  </TD>
                  <TD align="right" className="font-semibold text-ink">
                    {row.composed.score === null ? '—' : row.composed.score.toFixed(1)}
                  </TD>
                  <TD>
                    {row.composed.band ? (
                      <Badge tone={bandMeta(row.composed.band).tone}>
                        {bandMeta(row.composed.band).label}
                      </Badge>
                    ) : (
                      <span className="text-ink-subtle">Not scored</span>
                    )}
                  </TD>
                  <TD>
                    {weakest ? (
                      <>
                        <span className="text-ink">{weakest.label}</span>
                        <span className="block text-xs text-ink-subtle tnum">
                          {weakest.score!.toFixed(0)} / 100
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </TD>
                  <TD align="right">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : row.studentId)}
                      aria-expanded={expanded}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                    >
                      {expanded ? 'Hide' : 'Explain'}
                      <ChevronDown
                        className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                        aria-hidden
                      />
                    </button>
                  </TD>
                </TR>

                {expanded ? (
                  <tr className="bg-surface-2">
                    <td colSpan={7} className="px-4 py-3">
                      <p className="mb-2 text-xs text-ink-subtle">
                        {row.composed.coverage >= 0.999
                          ? 'Every weighted area had something to read.'
                          : `Built on ${Math.round(row.composed.coverage * 100)}% of the weighting — the rest had nothing recorded and was shared out across what did.`}
                      </p>

                      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                        {row.composed.parts.map((part) => (
                          <div
                            key={part.metric}
                            className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0"
                          >
                            <div className="min-w-0">
                              <span className="text-sm text-ink">{part.label}</span>
                              <span className="block text-xs text-ink-subtle">{part.detail}</span>
                            </div>
                            <span className="shrink-0 text-sm tnum">
                              {part.score === null ? (
                                <span className="text-ink-subtle">—</span>
                              ) : (
                                <>
                                  <span className="font-medium text-ink">
                                    {part.score.toFixed(0)}
                                  </span>
                                  <span className="text-ink-subtle">
                                    {' '}
                                    × {(part.effectiveShare * 100).toFixed(0)}%
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
        </TBody>
      </Table>
    </TableWrap>
  )
}
