'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Send } from 'lucide-react'
import { applyLeaveAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import type { ScopedStudent } from '@/server/scope'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { toDateInput } from '@/lib/dates'

type LeaveTypeOption = { id: string; name: string; isPaid: boolean }

export function LeaveForm({
  students,
  studentLeaveTypes,
  staffLeaveTypes,
  canApplyAsStaff,
  canApplyForStudent,
}: {
  students: ScopedStudent[]
  studentLeaveTypes: LeaveTypeOption[]
  staffLeaveTypes: LeaveTypeOption[]
  canApplyAsStaff: boolean
  canApplyForStudent: boolean
}) {
  const [state, formAction, pending] = useActionState(applyLeaveAction, emptyFormState)

  const [applicantType, setApplicantType] = React.useState<'STUDENT' | 'STAFF'>(
    canApplyForStudent ? 'STUDENT' : 'STAFF',
  )
  const today = toDateInput(new Date())
  const [fromDate, setFromDate] = React.useState(today)

  const types = applicantType === 'STUDENT' ? studentLeaveTypes : staffLeaveTypes
  const err = (f: string) => state.fieldErrors[f]

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
            >
              <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
              <p className="text-[13px] text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          {canApplyForStudent && canApplyAsStaff ? (
            <Field label="This leave is for" htmlFor="applicantType" required>
              <Select
                id="applicantType"
                name="applicantType"
                value={applicantType}
                onChange={(e) => setApplicantType(e.target.value as 'STUDENT' | 'STAFF')}
              >
                <option value="STUDENT">A student</option>
                <option value="STAFF">Myself (staff)</option>
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="applicantType" value={applicantType} />
          )}

          {applicantType === 'STUDENT' ? (
            <Field label="Student" htmlFor="studentId" required error={err('studentId')}>
              <Select id="studentId" name="studentId" required defaultValue={students[0]?.id ?? ''}>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                    {s.className ? ` — ${s.className} ${s.sectionName ?? ''}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Leave type" htmlFor="leaveTypeId" error={err('leaveTypeId')}>
            <Select id="leaveTypeId" name="leaveTypeId" defaultValue="">
              <option value="">Not specified</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isPaid ? '' : ' (unpaid)'}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="fromDate" required error={err('fromDate')}>
              <Input
                id="fromDate"
                name="fromDate"
                type="date"
                required
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="toDate" required error={err('toDate')}>
              {/* min prevents the commonest mistake before the server has to reject it */}
              <Input id="toDate" name="toDate" type="date" required min={fromDate} defaultValue={today} />
            </Field>
          </div>

          <Field
            label="Reason"
            htmlFor="reason"
            required
            error={err('reason')}
            hint="Visible to the approver and kept on the record"
          >
            <Textarea
              id="reason"
              name="reason"
              required
              rows={4}
              placeholder="e.g. Fever, advised rest for two days"
            />
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              <Send className="size-4" aria-hidden />
              Submit request
            </Button>
            <Link href="/leave" className={buttonVariants({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
