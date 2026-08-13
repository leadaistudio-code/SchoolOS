import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listLeadSetup, listLeadsByStage } from '@/server/modules/admissions/service'
import { AdmissionsBoard } from './board'
import { CreateLeadForm } from './create-lead-form'

export const metadata = { title: 'Admission pipeline' }

export default async function AdmissionsPage() {
  const ctx = await requireContext('admissions.view')
  const [board, setup] = await Promise.all([listLeadsByStage(ctx), listLeadSetup(ctx)])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission pipeline"
        description="Enquiries from first contact through enrolment."
        actions={
          <div className="flex gap-3 text-sm">
            <Link href="/admissions/followups" className="text-[var(--brand-600)] hover:underline">
              Follow-ups
            </Link>
            <Link href="/admissions/analytics" className="text-[var(--brand-600)] hover:underline">
              Analytics
            </Link>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Kanban</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmissionsBoard board={board} canManage={ctx.can('admissions.manage')} />
        </CardContent>
      </Card>

      {ctx.can('admissions.manage') ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>New enquiry</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateLeadForm classes={setup.classes} staff={setup.staff} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
