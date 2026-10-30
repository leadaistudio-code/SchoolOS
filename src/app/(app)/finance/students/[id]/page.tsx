import Link from 'next/link'
import { History, Plus, Settings2, UserRound } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getStudentFeeAccount } from '@/server/modules/finance/simplicity'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { buttonVariants } from '@/components/ui/button-variants'
import { StudentFeeLedgerView } from '../student-fee-ledger-view'

export const metadata = { title: 'Fee ledger' }

export default async function StudentFeeAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.accounts')
  const account = await getStudentFeeAccount(ctx, id)
  const currency = ctx.tenant.currency
  const enrollment = account.student.enrollments[0]
  const parent = account.student.guardians[0]?.parent
  const canCancelReceipt = ctx.can('fees.reverse')
  const canEditReceipt = ctx.can('fees.collect')
  const canEditFees = ctx.can('fees.accounts') || ctx.can('fees.concession') || ctx.can('fees.invoice')

  const classLabel = enrollment
    ? `${enrollment.classLevel.name}${enrollment.section.name ? ` ${enrollment.section.name}` : ''}`
    : null
  const studentName = `${account.student.firstName} ${account.student.lastName}`
  const canOpenProfile = ctx.can('students.view')

  const ledger = account.ledger.map((entry) => ({
    ...entry,
    date: entry.date.toISOString(),
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Ledger: ${studentName}${classLabel ? ` (${classLabel})` : ''}`}
        description={
          parent
            ? `Father's Name: ${parent.firstName} ${parent.lastName}`
            : account.student.admissionNo
        }
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          { label: 'Ledger', href: '/finance/students' },
          { label: `${account.student.firstName} ${account.student.lastName}` },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/finance/students" />
            {canOpenProfile ? (
              <Link
                href={`/students/${id}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <UserRound className="size-3.5" aria-hidden />
                Student 360
              </Link>
            ) : null}
            <Link
              href={`/finance/students/${id}?history=1`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <History className="size-3.5" aria-hidden />
              Check History
            </Link>
            {canEditFees ? (
              <Link
                href={`/finance/students/${id}/edit`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <Settings2 className="size-3.5" aria-hidden />
                Edit Fees
              </Link>
            ) : null}
            {ctx.can('fees.collect') ? (
              <Link
                className={buttonVariants({ size: 'sm' })}
                href={`/finance/collect?student=${id}`}
              >
                <Plus className="size-3.5" aria-hidden />
                Collect fee
              </Link>
            ) : null}
            <Link
              href={`/finance/payments?q=${encodeURIComponent(account.student.admissionNo)}`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Old Collections
            </Link>
          </>
        }
      />

      <StudentFeeLedgerView
        currency={currency}
        months={account.months}
        heads={account.heads}
        ledger={ledger}
        canCancelReceipt={canCancelReceipt}
        canEditReceipt={canEditReceipt}
      />
    </div>
  )
}
