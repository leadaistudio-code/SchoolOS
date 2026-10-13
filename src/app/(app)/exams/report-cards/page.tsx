import Link from 'next/link'
import {
  Archive,
  BadgeCheck,
  ClipboardList,
  Download,
  Eye,
  LayoutTemplate,
  ListChecks,
  Printer,
  Sparkles,
} from 'lucide-react'
import { requireContext } from '@/server/context'
import { filterReportCards, listExams, listPublishedReportCards } from '@/server/modules/exams/service'
import { holisticMatrix, reportCardQueue } from '@/server/modules/exams/holistic'
import { ensureDefaultReportCardTemplate, getDefaultReportCardTemplate, listReportCardTemplates } from '@/server/modules/exams/report-templates'
import { parseReportCardConfig } from '@/lib/exams/report-card-config'
import { sampleReportCard } from '@/lib/exams/report-card-data'
import { parseListQuery } from '@/lib/query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PersonCell } from '@/components/ui/identity'
import { HolisticMatrix } from './holistic-matrix'
import { ReportCardStudio } from './report-card-studio'
import { AutoPrint, EngineSelects } from './engine-controls'

export const metadata = { title: 'Report cards' }

type Tab = 'templates' | 'matrix' | 'queue' | 'generated' | 'sample'

const STAGE_TONE = {
  Published: 'success',
  'Ready to publish': 'info',
  'Partially computed': 'warning',
  'Ready to compute': 'brand',
  'Marks entry': 'neutral',
} as const

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('results.view')
  const params = await searchParams
  const canManage = ctx.can('exams.manage')
  const canAssess = ctx.can('exams.marks')

  const allowed: Tab[] = [
    ...(canManage ? (['templates'] as Tab[]) : []),
    ...(canAssess ? (['matrix'] as Tab[]) : []),
    ...(canManage ? (['queue'] as Tab[]) : []),
    'generated',
    ...(canManage ? (['sample'] as Tab[]) : []),
  ]
  const requested = params.tab as Tab | undefined
  const tab: Tab = requested && allowed.includes(requested) ? requested : canManage ? 'sample' : 'generated'
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...params, ...patch })) if (value) next.set(key, value)
    return `/exams/report-cards?${next.toString()}`
  }

  const TABS: Record<Tab, { label: string; icon: typeof Eye; accent: string }> = {
    templates: { label: 'Templates & section builder', icon: LayoutTemplate, accent: ACCENT.indigo },
    matrix: { label: 'Holistic assessment matrix', icon: ClipboardList, accent: ACCENT.emerald },
    queue: { label: 'Generation & verification queue', icon: ListChecks, accent: ACCENT.amber },
    generated: { label: 'Generated cards & archives', icon: Archive, accent: ACCENT.sky },
    sample: { label: 'Design studio', icon: Sparkles, accent: ACCENT.pink },
  }

  return (
    <div className="space-y-5">
      <section
        className="no-print relative overflow-hidden rounded-2xl px-6 py-5 text-white shadow-sm"
        style={{ background: 'linear-gradient(120deg, #0b3d2a 0%, #0f5132 45%, #157347 100%)' }}
      >
        <div aria-hidden className="absolute -right-10 -top-16 size-56 rounded-full bg-white/5" />
        <div aria-hidden className="absolute -bottom-20 right-32 size-44 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
              <BadgeCheck className="size-3.5" aria-hidden /> NEP 2020 · CBSE standard
            </span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Official report card & result engine</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              Design the holistic progress card, record Part 2 assessments, verify results and issue print-ready A4 report cards.
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link href={href({ tab: 'sample', print: undefined })} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/25">
                <Eye className="size-4" aria-hidden /> Design studio
              </Link>
              <Link href={href({ tab: 'sample', print: '1' })} className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#0f5132] transition hover:bg-white/90">
                <Download className="size-4" aria-hidden /> Download sample PDF
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <LinkTabs
        label="Report card engine"
        items={allowed.map((key) => ({
          label: TABS[key].label,
          href: href({ tab: key, print: undefined }),
          active: tab === key,
          icon: TABS[key].icon,
          accent: TABS[key].accent,
        }))}
      />

      {tab === 'templates' ? <TemplatesTab /> : null}
      {tab === 'matrix' ? <MatrixTab exam={params.exam} section={params.section} /> : null}
      {tab === 'queue' ? <QueueTab /> : null}
      {tab === 'generated' ? <GeneratedTab exam={params.exam} classLevel={params.class} section={params.section} /> : null}
      {tab === 'sample' ? <SampleTab print={params.print === '1'} /> : null}
    </div>
  )
}

async function TemplatesTab() {
  const ctx = await requireContext('exams.manage')
  const templates = await listReportCardTemplates(ctx)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {templates.map((template) => {
        const config = parseReportCardConfig(template.config)
        return (
          <Card key={template.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: config.accent }} />
                {template.name}
                {template.isDefault ? <Badge tone="success">Default</Badge> : null}
              </CardTitle>
              <Link href={`/exams/report-cards/templates#t-${template.id}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">Edit sections</Link>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-ink-muted">
                {config.layout === 'HOLISTIC' ? 'Holistic progress card' : 'Classic report card'} · {config.title}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Student profile & attendance', template.showAttendance],
                  ['Part 1 · Scholastic', true],
                  ['Qualitative remarks', template.showRemarks],
                  ['Class standing', template.showRank],
                  ['Part 2 · Competencies', config.layout === 'HOLISTIC' && config.showPart2],
                  ['Part 2 · Co-scholastic', config.layout === 'HOLISTIC' && config.showPart2],
                  ['Remarks & promotion', true],
                  ['Signatures & seal', config.showSeal],
                ].map(([label, on]) => (
                  <Badge key={String(label)} tone={on ? 'info' : 'neutral'} className={on ? '' : 'line-through opacity-60'}>{label}</Badge>
                ))}
              </div>
              {config.layout === 'HOLISTIC' && config.showPart2 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="caption">Competencies ({config.competencies.length})</p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-ink-muted">{config.competencies.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                  <div>
                    <p className="caption">Co-scholastic ({config.coScholastic.length})</p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-ink-muted">{config.coScholastic.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
      <Card className="flex items-center justify-center border-dashed">
        <Link href="/exams/report-cards/templates" className="p-8 text-sm font-medium text-[var(--brand-600)] hover:underline">
          + Create a new template
        </Link>
      </Card>
    </div>
  )
}

async function MatrixTab({ exam, section }: { exam?: string; section?: string }) {
  const ctx = await requireContext('exams.marks')
  const matrix = await holisticMatrix(ctx, exam, section)
  if (!matrix.exam) return <Card><EmptyState title="No examinations" description="Create an exam to record holistic assessments." /></Card>
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-4">
          <EngineSelects
            fields={[
              { name: 'exam', label: 'Examination', value: matrix.exam.id, options: matrix.exams.map((e) => ({ id: e.id, label: e.name })), resets: ['section'] },
              { name: 'section', label: 'Class & section', value: matrix.section?.id ?? '', options: matrix.sections },
            ]}
          />
          <p className="max-w-md text-xs text-ink-subtle">
            Scores are 0–5 per competency; co-scholastic grades A+ to C. {matrix.canPrincipal ? '' : 'Class teachers can assess their own sections.'}
          </p>
        </CardContent>
      </Card>
      {!matrix.section ? (
        <Card><EmptyState title="No sections to assess" description="Only class teachers (or administrators) can record Part 2 assessments." /></Card>
      ) : matrix.rows.length === 0 ? (
        <Card><EmptyState title="No students in this section" description="Enrol students in this section for the exam's session." /></Card>
      ) : (
        <HolisticMatrix
          key={`${matrix.exam.id}:${matrix.section.id}`}
          examId={matrix.exam.id}
          competencies={matrix.config.showPart2 && matrix.config.layout === 'HOLISTIC' ? matrix.config.competencies : []}
          coScholastic={matrix.config.showPart2 && matrix.config.layout === 'HOLISTIC' ? matrix.config.coScholastic : []}
          rows={matrix.rows}
          canPrincipal={matrix.canPrincipal}
        />
      )}
    </div>
  )
}

async function QueueTab() {
  const ctx = await requireContext('exams.manage')
  const queue = await reportCardQueue(ctx)
  const totals = queue.reduce(
    (acc, row) => ({ results: acc.results + row.results, published: acc.published + row.published, pending: acc.pending + (row.results - row.published) }),
    { results: 0, published: 0, pending: 0 },
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Exams in pipeline" value={queue.length} icon={ListChecks} accent={ACCENT.indigo} />
        <StatCard label="Results computed" value={totals.results} icon={ClipboardList} accent={ACCENT.sky} />
        <StatCard label="Awaiting publish" value={totals.pending} icon={Eye} accent={ACCENT.amber} tone={totals.pending ? 'warning' : undefined} />
        <StatCard label="Cards issued" value={totals.published} icon={BadgeCheck} accent={ACCENT.emerald} tone="success" />
      </div>
      <Card className="overflow-hidden">
        {queue.length === 0 ? (
          <EmptyState title="Nothing in the queue" description="Exams appear here once created." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Examination</TH>
                  <TH align="right">Sheets locked</TH>
                  <TH align="right">Results</TH>
                  <TH align="right">Part 2 filled</TH>
                  <TH align="right">Published</TH>
                  <TH>Stage</TH>
                  <TH align="right">Next step</TH>
                </tr>
              </THead>
              <TBody>
                {queue.map((row) => (
                  <TR key={row.id}>
                    <TD className="text-sm font-medium text-ink">{row.name}</TD>
                    <TD align="right" className="tnum">{row.locked}/{row.papers}</TD>
                    <TD align="right" className="tnum">{row.results}/{row.students}</TD>
                    <TD align="right" className="tnum">{row.holisticDone}/{row.results}</TD>
                    <TD align="right" className="tnum">{row.published}</TD>
                    <TD><Badge tone={STAGE_TONE[row.stage as keyof typeof STAGE_TONE] ?? 'neutral'}>{row.stage}</Badge></TD>
                    <TD align="right">
                      {row.stage === 'Marks entry' ? (
                        <Link href={`/exams/marks?exam=${row.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Marks hub</Link>
                      ) : row.stage === 'Published' ? (
                        <Link href={`/exams/report-cards?tab=generated&exam=${row.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">View cards</Link>
                      ) : (
                        <span className="flex justify-end gap-3">
                          <Link href={`/exams/report-cards?tab=matrix&exam=${row.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Part 2</Link>
                          <Link href={`/exams/results?exam=${row.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Verify & publish</Link>
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

async function GeneratedTab({ exam, classLevel, section }: { exam?: string; classLevel?: string; section?: string }) {
  const ctx = await requireContext('results.view')
  const exams = (await listExams(ctx, parseListQuery({ page: 1, pageSize: 100 }))).rows
  const published = exams.filter((e) => e.status === 'PUBLISHED')
  const selected = published.find((e) => e.id === exam) ?? published[0]
  const all = selected ? await listPublishedReportCards(ctx, selected.id) : []
  const filtered = filterReportCards(all, { classLevelId: classLevel, sectionId: section })
  const cards = filtered.rows
  const printHref = `/exams/report-cards/print?${new URLSearchParams(
    Object.entries({ exam: selected?.id, class: filtered.classLevelId, section: filtered.sectionId }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()}`
  return (
    <div className="space-y-4">
      {selected ? (
        <Card>
          <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-4">
            <EngineSelects
              fields={[
                ...(published.length > 1
                  ? [{ name: 'exam', label: 'Examination', value: selected.id, options: published.map((e) => ({ id: e.id, label: e.name })), resets: ['class', 'section'] }]
                  : []),
                { name: 'class', label: 'Class', value: filtered.classLevelId ?? '', options: [{ id: '', label: 'All classes' }, ...filtered.classes], resets: ['section'] },
                ...(filtered.classLevelId
                  ? [{ name: 'section', label: 'Section', value: filtered.sectionId ?? '', options: [{ id: '', label: 'All sections' }, ...filtered.sections] }]
                  : []),
              ]}
            />
            {cards.length ? (
              <Link
                href={printHref}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-600)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-700)]"
              >
                <Printer className="size-4" aria-hidden />
                Print all {cards.length} report card{cards.length === 1 ? '' : 's'}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        {cards.length === 0 ? (
          <EmptyState title="No published report cards" description="Report cards appear here once an exam's results are published." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Examination</TH>
                  <TH align="right">Percentage</TH>
                  <TH align="center">Grade</TH>
                  <TH align="right">Rank</TH>
                  <TH>Result</TH>
                  <TH align="right"><span className="sr-only">Open</span></TH>
                </tr>
              </THead>
              <TBody>
                {cards.map((card) => (
                  <TR key={card.id}>
                    <TD>
                      <PersonCell
                        firstName={card.student.firstName}
                        lastName={card.student.lastName}
                        secondary={card.student.admissionNo}
                        href={`/exams/report-cards/${card.id}`}
                        avatarUrl={card.student.photoUrl}
                      />
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {card.student.enrollments[0] ? `${card.student.enrollments[0].classLevel.name} – ${card.student.enrollments[0].section.name}` : '—'}
                    </TD>
                    <TD>{card.exam.name}</TD>
                    <TD align="right" className="font-medium text-ink tnum">{card.percentage}%</TD>
                    <TD align="center" className="text-ink">{card.grade ?? '—'}</TD>
                    <TD align="right" className="tnum">{card.rankInClass ?? '—'}</TD>
                    <TD><Badge tone={card.isPass ? 'success' : 'danger'}>{card.isPass ? 'Pass' : 'Not passed'}</Badge></TD>
                    <TD align="right">
                      <Link href={`/exams/report-cards/${card.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Open card</Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

async function SampleTab({ print }: { print: boolean }) {
  const ctx = await requireContext('exams.manage')
  await ensureDefaultReportCardTemplate(ctx)
  const [template, templates, school] = await Promise.all([
    getDefaultReportCardTemplate(ctx),
    listReportCardTemplates(ctx),
    ctx.db.school.findFirst({ select: { addressLine1: true, city: true, state: true, postalCode: true, phone: true, email: true } }),
  ])
  const brand = ctx.tenant.school
  const data = sampleReportCard(
    {
      name: brand?.name ?? ctx.tenant.name,
      code: brand?.code ?? '',
      logoUrl: brand?.logoUrl ?? null,
      signatureUrl: brand?.signatureUrl ?? null,
      address: school ? [school.addressLine1, school.city, school.state, school.postalCode].filter(Boolean).join(', ') : '',
      contact: school ? [school.phone, school.email].filter(Boolean).join(' · ') : '',
    },
    parseReportCardConfig(template?.config),
  )
  return (
    <>
      {print ? <AutoPrint /> : null}
      <ReportCardStudio
        sample={data}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: t.isDefault,
          showAttendance: t.showAttendance,
          showRank: t.showRank,
          showRemarks: t.showRemarks,
          config: parseReportCardConfig(t.config),
        }))}
      />
    </>
  )
}
