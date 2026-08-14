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
        { label: 'Directory', href: '/staff', active: active === 'directory' },
        ...(ctxCan.payroll
          ? [{ label: 'Payroll', href: '/staff/payroll', active: active === 'payroll' }]
          : []),
        { label: 'Appraisals', href: '/staff/appraisals', active: active === 'appraisals' },
        ...(ctxCan.leave
          ? [{ label: 'Approvals', href: '/staff/approvals', active: active === 'approvals' }]
          : []),
      ]}
    />
  )
}
