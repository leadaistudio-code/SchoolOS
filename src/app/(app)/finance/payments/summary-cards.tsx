import { Banknote, Clock, FileCheck2, IndianRupee, Smartphone } from 'lucide-react'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { formatMoney } from '@/lib/utils'

type Summary = {
  totalMinor: number
  receiptCount: number
  cashMinor: number
  digitalMinor: number
  chequeMinor: number
  pendingChequeMinor: number
  pendingChequeCount: number
}

export function ReceiptSummaryCards({ summary, currency }: { summary: Summary; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Total received"
        value={formatMoney(summary.totalMinor, currency)}
        hint={`${summary.receiptCount} receipts`}
        icon={IndianRupee}
        accent={ACCENT.indigo}
      />
      <StatCard label="Cash" value={formatMoney(summary.cashMinor, currency)} icon={Banknote} accent={ACCENT.emerald} />
      <StatCard label="UPI / online / card" value={formatMoney(summary.digitalMinor, currency)} icon={Smartphone} accent={ACCENT.sky} />
      <StatCard label="Cheque / DD (cleared)" value={formatMoney(summary.chequeMinor, currency)} icon={FileCheck2} accent={ACCENT.violet} />
      <StatCard
        label="Cheques pending"
        value={formatMoney(summary.pendingChequeMinor, currency)}
        hint={`${summary.pendingChequeCount} cheque${summary.pendingChequeCount === 1 ? '' : 's'} · dues still open`}
        icon={Clock}
        accent={summary.pendingChequeCount > 0 ? ACCENT.amber : ACCENT.slate}
        href="/finance/payments?view=pending_cheque"
      />
    </div>
  )
}
