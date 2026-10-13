import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { accountOptions } from '@/server/modules/accounts/service'
import { AccountsTabs } from '../../ui'
import { JournalForm } from './journal-form'

export const metadata = { title: 'New journal voucher' }

export default async function NewJournalPage() {
  const ctx = await requireContext('accounts.manage')
  const accounts = await accountOptions(ctx)
  return (
    <div className="space-y-4">
      <PageHeader
        title="New voucher"
        description="Record any entry that is not a fee receipt or an expense: donations, bank deposits, loans, adjustments."
        actions={<BackButton fallbackHref="/accounts/journals" />}
      />
      <AccountsTabs active="/accounts/journals" />
      <JournalForm accounts={accounts} />
    </div>
  )
}
