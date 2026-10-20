import { LinkTabs } from '@/components/ui/tabs'

const TABS = [
  { label: 'Dashboard', href: '/tapasya' },
  { label: 'Plan & Frogs', href: '/tapasya/plan' },
  { label: 'Focus Room', href: '/tapasya/focus' },
  { label: 'History', href: '/tapasya/history' },
  { label: 'XP & Achievements', href: '/tapasya/xp' },
  { label: 'Leaderboard', href: '/tapasya/leaderboard' },
  { label: 'Device Controls', href: '/tapasya/devices' },
]

export function StudentTabs({ active }: { active: string }) {
  return <LinkTabs label="Tapasya" className="mb-5" items={TABS.map((t) => ({ ...t, active: t.href === active }))} />
}
