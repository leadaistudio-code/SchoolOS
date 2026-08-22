'use client'

import * as React from 'react'
import { Checkbox } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  ATTENDANCE_METHOD_LABEL,
  INSTITUTION_LABEL,
  LEAKAGE_LABEL,
  TOOL_CATALOGUE,
} from '@/lib/roi/assumptions'
import { monthlyTechnologySpend } from '@/lib/roi/calculator'
import { formatInr, formatPercent } from '@/lib/roi/format'
import type {
  AttendanceMethod,
  InstitutionType,
  LeakageBand,
  RoiInputs,
} from '@/lib/roi/types'
import { Aside, MoneyField, NumberField, SelectField, ShareSlider } from './roi-fields'

/**
 * The six input steps.
 *
 * Split by the person who knows the answer rather than by module: the profile
 * and salary questions are the principal's, technology spend is the admin
 * office's, admissions belongs to the counselling team. A single thirty-field
 * page would force one person to guess at all of it.
 */

export type StepProps = {
  inputs: RoiInputs
  set: <K extends keyof RoiInputs>(key: K, value: RoiInputs[K]) => void
  seeded: Set<string>
  errors: Record<string, string>
}

const opts = <T extends string>(record: Record<T, string>) =>
  (Object.keys(record) as T[]).map((value) => ({ value, label: record[value] }))

export function StepProfile({ inputs, set, seeded, errors }: StepProps) {
  const p = inputs.profile
  const patch = (change: Partial<RoiInputs['profile']>) => set('profile', { ...p, ...change })

  return (
    <div className="space-y-4">
      <Aside>
        Salaries are used only to price the hours this calculator says are returned. They are not
        stored against any staff record and nothing here changes payroll.
      </Aside>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="roi-institution"
          label="Institution type"
          value={p.institutionType}
          options={opts<InstitutionType>(INSTITUTION_LABEL)}
          onChange={(v) => patch({ institutionType: v })}
          className="sm:col-span-2"
        />

        <NumberField
          id="roi-students"
          label="Number of students"
          value={p.students}
          seeded={seeded.has('Students on roll')}
          error={errors['profile.students']}
          onChange={(v) => patch({ students: v })}
        />
        <NumberField
          id="roi-teachers"
          label="Number of teachers"
          value={p.teachers}
          seeded={seeded.has('Teaching staff')}
          error={errors['profile.teachers']}
          onChange={(v) => patch({ teachers: v })}
        />
        <NumberField
          id="roi-admin"
          label="Administrative staff"
          value={p.adminStaff}
          seeded={seeded.has('Non-teaching staff')}
          error={errors['profile.adminStaff']}
          onChange={(v) => patch({ adminStaff: v })}
        />
        <NumberField
          id="roi-counsellors"
          label="Admission / counselling staff"
          value={p.admissionStaff}
          hint="How many people chase enquiries"
          error={errors['profile.admissionStaff']}
          onChange={(v) => patch({ admissionStaff: v })}
        />

        <MoneyField
          id="roi-teacher-salary"
          label="Average monthly salary — teacher"
          value={p.teacherSalary}
          error={errors['profile.teacherSalary']}
          onChange={(v) => patch({ teacherSalary: v })}
        />
        <MoneyField
          id="roi-admin-salary"
          label="Average monthly salary — admin staff"
          value={p.adminSalary}
          error={errors['profile.adminSalary']}
          onChange={(v) => patch({ adminSalary: v })}
        />
        <MoneyField
          id="roi-counsellor-salary"
          label="Average monthly salary — counsellor"
          value={p.counsellorSalary}
          error={errors['profile.counsellorSalary']}
          onChange={(v) => patch({ counsellorSalary: v })}
          className="sm:col-span-2"
        />
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm font-medium text-ink">Working pattern</p>
        <p className="mb-3 text-xs text-ink-subtle">
          Used to turn a monthly salary into an hourly cost. Default estimate — change it if your
          school works differently.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="roi-days"
            label="Working days a month"
            value={inputs.working.daysPerMonth}
            error={errors['working.daysPerMonth']}
            min={1}
            max={31}
            onChange={(v) => set('working', { ...inputs.working, daysPerMonth: v })}
          />
          <NumberField
            id="roi-hours"
            label="Working hours a day"
            value={inputs.working.hoursPerDay}
            error={errors['working.hoursPerDay']}
            min={1}
            max={16}
            onChange={(v) => set('working', { ...inputs.working, hoursPerDay: v })}
          />
          <NumberField
            id="roi-school-days"
            label="School days a month"
            value={inputs.working.schoolDaysPerMonth}
            hint="Days attendance is actually taken"
            error={errors['working.schoolDaysPerMonth']}
            min={1}
            max={31}
            onChange={(v) => set('working', { ...inputs.working, schoolDaysPerMonth: v })}
          />
        </div>
      </div>
    </div>
  )
}

export function StepProcesses({ inputs, set, seeded, errors }: StepProps) {
  const a = inputs.attendance

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="roi-attendance-method"
          label="How is attendance taken today?"
          value={a.method}
          options={opts<AttendanceMethod>(ATTENDANCE_METHOD_LABEL)}
          onChange={(v) => set('attendance', { ...a, method: v })}
          hint="This decides how much effort is left to remove"
          className="sm:col-span-2"
        />

        <NumberField
          id="roi-attendance-minutes"
          label="Minutes a day per class"
          value={a.minutesPerDay}
          hint="Marking, correcting and consolidating the register"
          error={errors['attendance.minutesPerDay']}
          onChange={(v) => set('attendance', { ...a, minutesPerDay: v })}
        />
        <NumberField
          id="roi-attendance-users"
          label="Classes taking attendance daily"
          value={a.dailyUsers}
          seeded={seeded.has('Sections taking attendance')}
          error={errors['attendance.dailyUsers']}
          onChange={(v) => set('attendance', { ...a, dailyUsers: v })}
        />
      </div>

      {a.method === 'BIOMETRIC' || a.method === 'EXISTING_ERP' ? (
        <Notice tone="info">
          Attendance is already largely automated here, so the calculator claims only a small
          improvement in this area. Most of the value in your case will come from elsewhere.
        </Notice>
      ) : null}

      <div className="border-t border-line pt-4">
        <p className="mb-1 text-sm font-medium text-ink">Management reporting</p>
        <p className="mb-3 text-xs text-ink-subtle">
          Reports someone assembles by hand each month — attendance, fees, admissions, academics,
          staff, operations.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="roi-reports"
            label="Reports prepared each month"
            value={inputs.reporting.reportsPerMonth}
            error={errors['reporting.reportsPerMonth']}
            onChange={(v) => set('reporting', { ...inputs.reporting, reportsPerMonth: v })}
          />
          <NumberField
            id="roi-report-minutes"
            label="Minutes to prepare each one"
            value={inputs.reporting.minutesPerReport}
            error={errors['reporting.minutesPerReport']}
            onChange={(v) => set('reporting', { ...inputs.reporting, minutesPerReport: v })}
          />
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-1 text-sm font-medium text-ink">Parent communication</p>
        <p className="mb-3 text-xs text-ink-subtle">
          Calling parents, sending reminders, collecting feedback and keeping a record of it.
        </p>
        <NumberField
          id="roi-comm-hours"
          label="Staff hours a week"
          value={inputs.communication.staffHoursPerWeek}
          error={errors['communication.staffHoursPerWeek']}
          onChange={(v) => set('communication', { staffHoursPerWeek: v })}
          className="sm:max-w-xs"
        />
      </div>
    </div>
  )
}

export function StepAdmissionsFees({ inputs, set, seeded, errors }: StepProps) {
  const ad = inputs.admissions
  const conversion =
    ad.enquiriesPerMonth > 0 ? (ad.admissionsPerMonth / ad.enquiriesPerMonth) * 100 : null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="roi-enquiries"
          label="Enquiries a month"
          value={ad.enquiriesPerMonth}
          seeded={seeded.has('Enquiries and conversions in the last month')}
          error={errors['admissions.enquiriesPerMonth']}
          onChange={(v) => set('admissions', { ...ad, enquiriesPerMonth: v })}
        />
        <NumberField
          id="roi-admissions"
          label="Admissions a month"
          value={ad.admissionsPerMonth}
          seeded={seeded.has('Enquiries and conversions in the last month')}
          error={errors['admissions.admissionsPerMonth']}
          onChange={(v) => set('admissions', { ...ad, admissionsPerMonth: v })}
        />
      </div>

      {conversion !== null ? (
        <p className="text-sm text-ink-muted">
          Current conversion rate:{' '}
          <span className="font-semibold text-ink">{formatPercent(conversion, 1)}</span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          id="roi-annual-fee"
          label="Average annual fee per student"
          value={ad.annualFeePerStudent}
          hint="Used only for the revenue scenario"
          error={errors['admissions.annualFeePerStudent']}
          onChange={(v) => set('admissions', { ...ad, annualFeePerStudent: v })}
        />
        <SelectField
          id="roi-leakage"
          label="Enquiries not getting a timely follow-up"
          value={ad.leakageBand}
          options={opts<LeakageBand>(LEAKAGE_LABEL)}
          onChange={(v) => set('admissions', { ...ad, leakageBand: v })}
          hint={ad.leakageBand === 'UNKNOWN' ? 'A conservative default will be used and labelled' : undefined}
        />
        <NumberField
          id="roi-admissions-hours"
          label="Counsellor hours a day on manual follow-up"
          value={ad.staffHoursPerDay}
          hint="Building call lists, updating sheets, checking WhatsApp"
          error={errors['admissions.staffHoursPerDay']}
          onChange={(v) => set('admissions', { ...ad, staffHoursPerDay: v })}
          className="sm:col-span-2"
        />
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm font-medium text-ink">Fees</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            id="roi-fees-due"
            label="Fees invoiced a month"
            value={inputs.fees.monthlyFeesDue}
            seeded={seeded.has('Fees invoiced in the last month')}
            error={errors['fees.monthlyFeesDue']}
            onChange={(v) => set('fees', { ...inputs.fees, monthlyFeesDue: v })}
          />
          <MoneyField
            id="roi-overdue"
            label="Currently overdue"
            value={inputs.fees.overdueAmount}
            seeded={seeded.has('Outstanding fee book')}
            error={errors['fees.overdueAmount']}
            onChange={(v) => set('fees', { ...inputs.fees, overdueAmount: v })}
          />
          <NumberField
            id="roi-fee-hours"
            label="Staff hours a month chasing fees"
            value={inputs.fees.staffHoursPerMonth}
            hint="Preparing outstanding lists and reconciling receipts"
            error={errors['fees.staffHoursPerMonth']}
            onChange={(v) => set('fees', { ...inputs.fees, staffHoursPerMonth: v })}
            className="sm:col-span-2"
          />
        </div>
      </div>

      <Aside>
        Overdue fees are money your school is already owed. The calculator treats faster recovery as
        a cash-flow improvement, never as new revenue, and keeps it out of the headline ROI unless
        you switch it on.
      </Aside>
    </div>
  )
}

export function StepStaffProductivity({ inputs, set, errors }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Papers your teachers write from scratch today. MyCampusView assembles one from the question
        bank against a blueprint — the judgement still belongs to the teacher, the retyping does not.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="roi-papers"
          label="Question papers per teacher a month"
          value={inputs.questionPapers.papersPerTeacherPerMonth}
          error={errors['questionPapers.papersPerTeacherPerMonth']}
          onChange={(v) =>
            set('questionPapers', { ...inputs.questionPapers, papersPerTeacherPerMonth: v })
          }
        />
        <NumberField
          id="roi-paper-minutes"
          label="Minutes per paper today"
          value={inputs.questionPapers.minutesPerPaper}
          error={errors['questionPapers.minutesPerPaper']}
          onChange={(v) => set('questionPapers', { ...inputs.questionPapers, minutesPerPaper: v })}
        />
      </div>

      <Notice tone="info" title="This is productivity value, not a salary saving">
        Hours returned to teachers are counted at what those hours cost, because that is what the
        time is worth. It is not a suggestion that fewer teachers are needed — the value is the time
        going back into teaching.
      </Notice>
    </div>
  )
}

export function StepTechnology({ inputs, set, errors }: StepProps) {
  const t = inputs.technology
  const patch = (change: Partial<RoiInputs['technology']>) => set('technology', { ...t, ...change })
  const spend = monthlyTechnologySpend(inputs)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <MoneyField
          id="roi-erp-cost"
          label="Current ERP / school software"
          value={t.currentErpCost}
          error={errors['technology.currentErpCost']}
          onChange={(v) => patch({ currentErpCost: v })}
        />
        <SelectField
          id="roi-erp-billing"
          label="Billed"
          value={t.currentErpBilling}
          options={[
            { value: 'MONTHLY' as const, label: 'Monthly' },
            { value: 'ANNUAL' as const, label: 'Annual' },
          ]}
          onChange={(v) => patch({ currentErpBilling: v })}
        />
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-1 text-sm font-medium text-ink">Other tools you pay for</p>
        <p className="mb-3 text-xs text-ink-subtle">
          Monthly cost. Leave anything you do not use at zero.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {t.tools.map((tool, index) => {
            const meta = TOOL_CATALOGUE.find((c) => c.key === tool.key)
            return (
              <MoneyField
                key={tool.key}
                id={`roi-tool-${tool.key}`}
                label={tool.label}
                hint={meta?.note}
                value={tool.monthlyCost}
                onChange={(v) => {
                  const next = [...t.tools]
                  next[index] = { ...tool, monthlyCost: v }
                  patch({ tools: next })
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3">
        <p className="text-sm text-ink">
          Current technology spend:{' '}
          <span className="font-semibold tnum">{formatInr(spend)}</span> a month
        </p>
      </div>

      <ShareSlider
        id="roi-replaced"
        label="Share of that spend MyCampusView replaces"
        value={t.replacedShare}
        onChange={(v) => patch({ replacedShare: v })}
        hint={`${formatInr(spend * t.replacedShare)} a month. Never assume everything goes — a school often keeps its accounting package or a hardware contract.`}
      />
    </div>
  )
}

export function StepInvestment({ inputs, set, seeded, errors }: StepProps) {
  const p = inputs.platform
  const patch = (change: Partial<RoiInputs['platform']>) => set('platform', { ...p, ...change })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          id="roi-subscription"
          label="MyCampusView monthly subscription"
          value={p.monthlySubscription}
          seeded={[...seeded].some((s) => s.startsWith('MyCampusView plan'))}
          error={errors['platform.monthlySubscription']}
          onChange={(v) => patch({ monthlySubscription: v })}
        />
        <MoneyField
          id="roi-addons"
          label="Optional add-ons a month"
          value={p.addOnsMonthly}
          error={errors['platform.addOnsMonthly']}
          onChange={(v) => patch({ addOnsMonthly: v })}
        />
        <MoneyField
          id="roi-implementation"
          label="One-time implementation / setup"
          value={p.implementationCost}
          hint="Used for the payback period"
          error={errors['platform.implementationCost']}
          onChange={(v) => patch({ implementationCost: v })}
          className="sm:col-span-2"
        />
      </div>

      <div className="border-t border-line pt-4">
        <label className="flex items-start gap-2.5">
          <Checkbox
            checked={inputs.includeRevenueInRoi}
            onChange={(e) => set('includeRevenueInRoi', e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Include the revenue scenario in the headline ROI
            </span>
            <span className="block text-xs text-ink-subtle">
              Off by default. Recovered admissions and faster fee collection are scenarios, not
              commitments — leaving this off gives you the number that is hardest to argue with.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}
