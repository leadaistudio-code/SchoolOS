import Link from 'next/link'
import { GraduationCap, IndianRupee, Layers, Tags } from 'lucide-react'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { requireContext } from '@/server/context'
import { listFeeHeads, listStructures } from '@/server/modules/finance/service'
import { getClassTree } from '@/server/modules/academics/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { EditFeeHeadButton, EditStructureButton, NewFeeHeadButton } from './structure-forms'

export const metadata = { title: 'Fee structure' }

const CATEGORIES = [
  { key: 'tuition', label: 'Tuition', match: /tuition|monthly|school fee/i },
  { key: 'admission', label: 'Admission', match: /admission|registration|enrol/i },
  { key: 'transport', label: 'Transport', match: /transport|bus|van|conveyance/i },
  { key: 'exam', label: 'Exam', match: /exam|test|assessment/i },
  { key: 'annual', label: 'Annual & development', match: /annual|development|building|maintenance/i },
  { key: 'activity', label: 'Activities & books', match: /activity|sport|book|uniform|lab|computer|library|smart/i },
] as const

function categoryOf(name: string): string {
  return CATEGORIES.find((c) => c.match.test(name))?.key ?? 'other'
}

export default async function StructuresPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>
}) {
  const ctx = await requireContext('fees.structure')
  const { category, status } = await searchParams
  const canStructure = ctx.can('fees.structure')
  const canPublish = ctx.can('fees.structure_publish')

  const [structures, heads, classes] = await Promise.all([
    listStructures(ctx),
    listFeeHeads(ctx),
    canStructure ? getClassTree(ctx) : Promise.resolve([]),
  ])

  const currency = ctx.tenant.currency
  const classOptions = classes.map((c) => ({ id: c.id, label: c.name }))
  const feeHeadOptions = heads.map((h) => ({
    id: h.id,
    code: h.code,
    name: h.name,
    frequency: h.frequency,
  }))
  const feeHeadDrafts = heads.map((h) => ({
    id: h.id,
    code: h.code,
    name: h.name,
    frequency: h.frequency,
    isRefundable: h.isRefundable,
    isDeposit: h.isDeposit,
    inUseCount: h._count.items,
    startsOn: h.startsOn ? h.startsOn.toISOString().slice(0, 10) : '',
    endsOn: h.endsOn ? h.endsOn.toISOString().slice(0, 10) : '',
  }))
  const shortDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const headPeriod = (h: { startsOn: Date | null; endsOn: Date | null }) =>
    h.startsOn && h.endsOn
      ? `${shortDay(h.startsOn)} – ${shortDay(h.endsOn)}`
      : h.startsOn
        ? `from ${shortDay(h.startsOn)}`
        : h.endsOn
          ? `until ${shortDay(h.endsOn)}`
          : null

  const visibleStructures = structures.filter(
    (s) =>
      (!status || s.status === status) &&
      (!category || s.items.some((item) => categoryOf(item.label) === category)),
  )
  const presentCategories = [...CATEGORIES, { key: 'other', label: 'Other' }].filter((c) =>
    heads.some((h) => categoryOf(h.name) === c.key),
  )
  const classesCovered = new Set(structures.filter((s) => s.status === 'PUBLISHED').map((s) => s.classLevelId)).size
  const publishedTotals = structures.filter((s) => s.status === 'PUBLISHED').map((s) => s.totalMinor)
  const draftCount = structures.filter((s) => s.status === 'DRAFT').length
  const filterHref = (patch: { category?: string; status?: string }) => {
    const next = new URLSearchParams()
    const merged = { category, status, ...patch }
    if (merged.category) next.set('category', merged.category)
    if (merged.status) next.set('status', merged.status)
    const q = next.toString()
    return q ? `/finance/structures?${q}` : '/finance/structures'
  }
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? 'border-[var(--brand-600)] bg-[var(--brand-600)] text-white'
        : 'border-[var(--border)] text-ink-muted hover:text-ink'
    }`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fee structure"
        description={`${structures.length} structures · ${heads.length} fee heads`}
        actions={
          <>
            <BackButton fallbackHref="/finance" />
            {canStructure ? (
              <>
                <NewFeeHeadButton />
                <Link href="/finance/structures/new" className={buttonVariants({ size: 'sm' })}>
                  Create fee structure
                </Link>
                <Link
                  href="/finance/non-class-fees"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Non class linked fees
                </Link>
                <Link
                  href="/finance/optional-fees"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Optional fees
                </Link>
              </>
            ) : null}
            {ctx.can('fees.invoice') ? (
              <Link
                href="/finance/invoices"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Generate invoices
              </Link>
            ) : null}
            {ctx.can('fees.settings') ? (
              <Link href="/finance/settings" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Advanced settings
              </Link>
            ) : null}
          </>
        }
      />

      {structures.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Fee heads"
              value={String(heads.length)}
              hint={`${presentCategories.length} categories`}
              icon={Tags}
              accent={ACCENT.indigo}
            />
            <StatCard
              label="Classes covered"
              value={String(classesCovered)}
              hint="by published structures"
              icon={GraduationCap}
              accent={ACCENT.emerald}
            />
            <StatCard
              label="Annual plan range"
              value={
                publishedTotals.length
                  ? `${formatMoney(Math.min(...publishedTotals), currency)} – ${formatMoney(Math.max(...publishedTotals), currency)}`
                  : '—'
              }
              hint="per student, published"
              icon={IndianRupee}
              accent={ACCENT.sky}
            />
            <StatCard
              label="Structures"
              value={String(structures.length)}
              hint={`${draftCount} draft awaiting publish`}
              icon={Layers}
              accent={draftCount > 0 ? ACCENT.amber : ACCENT.violet}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={filterHref({ category: undefined })} className={pill(!category)}>All categories</Link>
            {presentCategories.map((c) => (
              <Link key={c.key} href={filterHref({ category: c.key })} className={pill(category === c.key)}>
                {c.label}
              </Link>
            ))}
            <span className="mx-1 h-4 w-px bg-[var(--border)]" />
            <Link href={filterHref({ status: undefined })} className={pill(!status)}>Any status</Link>
            <Link href={filterHref({ status: 'PUBLISHED' })} className={pill(status === 'PUBLISHED')}>Published</Link>
            <Link href={filterHref({ status: 'DRAFT' })} className={pill(status === 'DRAFT')}>Draft</Link>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-3">
          {structures.length > 0 && visibleStructures.length === 0 ? (
            <Card>
              <EmptyState title="No structures match" description="Try another category or status." />
            </Card>
          ) : null}
          {structures.length === 0 ? (
            <Card>
              <EmptyState
                title="No fee structures yet"
                description="Create fee heads first, then build a structure with amounts for each class. Invoices are generated from structures."
                action={
                  canStructure ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <NewFeeHeadButton label="Add fee head" />
                      <Link href="/finance/structures/new" className={buttonVariants({ size: 'sm' })}>
                        Create fee structure
                      </Link>
                    </div>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            visibleStructures.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardHeader>
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {s.className} · {s.invoiceCount} invoices generated
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'DRAFT' && canPublish ? (
                      <Link
                        href={`/finance/structures/${s.id}/publish`}
                        className={buttonVariants({ size: 'sm' })}
                      >
                        Publish & assign
                      </Link>
                    ) : null}
                    {canStructure ? (
                      <Link href={`/finance/structures/${s.id}/dates`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        Billing dates
                      </Link>
                    ) : null}
                    {canStructure ? (
                      <Link href={`/finance/structures/${s.id}/copy`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                        Copy
                      </Link>
                    ) : null}
                    {canStructure ? (
                      <EditStructureButton
                        structure={{
                          id: s.id,
                          name: s.name,
                          classLevelId: s.classLevelId,
                          description: s.description,
                          invoiceCount: s.invoiceCount,
                          items: s.items.map((item) => ({
                            feeHeadId: item.feeHeadId,
                            amountMinor: item.amountMinor,
                            dueOn: item.dueOn,
                            isOptional: item.isOptional,
                          })),
                        }}
                        feeHeads={feeHeadOptions}
                        classes={classOptions}
                      />
                    ) : null}
                    <Badge tone={s.status === 'PUBLISHED' ? 'success' : s.status === 'DRAFT' ? 'warning' : 'neutral'}>
                      {s.status.toLowerCase()}
                    </Badge>
                    <span className="text-lg font-semibold text-ink tnum">
                      {formatMoney(s.totalMinor, currency)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Fee head</TH>
                          <TH>Code</TH>
                          <TH align="right">Amount</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {s.items.map((item) => (
                          <TR key={item.id}>
                            <TD className="text-sm text-ink">
                              {item.label}
                              {item.isOptional ? (
                                <Badge tone="brand" className="ml-2">
                                  optional
                                </Badge>
                              ) : null}
                            </TD>
                            <TD className="text-xs tnum">{item.code}</TD>
                            <TD align="right" className="text-sm font-medium text-ink">
                              {formatMoney(item.amountMinor, currency)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Fee heads</CardTitle>
                <p className="text-xs text-ink-muted mt-0.5">
                  The building blocks every structure draws on
                </p>
              </div>
              {canStructure ? <NewFeeHeadButton label="Add" /> : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {heads.length === 0 ? (
              <EmptyState
                title="No fee heads"
                description="Add heads such as Tuition, Transport or Exam fee."
                action={canStructure ? <NewFeeHeadButton label="Add the first fee head" /> : undefined}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {heads.map((h) => {
                  const draft = feeHeadDrafts.find((d) => d.id === h.id)!
                  return (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{h.name}</p>
                      <p className="text-xs text-ink-subtle">
                        {h.code} · {h.frequency.toLowerCase().replace('_', ' ')}
                        {h.isDeposit ? ' · deposit' : ''}
                        {h.isRefundable ? ' · refundable' : ''}
                      </p>
                      {headPeriod(h) ? (
                        <p className="text-xs text-[var(--brand-600)]">Billing {headPeriod(h)}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={h._count.items > 0 ? 'brand' : 'neutral'}>
                        {h._count.items} in use
                      </Badge>
                      {canStructure ? <EditFeeHeadButton head={draft} /> : null}
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
