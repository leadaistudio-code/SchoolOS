import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getAdmitCardSummary, listAdmitCards } from '@/server/modules/exams/admit-cards'
import { getExamDetail } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ColorTile } from '@/components/dashboard/color-tiles'
import { AdmitCardPanel } from './admit-card-panel'

export const metadata = { title: 'Admit cards' }

export default async function ExamAdmitCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const [exam, summary, { rows }] = await Promise.all([
    getExamDetail(ctx, id),
    getAdmitCardSummary(ctx, id),
    listAdmitCards(ctx, id),
  ])

  const canGenerate = ctx.can('exams.admit_cards')
  const canApprove = ctx.can('exams.admit_approve')

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
        description="Generate cards with the exam date sheet. The principal approves each card after fees are cleared."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <ColorTile label="Pending" value={String(summary.pending)} sub="Awaiting approval" tone="pending" delayMs={40} />
        <ColorTile label="Approved" value={String(summary.approved)} sub="Ready to print" tone="students" delayMs={80} />
        <ColorTile label="Rejected" value={String(summary.rejected)} sub="Fee or other issue" tone="admissions" delayMs={120} />
      </div>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Students</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmitCardPanel
            examId={exam.id}
            rows={rows}
            canGenerate={canGenerate}
            canApprove={canApprove}
          />
        </CardContent>
      </Card>
    </div>
  )
}
