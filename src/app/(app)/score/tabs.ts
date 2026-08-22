import type { AppContext } from '@/server/context'
import type { TabItem } from '@/components/ui/tabs'

/**
 * The section's tabs, in one place.
 *
 * Every page in the section renders the same strip, and a tab is omitted rather
 * than shown-and-refused when the reader cannot open it — a staff tab that
 * bounces a class teacher to a 403 is worse than no tab.
 */
export function scoreTabs(active: string, ctx: AppContext): TabItem[] {
  const items: TabItem[] = [
    { label: 'School', href: '/score', active: active === '/score' },
    { label: 'Students', href: '/score/students', active: active === '/score/students' },
  ]

  if (ctx.can('staff.view')) {
    items.push({ label: 'Staff', href: '/score/staff', active: active === '/score/staff' })
  }
  if (ctx.can('score.manage')) {
    items.push({ label: 'Weighting', href: '/score/weights', active: active === '/score/weights' })
  }

  return items
}
