import { CheckCheck, Star, Users, Wallet } from 'lucide-react'
import { LinkTabs } from '@/components/ui/tabs'

/**
 * The staff section's own tab strip.
 *
 * A server component taking plain booleans rather than reading the context
 * itself, so a page that has already resolved permissions does not pay for a
 * second lookup.
 */
export function StaffTabs({
  active,
  ctxCan,
}: {
  active: 'directory' | 'payroll' | 'appraisals' | 'approvals'
  ctxCan: { payroll: boolean; appraise: boolean; leave: boolean }
}) {
  return (
    <LinkTabs
      label="Staff"
      items={[
        { label: 'Directory', href: '/staff', active: active === 'directory', icon: Users, accent: '#6366f1' },
        ...(ctxCan.payroll
          ? [{ label: 'Payroll', href: '/staff/payroll', active: active === 'payroll', icon: Wallet, accent: '#10b981' }]
          : []),
        { label: 'Appraisals', href: '/staff/appraisals', active: active === 'appraisals', icon: Star, accent: '#f59e0b' },
        ...(ctxCan.leave
          ? [{ label: 'Approvals', href: '/staff/approvals', active: active === 'approvals', icon: CheckCheck, accent: '#ec4899' }]
          : []),
      ]}
    />
  )
}
