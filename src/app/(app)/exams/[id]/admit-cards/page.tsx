import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  getAdmitCardSummary,
  listAdmitCardSections,
  listAdmitCards,
} from '@/server/modules/exams/admit-cards'
import { getExamDetail } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ColorTile } from '@/components/dashboard/color-tiles'
import { Notice } from '@/components/ui/states'
import { AdmitCardPanel } from './admit-card-panel'

export const metadata = { title: 'Admit cards' }

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
type AdmitStatus = (typeof STATUSES)[number]

function parseStatus(raw: string | undefined): AdmitStatus | undefined {
  const upper = raw?.toUpperCase()
  return STATUSES.includes(upper as AdmitStatus) ? (upper as AdmitStatus) : undefined
}

export default async function ExamAdmitCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const { status: rawStatus } = await searchParams
  const statusFilter = parseStatus(rawStatus)

  const [exam, summary, { rows }, sections] = await Promise.all([
    getExamDetail(ctx, id),
    getAdmitCardSummary(ctx, id),
    listAdmitCards(ctx, id),
    listAdmitCardSections(ctx, id),
  ])

  const canGenerate = ctx.can('exams.admit_cards')
  const canApprove = ctx.can('exams.admit_approve')
  const base = `/exams/${exam.id}/admit-cards`

  return (
    <div className="space-y-6">
      <Link
        href={`/exams/${exam.id}`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {exam.name}
      </Link>

      <PageHeader
        title="Admit cards"
        description="Generate cards by class section. Each card shows only the papers assigned to that student’s section."
      />

      <Notice tone="info" title="Section-wise date sheet">
        Subject lists on admit cards follow Academics → Subjects section mapping. Core papers mapped
        to every section (or left unmapped) appear for the whole class; electives appear only for the
        sections they are assigned to.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <ColorTile
          label="Pending"
          value={String(summary.pending)}
          sub="Awaiting approval"
          tone="pending"
          href={`${base}?status=PENDING#students`}
          active={statusFilter === 'PENDING'}
          delayMs={40}
        />
        <ColorTile
          label="Approved"
          value={String(summary.approved)}
          sub="Ready to print"
          tone="students"
          href={`${base}?status=APPROVED#students`}
          active={statusFilter === 'APPROVED'}
          delayMs={80}
        />
        <ColorTile
          label="Rejected"
          value={String(summary.rejected)}
          sub="Fee or other issue"
          tone="admissions"
          href={`${base}?status=REJECTED#students`}
          active={statusFilter === 'REJECTED'}
          delayMs={120}
        />
      </div>

      <Card id="students" variant="elevated" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Students</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmitCardPanel
            examId={exam.id}
            rows={rows}
            sections={sections.map((section) => ({
              id: section.id,
              label: `${section.classLevel.name} · ${section.name}`,
            }))}
            statusFilter={statusFilter}
            canGenerate={canGenerate}
            canApprove={canApprove}
          />
        </CardContent>
      </Card>
    </div>
  )
}
