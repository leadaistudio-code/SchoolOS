'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, GraduationCap, Info, RotateCcw, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableToolbar, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { PROMOTION_DECISIONS, type PromotionDecision } from '@/server/modules/students/schema'
import type {
  PromotionCandidate,
  PromotionClass,
  PromotionPlan,
  PromotionSession,
} from '@/server/modules/students/promotion'
import { applyPromotionAction, planPromotionAction } from './actions'

const DECISION_LABEL: Record<PromotionDecision, string> = {
  PROMOTE: 'Move up',
  REPEAT: 'Repeat the year',
  GRADUATE: 'Passed out',
  TRANSFER_OUT: 'Left the school',
  SKIP: 'Leave alone',
}

const DECISION_TONE: Record<PromotionDecision, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  PROMOTE: 'success',
  REPEAT: 'warning',
  GRADUATE: 'info',
  TRANSFER_OUT: 'danger',
  SKIP: 'neutral',
}

/** What the operator has chosen for one child, before anything is committed. */
type Choice = {
  decision: PromotionDecision
  toClassLevelId: string | null
  toSectionId: string | null
}

/**
 * The promotion screen.
 *
 * One page rather than a wizard, because the decision an office makes here is
 * not sequential — they pick a class, glance at who owes money, change three
 * rows, and commit. A wizard would put a page break between the list and the
 * thing that makes the list make sense.
 *
 * Nothing is written until the confirm dialog is accepted, and the dialog
 * states the counts rather than asking "are you sure?", which is a question
 * nobody has ever answered by re-reading the screen.
 */
export function PromotionPlanner({
  sessions,
  currentSessionId,
  classesBySession,
  currency,
}: {
  sessions: PromotionSession[]
  currentSessionId: string | null
  /** Class list per session, so changing the source class needs no round trip. */
  classesBySession: Record<string, { id: string; name: string; numeric: number; sections: { id: string; name: string }[] }[]>
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()

  const defaultFrom = currentSessionId ?? sessions[sessions.length - 1]?.id ?? ''
  const defaultTo =
    sessions.find((s) => {
      const from = sessions.find((x) => x.id === defaultFrom)
      return from ? s.startsOn > from.startsOn : false
    })?.id ?? ''

  const [fromSessionId, setFromSessionId] = React.useState(defaultFrom)
  const [toSessionId, setToSessionId] = React.useState(defaultTo)
  const [fromClassLevelId, setFromClassLevelId] = React.useState('')
  const [fromSectionId, setFromSectionId] = React.useState('')

  const [plan, setPlan] = React.useState<PromotionPlan | null>(null)
  const [choices, setChoices] = React.useState<Record<string, Choice>>({})
  const [rollPolicy, setRollPolicy] = React.useState<'continue' | 'keep'>('continue')
  const [search, setSearch] = React.useState('')

  const [loading, startLoading] = React.useTransition()
  const [applying, startApplying] = React.useTransition()
  const [confirming, setConfirming] = React.useState(false)

  const sourceClasses = classesBySession[fromSessionId] ?? []
  const sourceClass = sourceClasses.find((c) => c.id === fromClassLevelId)

  const toSession = sessions.find((s) => s.id === toSessionId) ?? null

  // Changing any part of the source invalidates a list that was built for the
  // previous one. Showing a stale roll next to a new class name is the one
  // mistake on this screen that a careful operator could not catch.
  React.useEffect(() => {
    setPlan(null)
    setChoices({})
  }, [fromSessionId, toSessionId, fromClassLevelId, fromSectionId])

  const load = () =>
    startLoading(async () => {
      const result = await planPromotionAction({
        fromSessionId,
        toSessionId,
        fromClassLevelId,
        fromSectionId: fromSectionId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not build the list', description: result.message })
        return
      }
      setPlan(result.plan)
      setChoices(
        Object.fromEntries(
          result.plan.candidates.map((c) => [
            c.studentId,
            {
              decision: c.suggestedDecision,
              toClassLevelId: c.suggestedClassLevelId,
              toSectionId: c.suggestedSectionId,
            } satisfies Choice,
          ]),
        ),
      )
    })

  const setChoice = (studentId: string, patch: Partial<Choice>) =>
    setChoices((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, ...patch } }))

  /**
   * Bulk decision.
   *
   * Skips anyone already sitting in the target session: "move everyone up" is
   * an instruction about the class, and a child who has already been moved is
   * not part of it.
   */
  const setAll = (decision: PromotionDecision) => {
    if (!plan) return
    setChoices((prev) => {
      const next = { ...prev }
      for (const candidate of plan.candidates) {
        if (candidate.alreadyPlaced) continue
        const target =
          decision === 'PROMOTE'
            ? plan.nextClass
            : decision === 'REPEAT'
              ? plan.repeatClass
              : null
        next[candidate.studentId] = {
          decision,
          toClassLevelId: target?.id ?? null,
          toSectionId: target ? defaultSectionFor(target, candidate.sectionName) : null,
        }
      }
      return next
    })
  }

  const visible = React.useMemo(() => {
    if (!plan) return []
    const q = search.trim().toLowerCase()
    if (!q) return plan.candidates
    return plan.candidates.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.admissionNo.toLowerCase().includes(q),
    )
  }, [plan, search])

  const counts = React.useMemo(() => {
    const out: Record<PromotionDecision, number> = {
      PROMOTE: 0,
      REPEAT: 0,
      GRADUATE: 0,
      TRANSFER_OUT: 0,
      SKIP: 0,
    }
    for (const choice of Object.values(choices)) out[choice.decision] += 1
    return out
  }, [choices])

  const duesTotal = React.useMemo(() => {
    if (!plan) return 0
    return plan.candidates
      .filter((c) => choices[c.studentId]?.decision === 'PROMOTE')
      .reduce((sum, c) => sum + c.duesMinor, 0)
  }, [plan, choices])

  /** Rows the server will refuse: a move with nowhere to move to. */
  const incomplete = React.useMemo(() => {
    if (!plan) return []
    return plan.candidates.filter((c) => {
      const choice = choices[c.studentId]
      if (!choice) return false
      if (choice.decision !== 'PROMOTE' && choice.decision !== 'REPEAT') return false
      return !choice.toSectionId
    })
  }, [plan, choices])

  const actionable = Object.values(choices).filter((c) => c.decision !== 'SKIP').length

  const apply = () =>
    startApplying(async () => {
      if (!plan) return
      const result = await applyPromotionAction({
        fromSessionId,
        toSessionId,
        rollPolicy,
        decisions: plan.candidates.map((c) => ({
          studentId: c.studentId,
          decision: choices[c.studentId]?.decision ?? 'SKIP',
          toClassLevelId: choices[c.studentId]?.toClassLevelId ?? undefined,
          toSectionId: choices[c.studentId]?.toSectionId ?? undefined,
        })),
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Promotion failed', description: result.message })
        return
      }

      setConfirming(false)
      toast.push({
        tone: 'success',
        title: 'Promotion applied',
        description: result.result.rejected.length
          ? `${result.message}. ${result.result.rejected.length} could not be moved.`
          : result.message,
      })

      if (result.result.rejected.length) {
        // Naming them beats a count: the office has to go and fix these rows.
        toast.push({
          tone: 'error',
          title: 'Not moved',
          description: result.result.rejected
            .slice(0, 4)
            .map((r) => `${r.name} — ${r.reason}`)
            .join('; '),
        })
      }

      setPlan(null)
      setChoices({})
      router.refresh()
    })

  const canPlan = Boolean(fromSessionId && toSessionId && fromClassLevelId && fromSessionId !== toSessionId)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Which class, and into what</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Promote from" htmlFor="from-session" required>
              <Select
                id="from-session"
                value={fromSessionId}
                onChange={(e) => {
                  setFromSessionId(e.target.value)
                  setFromClassLevelId('')
                  setFromSectionId('')
                }}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                    {s.isLocked ? ' — locked' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Promote into" htmlFor="to-session" required>
              <Select
                id="to-session"
                value={toSessionId}
                onChange={(e) => setToSessionId(e.target.value)}
              >
                <option value="">Choose a session</option>
                {sessions
                  .filter((s) => s.id !== fromSessionId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isCurrent ? ' (current)' : ''}
                      {s.isLocked ? ' — locked' : ''}
                      {s.classCount === 0 ? ' — no classes yet' : ''}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Class" htmlFor="from-class" required>
              <Select
                id="from-class"
                value={fromClassLevelId}
                onChange={(e) => {
                  setFromClassLevelId(e.target.value)
                  setFromSectionId('')
                }}
              >
                <option value="">Choose a class</option>
                {sourceClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Section" htmlFor="from-section" hint="Leave blank for the whole class">
              <Select
                id="from-section"
                value={fromSectionId}
                disabled={!sourceClass}
                onChange={(e) => setFromSectionId(e.target.value)}
              >
                <option value="">All sections</option>
                {(sourceClass?.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {toSession && toSession.classCount === 0 ? (
            <Notice tone="warning" title={`${toSession.name} has no classes yet`}>
              Set up the classes and sections for that session first — there is nowhere to promote
              these students into.
            </Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={load} loading={loading} disabled={!canPlan}>
              <Users aria-hidden />
              Build the list
            </Button>
            {plan ? (
              <span className="text-xs text-ink-subtle">
                {plan.candidates.length} student{plan.candidates.length === 1 ? '' : 's'} in{' '}
                {plan.candidates[0]?.className ?? 'this class'}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {plan ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {plan.fromSession.name} <ArrowRight className="inline size-3.5" aria-hidden />{' '}
              {plan.toSession.name}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['PROMOTE', 'REPEAT', 'GRADUATE', 'TRANSFER_OUT'] as PromotionDecision[]).map(
                (decision) => (
                  <Button
                    key={decision}
                    size="sm"
                    variant="ghost"
                    onClick={() => setAll(decision)}
                    disabled={
                      (decision === 'PROMOTE' && !plan.nextClass) ||
                      (decision === 'REPEAT' && !plan.repeatClass)
                    }
                  >
                    All {DECISION_LABEL[decision].toLowerCase()}
                  </Button>
                ),
              )}
            </div>
          </CardHeader>

          {plan.isTerminalClass ? (
            <div className="px-4 pt-4">
              <Notice tone="info" title="This is the top class">
                There is no class above {plan.candidates[0]?.className ?? 'this one'} in{' '}
                {plan.toSession.name}, so everyone here is proposed as passed out. They keep their
                record and their history; they stop appearing on the roll.
              </Notice>
            </div>
          ) : null}

          {!plan.toSession.isCurrent ? (
            <div className="px-4 pt-4">
              <Notice tone="info" title={`${plan.toSession.name} is not the current session yet`}>
                These placements will be written now and stay dormant. Students keep their present
                class until someone switches the school over to {plan.toSession.name} in{' '}
                <span className="font-medium">Settings → Academic sessions</span>.
              </Notice>
            </div>
          ) : null}

          <TableToolbar>
            <div className="relative flex-1 min-w-48">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a student in this list"
                aria-label="Find a student in this list"
                className="h-9 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface pl-8 pr-2.5 text-base text-ink placeholder:text-ink-subtle focus:border-[var(--brand-500)]"
              />
            </div>

            {/* The options name the subject, so a separate visible label would
                say "Roll numbers" twice on one line. */}
            <Select
              aria-label="Roll numbers in the receiving section"
              value={rollPolicy}
              onChange={(e) => setRollPolicy(e.target.value as 'continue' | 'keep')}
              className="w-auto min-w-56"
            >
              <option value="continue">Roll numbers: issue fresh</option>
              <option value="keep">Roll numbers: keep where free</option>
            </Select>
          </TableToolbar>

          <TableWrap sticky>
            <Table>
              <THead sticky>
                <tr>
                  <TH>Student</TH>
                  <TH>Now</TH>
                  <TH align="right">Dues</TH>
                  <TH>What happens</TH>
                  <TH>Goes to</TH>
                </tr>
              </THead>
              <TBody>
                {visible.map((candidate) => (
                  <CandidateRow
                    key={candidate.studentId}
                    candidate={candidate}
                    choice={choices[candidate.studentId]}
                    targetClasses={plan.targetClasses}
                    currency={currency}
                    onChange={(patch) => setChoice(candidate.studentId, patch)}
                  />
                ))}
              </TBody>
            </Table>
          </TableWrap>

          {visible.length === 0 ? (
            <EmptyState
              title={search ? 'Nobody matches that' : 'Nobody is enrolled in this class'}
              description={
                search
                  ? 'Clear the search to see the whole class.'
                  : 'Add students to it before promoting.'
              }
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            <Button
              onClick={() => setConfirming(true)}
              disabled={actionable === 0 || incomplete.length > 0}
            >
              <GraduationCap aria-hidden />
              Review and apply
            </Button>
            <Button variant="ghost" onClick={load} loading={loading}>
              <RotateCcw aria-hidden />
              Reset the list
            </Button>

            <span className="text-xs text-ink-subtle">
              {counts.PROMOTE} moving up · {counts.REPEAT} repeating · {counts.GRADUATE} passing out
              · {counts.TRANSFER_OUT} leaving · {counts.SKIP} untouched
            </span>

            {incomplete.length > 0 ? (
              <span className="text-xs font-medium text-[var(--danger)]">
                {incomplete.length} row{incomplete.length === 1 ? ' has' : 's have'} no section
                chosen
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Apply this promotion"
        description={
          plan
            ? `${plan.fromSession.name} to ${plan.toSession.name}. This writes new placements and cannot be undone from this screen.`
            : undefined
        }
        footer={
          <>
            <Button onClick={apply} loading={applying}>
              Apply to {actionable} student{actionable === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm text-ink">
          {(Object.keys(DECISION_LABEL) as PromotionDecision[])
            .filter((d) => counts[d] > 0)
            .map((decision) => (
              <li key={decision} className="flex items-center gap-2">
                <Badge tone={DECISION_TONE[decision]}>{counts[decision]}</Badge>
                {DECISION_LABEL[decision]}
              </li>
            ))}
        </ul>

        {duesTotal > 0 ? (
          <div className="mt-3">
            <Notice tone="warning" title="Some of these students owe fees">
              {formatMoney(duesTotal, currency)} outstanding across the students moving up. Invoices
              belong to the student, not to the class, so the balance follows them into{' '}
              {plan?.toSession.name} — nothing is written off here.
            </Notice>
          </div>
        ) : null}

        <p className="mt-3 flex gap-2 text-xs text-ink-subtle">
          <Info className="size-4 shrink-0" aria-hidden />
          Last year&apos;s attendance, marks and receipts stay attached to the class each child was
          actually in. Promotion adds a placement; it never edits history.
        </p>
      </Dialog>
    </div>
  )
}

/** Same section letter if the target class has one, else its first section. */
function defaultSectionFor(target: PromotionClass, currentSectionName: string): string | null {
  const sameLetter = target.sections.find(
    (s) => s.name.toLowerCase() === currentSectionName.toLowerCase(),
  )
  return sameLetter?.id ?? target.sections[0]?.id ?? null
}

function CandidateRow({
  candidate,
  choice,
  targetClasses,
  currency,
  onChange,
}: {
  candidate: PromotionCandidate
  choice: Choice | undefined
  targetClasses: PromotionClass[]
  currency: string
  onChange: (patch: Partial<Choice>) => void
}) {
  if (!choice) return null

  const needsTarget = choice.decision === 'PROMOTE' || choice.decision === 'REPEAT'
  const targetClass = targetClasses.find((c) => c.id === choice.toClassLevelId)

  return (
    <TR className={candidate.alreadyPlaced ? 'opacity-60' : undefined}>
      <TD>
        <span className="font-medium text-ink">
          {candidate.firstName} {candidate.lastName}
        </span>
        <span className="block text-xs text-ink-subtle">{candidate.admissionNo}</span>
      </TD>

      <TD>
        {candidate.className} {candidate.sectionName}
        {candidate.rollNumber !== null ? (
          <span className="block text-xs text-ink-subtle tnum">Roll {candidate.rollNumber}</span>
        ) : null}
        {candidate.alreadyPlaced ? (
          <span className="block text-xs text-[var(--warning)]">
            Already in {candidate.placedIn}
          </span>
        ) : null}
      </TD>

      <TD align="right">
        {candidate.duesMinor > 0 ? (
          <span className="text-[var(--danger)] font-medium">
            {formatMoney(candidate.duesMinor, currency)}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </TD>

      <TD>
        <Select
          aria-label={`What happens to ${candidate.firstName} ${candidate.lastName}`}
          value={choice.decision}
          disabled={candidate.alreadyPlaced}
          onChange={(e) => {
            const decision = e.target.value as PromotionDecision
            // Dropping the destination when it no longer applies keeps the
            // "no section chosen" warning honest.
            onChange(
              decision === 'PROMOTE' || decision === 'REPEAT'
                ? { decision }
                : { decision, toClassLevelId: null, toSectionId: null },
            )
          }}
          className="min-w-40"
        >
          {PROMOTION_DECISIONS.map((decision) => (
            <option key={decision} value={decision}>
              {DECISION_LABEL[decision]}
            </option>
          ))}
        </Select>
      </TD>

      <TD>
        {needsTarget ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              aria-label={`Class for ${candidate.firstName} ${candidate.lastName}`}
              value={choice.toClassLevelId ?? ''}
              onChange={(e) => {
                const next = targetClasses.find((c) => c.id === e.target.value)
                onChange({
                  toClassLevelId: e.target.value || null,
                  toSectionId: next ? defaultSectionFor(next, candidate.sectionName) : null,
                })
              }}
              className="min-w-28"
            >
              <option value="">Class…</option>
              {targetClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              aria-label={`Section for ${candidate.firstName} ${candidate.lastName}`}
              value={choice.toSectionId ?? ''}
              disabled={!targetClass}
              onChange={(e) => onChange({ toSectionId: e.target.value || null })}
              className="min-w-24"
            >
              <option value="">Section…</option>
              {(targetClass?.sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.filled >= s.capacity ? ' (full)' : ''}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <Badge tone={DECISION_TONE[choice.decision]}>{DECISION_LABEL[choice.decision]}</Badge>
        )}
      </TD>
    </TR>
  )
}
