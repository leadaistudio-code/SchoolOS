'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileOutput, Loader2 } from 'lucide-react'
import { issueTcAction, loadTcPrefillAction } from '../actions'
import type { TcDetails } from '@/server/modules/students/transfer-certificates'
import { StudentPicker, type StudentHit } from '@/components/student-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, FormActions, FormSection, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { classInWords, dateToWords } from '@/lib/words'

type Prefill = {
  student: {
    id: string
    admissionNo: string
    name: string
    photoUrl: string | null
    status: string
    hasLogin: boolean
    className: string | null
  }
  details: TcDetails
  outstandingMinor: number
  activeTc: { id: string; number: string } | null
}

const REASONS = [
  'Parent’s request',
  'Transfer of parent / relocation',
  'Completed the course',
  'Admission in another school',
  'Financial reasons',
  'Health reasons',
  'Other',
]

const today = () => new Date().toISOString().slice(0, 10)
const rupees = (minor: number) =>
  (minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function TcForm({ initialStudent }: { initialStudent: StudentHit | null }) {
  const router = useRouter()
  const { push } = useToast()
  const [student, setStudent] = React.useState<StudentHit | null>(initialStudent)
  const [prefill, setPrefill] = React.useState<Prefill | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [d, setD] = React.useState<TcDetails | null>(null)
  const [bookNo, setBookNo] = React.useState('')
  const [applicationDate, setApplicationDate] = React.useState(today())
  const [issuedOn, setIssuedOn] = React.useState(today())
  const [reason, setReason] = React.useState(REASONS[0]!)
  const [otherReason, setOtherReason] = React.useState('')
  const [disableLogin, setDisableLogin] = React.useState(true)
  const [confirmed, setConfirmed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setPrefill(null)
    setD(null)
    setConfirmed(false)
    if (!student) return
    let live = true
    setLoading(true)
    loadTcPrefillAction(student.id).then((res) => {
      if (!live) return
      setLoading(false)
      if (!res.ok) {
        push({ tone: 'error', title: res.message })
        return
      }
      setPrefill(res.data as Prefill)
      setD(res.data.details)
    })
    return () => {
      live = false
    }
  }, [student, push])

  const set = <K extends keyof TcDetails>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setD((cur) => (cur ? { ...cur, [key]: e.target.value } : cur))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!student || !d) return
    setSaving(true)
    const res = await issueTcAction({
      studentId: student.id,
      bookNo,
      applicationDate,
      issuedOn,
      reason: reason === 'Other' ? otherReason : reason,
      disableLogin,
      details: d,
    })
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok && res.id) router.push(`/students/transfer-certificates/${res.id}`)
  }

  const text = (key: keyof TcDetails, label: string, opts?: { placeholder?: string; hint?: string; required?: boolean }) => (
    <Field label={label} htmlFor={`tc-${key}`} hint={opts?.hint} required={opts?.required}>
      <Input id={`tc-${key}`} value={d?.[key] ?? ''} onChange={set(key)} placeholder={opts?.placeholder} required={opts?.required} />
    </Field>
  )
  const choice = (key: keyof TcDetails, label: string, options: string[]) => (
    <Field label={label} htmlFor={`tc-${key}`}>
      <Select id={`tc-${key}`} value={d?.[key] ?? ''} onChange={set(key)}>
        {!options.includes(d?.[key] ?? '') && d?.[key] ? <option value={d[key]}>{d[key]}</option> : null}
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </Field>
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">1. Student selection</h2>
          <StudentPicker value={student} onChange={setStudent} autoFocus={!initialStudent} />
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Reading the student register…
            </p>
          ) : null}
          {prefill?.activeTc ? (
            <Notice tone="warning" title={`TC ${prefill.activeTc.number} is already issued`}>
              Cancel that certificate first if it has to be reissued.
            </Notice>
          ) : null}
          {prefill && prefill.outstandingMinor > 0 ? (
            <Notice tone="warning" title={`Outstanding fees: ${rupees(prefill.outstandingMinor)}`}>
              Clear or waive the dues before issuing, or record the position in the remarks.
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      {d && prefill && !prefill.activeTc ? (
        <>
          <Card>
            <CardContent className="space-y-6 p-4 sm:p-5">
              <FormSection title="Header & meta" description="Printed at the top of the certificate. Affiliation details are remembered for next time.">
                <Field label="Book no." htmlFor="tc-book">
                  <Input id="tc-book" value={bookNo} onChange={(e) => setBookNo(e.target.value)} placeholder="e.g. 12" />
                </Field>
                {text('affiliationNo', 'Affiliation no.')}
                {text('schoolCode', 'School code')}
                {text('renewedUpto', 'Affiliation renewed upto', { placeholder: 'e.g. 31-03-2029' })}
              </FormSection>

              <FormSection title="Student particulars">
                {text('studentName', 'Name of pupil', { required: true })}
                {text('motherName', 'Mother’s name')}
                {text('fatherName', 'Father’s / guardian’s name')}
                {text('nationality', 'Nationality')}
                {choice('belongsToReserved', 'Belongs to SC / ST / OBC', ['No', 'SC', 'ST', 'OBC'])}
                <Field label="Date of birth (as per admission register)" htmlFor="tc-dob">
                  <Input
                    id="tc-dob"
                    type="date"
                    value={d.dateOfBirth}
                    onChange={(e) => {
                      const v = e.target.value
                      setD((cur) => cur && {
                        ...cur,
                        dateOfBirth: v,
                        dateOfBirthWords: v ? dateToWords(new Date(`${v}T00:00:00Z`)) : '',
                      })
                    }}
                  />
                </Field>
                <Field label="Date of birth in words" htmlFor="tc-dobw" className="sm:col-span-2">
                  <Input id="tc-dobw" value={d.dateOfBirthWords} onChange={set('dateOfBirthWords')} />
                </Field>
              </FormSection>

              <FormSection title="Admission & class history">
                <Field label="Date of first admission" htmlFor="tc-adm">
                  <Input id="tc-adm" type="date" value={d.admissionDate} onChange={set('admissionDate')} />
                </Field>
                {text('admissionClass', 'Class at first admission')}
                <Field label="Class last studied (figures)" htmlFor="tc-last">
                  <Input
                    id="tc-last"
                    value={d.lastClass}
                    onChange={(e) => {
                      const v = e.target.value
                      setD((cur) => cur && { ...cur, lastClass: v, lastClassWords: classInWords(v) })
                    }}
                  />
                </Field>
                {text('lastClassWords', 'Class last studied (words)')}
                <Field label="Subjects studied" htmlFor="tc-subjects" className="sm:col-span-2">
                  <Textarea id="tc-subjects" rows={2} value={d.subjects} onChange={set('subjects')} />
                </Field>
              </FormSection>

              <FormSection title="Results & promotion">
                {text('examTaken', 'School / board annual exam last taken')}
                {choice('examResult', 'Result', ['Passed', 'Failed', 'Compartment', 'Result awaited', 'N.A.'])}
                {choice('failedInSameClass', 'Failed in the same class', ['No', 'Once', 'Twice'])}
                {choice('qualifiedForPromotion', 'Qualified for promotion', ['Yes', 'No', 'N.A.'])}
                <Field label="Promoted to class (figures)" htmlFor="tc-prom">
                  <Input
                    id="tc-prom"
                    value={d.promotedTo}
                    onChange={(e) => {
                      const v = e.target.value
                      setD((cur) => cur && { ...cur, promotedTo: v, promotedToWords: classInWords(v) })
                    }}
                  />
                </Field>
                {text('promotedToWords', 'Promoted to class (words)')}
              </FormSection>

              <FormSection title="Dues & activities">
                {text('feesPaidUpto', 'School dues paid upto (month)', { placeholder: 'e.g. March 2027' })}
                {text('feeConcession', 'Fee concession, if any (nature)')}
                {choice('nccScoutGuide', 'NCC cadet / Boy Scout / Girl Guide', ['No', 'NCC Cadet', 'Boy Scout', 'Girl Guide'])}
                {text('gamesActivities', 'Games / extra-curricular activities')}
              </FormSection>

              <FormSection title="Attendance" description="Counted from the attendance register for the current session.">
                {text('workingDays', 'Total working days')}
                {text('daysPresent', 'Total days present')}
              </FormSection>

              <FormSection title="Dates & reason">
                {choice('generalConduct', 'General conduct', ['Excellent', 'Very Good', 'Good', 'Satisfactory'])}
                <Field label="Date of application for certificate" htmlFor="tc-app">
                  <Input id="tc-app" type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
                </Field>
                <Field label="Date of issue" htmlFor="tc-issue" required>
                  <Input id="tc-issue" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} required />
                </Field>
                <Field label="Reason for leaving" htmlFor="tc-reason">
                  <Select id="tc-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                {reason === 'Other' ? (
                  <Field label="Reason (details)" htmlFor="tc-other" className="sm:col-span-2">
                    <Input id="tc-other" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
                  </Field>
                ) : null}
                <Field label="Any other remarks" htmlFor="tc-remarks" className="sm:col-span-2">
                  <Textarea id="tc-remarks" rows={2} value={d.remarks} onChange={set('remarks')} />
                </Field>
              </FormSection>
            </CardContent>
          </Card>

          <Card className="border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-start gap-2 text-sm text-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
                <span>
                  Issuing marks <strong>{prefill.student.name}</strong> as <strong>Transferred</strong>, removes
                  them from class lists and fee runs
                  {prefill.student.hasLogin ? ', and can switch off their portal login' : ''}. A cancelled TC
                  restores the student.
                </span>
              </p>
              {prefill.student.hasLogin ? (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox checked={disableLogin} onChange={(e) => setDisableLogin(e.target.checked)} />
                  Disable the student’s login and sign them out everywhere
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-ink">
                <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I have checked the particulars against the admission register
              </label>
            </CardContent>
          </Card>

          <FormActions>
            <Button type="submit" variant="danger" disabled={!confirmed || saving}>
              <FileOutput aria-hidden /> {saving ? 'Issuing…' : 'Confirm & issue TC'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
          </FormActions>
        </>
      ) : null}
    </form>
  )
}
