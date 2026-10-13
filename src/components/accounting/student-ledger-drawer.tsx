'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { Metric } from '@/components/ui/metric'
import { EmptyState, ErrorState, Notice, TableSkeleton } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { getStudentLedger } from '@/server/modules/accounting/student-ledger-service'
import type { LedgerEntryKind, LedgerRow } from '@/server/modules/accounting/student-ledger'

type Ledger = Awaited<ReturnType<typeof getStudentLedger>>

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: Ledger }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string }

const KIND_LABEL: Record<LedgerEntryKind, string> = {
  DEMAND: 'Demands',
  LATE_FEE: 'Late fees',
  CONCESSION: 'Concessions / waivers',
  RECEIPT: 'Receipts',
  ADVANCE: 'Advance adjustments',
  REFUND: 'Refunds',
  REVERSAL: 'Reversals',
}

const PAGE_SIZE = 50

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00.000Z`))
}

/**
 * The Student 360 Fees metric, made clickable. Rendered only when the student
 * ledger flag is on; with it off the page renders the plain `Metric` exactly
 * as before.
 */
export function FeesLedgerMetric({
  studentId,
  currency,
  label,
  value,
  sub,
  emphasis,
}: {
  studentId: string
  currency: string
  label: string
  value: string
  sub?: React.ReactNode
  emphasis?: 'danger' | 'warning' | 'success'
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`${label}: ${value}. Open fee statement`}
        title="Open fee statement"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--product-500)] focus-visible:ring-inset"
      >
        <Metric label={label} value={value} sub={sub} emphasis={emphasis} className="h-full" />
      </div>
      {open ? (
        <StudentLedgerDrawer studentId={studentId} currency={currency} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function StudentLedgerDrawer({
  studentId,
  currency,
  onClose,
}: {
  studentId: string
  currency: string
  onClose: () => void
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  })

  const [fy, setFy] = React.useState('all')
  const [kind, setKind] = React.useState<LedgerEntryKind | ''>('')
  const [page, setPage] = React.useState(1)
  const [tab, setTab] = React.useState<'statement' | 'diagnostics'>('statement')
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<LoadState>({ status: 'loading' })
  const [expanded, setExpanded] = React.useState<string | null>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    const params = new URLSearchParams({ fy, page: String(page), pageSize: String(PAGE_SIZE) })
    if (kind) params.set('kind', kind)
    fetch(`/api/v1/accounting/students/${encodeURIComponent(studentId)}/ledger?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { data: Ledger | null; error: { message?: string } | null }
          | null
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'denied', message: body?.error?.message ?? 'You do not have access to this statement.' })
          return
        }
        if (!res.ok || !body?.data) {
          setState({ status: 'error', message: body?.error?.message ?? 'The statement could not be loaded.' })
          return
        }
        setState({ status: 'ready', data: body.data })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Network error' })
      })
    return () => controller.abort()
  }, [studentId, fy, kind, page, attempt])

  const data = state.status === 'ready' ? state.data : null
  const totalPages = data ? Math.max(1, Math.ceil(data.totalRows / data.pageSize)) : 1

  function chooseFy(next: string) {
    setFy(next)
    setPage(1)
    setExpanded(null)
  }
  function chooseKind(next: LedgerEntryKind | '') {
    setKind(next)
    setPage(1)
    setExpanded(null)
    setTab('statement')
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Fee statement"
        className="h-full w-full max-w-5xl flex flex-col bg-surface border-l border-line shadow-[var(--shadow-pop)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Fee statement</h2>
            <p className="text-sm text-ink-muted mt-0.5 truncate">
              {data ? `${data.student.name} · ${data.student.admissionNo}` : 'Statement of account'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fee statement"
            className="size-7 grid place-items-center rounded-[var(--radius-sm)] text-ink-subtle hover:bg-surface-2 hover:text-ink shrink-0"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line shrink-0">
          <label className="text-xs text-ink-muted" htmlFor="ledger-fy">
            Financial year
          </label>
          <select
            id="ledger-fy"
            value={fy}
            onChange={(e) => chooseFy(e.target.value)}
            className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="all">All years (cumulative)</option>
            {(data?.fiscalYears ?? []).map((y) => (
              <option key={y.label} value={y.label}>
                FY {y.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-ink-muted ml-2" htmlFor="ledger-kind">
            Show
          </label>
          <select
            id="ledger-kind"
            value={kind}
            onChange={(e) => chooseKind(e.target.value as LedgerEntryKind | '')}
            className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="">All entries</option>
            {(Object.keys(KIND_LABEL) as LedgerEntryKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {data?.reconciliation ? (
            <div className="ml-auto flex gap-1" role="tablist">
              {(['statement', 'diagnostics'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'h-8 px-3 rounded-[var(--radius-sm)] text-sm',
                    tab === t ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {t === 'statement' ? 'Statement' : 'Reconciliation'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
          {state.status === 'loading' ? <TableSkeleton rows={10} cols={7} /> : null}
          {state.status === 'denied' ? (
            <ErrorState title="No access to this statement" description={state.message} />
          ) : null}
          {state.status === 'error' ? (
            <ErrorState
              description={state.message}
              action={
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="h-8 px-3 rounded-[var(--radius-sm)] border border-line text-sm text-ink hover:bg-surface-2"
                >
                  Try again
                </button>
              }
            />
          ) : null}
          {data && tab === 'diagnostics' && data.reconciliation ? (
            <Diagnostics reconciliation={data.reconciliation} currency={currency} />
          ) : null}
          {data && tab === 'statement' ? (
            <Statement
              data={data}
              currency={currency}
              kind={kind}
              onKind={chooseKind}
              expanded={expanded}
              onExpand={setExpanded}
            />
          ) : null}
        </div>

        {data && tab === 'statement' && data.totalRows > data.pageSize ? (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-line shrink-0 text-sm">
            <span className="text-ink-muted">
              Page {data.page} of {totalPages} · {data.totalRows} entries
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 px-3 rounded-[var(--radius-sm)] border border-line text-ink disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-3 rounded-[var(--radius-sm)] border border-line text-ink disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function SummaryFigure({
  label,
  amount,
  currency,
  side,
  onClick,
  active,
}: {
  label: string
  amount: number
  currency: string
  side?: string
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-base font-semibold tnum text-ink mt-0.5">
        {money(Math.abs(amount), currency)}
        {side ? <span className="ml-1 text-xs font-medium text-ink-muted">{side}</span> : null}
      </p>
    </>
  )
  return (
    <div className={cn('bg-surface px-3 py-2 min-w-0', active && 'bg-surface-2')}>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left hover:underline">
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  )
}

function Statement({
  data,
  currency,
  kind,
  onKind,
  expanded,
  onExpand,
}: {
  data: Ledger
  currency: string
  kind: LedgerEntryKind | ''
  onKind: (k: LedgerEntryKind | '') => void
  expanded: string | null
  onExpand: (id: string | null) => void
}) {
  const k = data.totals.byKind
  const sideOf = (n: number) => (n > 0 ? 'Dr' : n < 0 ? 'Cr' : '')

  return (
    <div className="space-y-4 p-4">
      {!data.summary.reconciled ? (
        <Notice tone="warning" title="Figures under review">
          This statement does not fully agree with the fee records yet. Totals shown come from the fee
          records; contact the accounts office before relying on them.
        </Notice>
      ) : null}

      <div className="grid gap-px bg-line border border-line rounded-[var(--radius)] overflow-hidden grid-cols-2 lg:grid-cols-4">
        {data.fiscalYear ? (
          <SummaryFigure label="Opening balance" amount={data.openingMinor} side={sideOf(data.openingMinor)} currency={currency} />
        ) : (
          <SummaryFigure label="Net outstanding (all years)" amount={data.summary.netOutstandingMinor} side={sideOf(data.summary.netOutstandingMinor)} currency={currency} />
        )}
        <SummaryFigure label="Fee demands" amount={k.DEMAND.debitMinor} currency={currency} onClick={() => onKind(kind === 'DEMAND' ? '' : 'DEMAND')} active={kind === 'DEMAND'} />
        <SummaryFigure label="Receipts" amount={k.RECEIPT.creditMinor} currency={currency} onClick={() => onKind(kind === 'RECEIPT' ? '' : 'RECEIPT')} active={kind === 'RECEIPT'} />
        <SummaryFigure label={data.fiscalYear ? `Closing FY ${data.fiscalYear.label}` : 'Closing balance'} amount={data.closingMinor} side={data.closingSide} currency={currency} />
        <SummaryFigure label="Concessions / waivers" amount={k.CONCESSION.creditMinor} currency={currency} onClick={() => onKind(kind === 'CONCESSION' ? '' : 'CONCESSION')} active={kind === 'CONCESSION'} />
        <SummaryFigure label="Late fees" amount={k.LATE_FEE.debitMinor} currency={currency} onClick={() => onKind(kind === 'LATE_FEE' ? '' : 'LATE_FEE')} active={kind === 'LATE_FEE'} />
        <SummaryFigure label="Refunds" amount={k.REFUND.debitMinor} currency={currency} onClick={() => onKind(kind === 'REFUND' ? '' : 'REFUND')} active={kind === 'REFUND'} />
        <SummaryFigure label="Advance held" amount={data.summary.advanceMinor} currency={currency} onClick={() => onKind(kind === 'ADVANCE' ? '' : 'ADVANCE')} active={kind === 'ADVANCE'} />
      </div>

      {data.byFeeHead.length ? (
        <details className="border border-line rounded-[var(--radius)]">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">By fee head</summary>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Fee head</TH>
                  <TH align="right">Charged</TH>
                  <TH align="right">Concession</TH>
                  <TH align="right">Net</TH>
                </tr>
              </THead>
              <TBody>
                {data.byFeeHead.map((h) => (
                  <TR key={h.feeHeadId ?? h.name}>
                    <TD className="text-ink">{h.name}</TD>
                    <TD align="right">{money(h.demandMinor, currency)}</TD>
                    <TD align="right">{money(h.concessionMinor, currency)}</TD>
                    <TD align="right" className="text-ink">{money(h.netMinor, currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </details>
      ) : null}

      {data.rows.length === 0 ? (
        <EmptyState
          title={kind ? `No ${KIND_LABEL[kind].toLowerCase()} in this period` : 'No fee entries in this period'}
          description={data.fiscalYear ? 'Choose another financial year or All years.' : 'Fees appear here once an invoice is issued.'}
        />
      ) : (
        <div className="border border-line rounded-[var(--radius)] overflow-hidden">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Particulars / Voucher type</TH>
                  <TH>Voucher no.</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Balance</TH>
                  <TH align="center">Dr/Cr</TH>
                </tr>
              </THead>
              <TBody>
                {data.fiscalYear && data.page === 1 && !kind ? (
                  <TR>
                    <TD>{day(data.fiscalYear.startsOn)}</TD>
                    <TD className="text-ink font-medium" colSpan={4}>Opening balance (brought forward)</TD>
                    <TD align="right" className="text-ink">{money(Math.abs(data.openingMinor), currency)}</TD>
                    <TD align="center">{sideOf(data.openingMinor)}</TD>
                  </TR>
                ) : null}
                {data.rows.map((row) => (
                  <LedgerLine
                    key={row.id}
                    row={row}
                    currency={currency}
                    open={expanded === row.id}
                    onToggle={() => onExpand(expanded === row.id ? null : row.id)}
                  />
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </div>
      )}
      <p className="text-xs text-ink-subtle">
        Debit raises the amount due; credit lowers it. Dates marked ≈ are approximate: concessions show on the
        invoice date and late fees on the due date. Balances run across the whole period, including filtered-out
        entries.
      </p>
    </div>
  )
}

function LedgerLine({
  row,
  currency,
  open,
  onToggle,
}: {
  row: LedgerRow
  currency: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <TR className="cursor-pointer" onClick={onToggle} aria-expanded={open}>
        <TD className="whitespace-nowrap">
          {row.approximateDate ? <span title="Approximate date">≈ </span> : null}
          {day(row.date)}
        </TD>
        <TD>
          <span className="flex items-start gap-1">
            {open ? <ChevronDown className="size-3.5 mt-0.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 mt-0.5 shrink-0" aria-hidden />}
            <span className="min-w-0">
              <span className="block text-ink">{row.particulars}</span>
              <span className="block text-xs text-ink-subtle">{row.voucherType}</span>
            </span>
          </span>
        </TD>
        <TD className="whitespace-nowrap">{row.voucherNo}</TD>
        <TD align="right">{row.debitMinor ? money(row.debitMinor, currency) : ''}</TD>
        <TD align="right">{row.creditMinor ? money(row.creditMinor, currency) : ''}</TD>
        <TD align="right" className="text-ink">{money(Math.abs(row.balanceMinor), currency)}</TD>
        <TD align="center">{row.side}</TD>
      </TR>
      {open ? (
        <tr>
          <td colSpan={7} className="px-3 pb-3 pt-0">
            <ul className="ml-5 space-y-1 text-xs text-ink-muted">
              {row.details.length === 0 ? <li>No further detail recorded.</li> : null}
              {row.details.map((d, i) => (
                <li key={i} className="flex justify-between gap-4 max-w-md">
                  <span>{d.label}</span>
                  <span className="tnum">{money(d.amountMinor, currency)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function Diagnostics({
  reconciliation: r,
  currency,
}: {
  reconciliation: NonNullable<Ledger['reconciliation']>
  currency: string
}) {
  const figures: [string, number][] = [
    ['Ledger closing (all years)', r.ledgerClosingMinor],
    ['Open invoice balances', r.invoiceBalanceMinor],
    ['Advance held', r.advanceMinor],
    ['Expected closing (balances − advance)', r.expectedClosingMinor],
    ['Difference', r.differenceMinor],
    ['Fees card shows', r.cardOutstandingMinor],
  ]
  return (
    <div className="space-y-4 p-4">
      <Notice tone={r.ok ? 'success' : 'danger'} title={r.ok ? 'Reconciled' : 'Does not reconcile'}>
        {r.ok
          ? 'Every entry agrees with the stored invoice balances and advance credit.'
          : 'The statement and the fee records disagree. Review the issues below; nothing has been changed.'}
      </Notice>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {figures.map(([label, n]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-line py-1">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="tnum text-ink">{money(n, currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-b border-line py-1">
          <dt className="text-ink-muted">Invoices counted / excluded</dt>
          <dd className="tnum text-ink">
            {r.countedInvoices} / {r.excludedInvoices}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-line py-1">
          <dt className="text-ink-muted">Entries with approximate dates</dt>
          <dd className="tnum text-ink">{r.approximateDatedEntries}</dd>
        </div>
      </dl>
      {r.issues.length ? (
        <ul className="space-y-2">
          {r.issues.map((issue, i) => (
            <li key={i}>
              <Notice tone={issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'info'} title={issue.code}>
                {issue.message}
              </Notice>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No issues found.</p>
      )}
    </div>
  )
}
