'use client'

import { usePathname } from 'next/navigation'
import { Boxes, ClipboardCheck, Gauge, History, Printer, ShieldCheck } from 'lucide-react'
import { LinkTabs } from '@/components/ui/tabs'

export function LabTabs({ labId }: { labId: string }) {
  const pathname = usePathname()
  const base = `/labs/${labId}`
  const tabs = [
    { label: 'Overview', href: base, icon: Gauge },
    { label: 'Register', href: `${base}/register`, icon: Boxes },
    { label: 'Stock ledger', href: `${base}/ledger`, icon: History },
    { label: 'Infrastructure', href: `${base}/infrastructure`, icon: ClipboardCheck },
    { label: 'Safety', href: `${base}/safety`, icon: ShieldCheck },
    { label: 'Prints', href: `${base}/prints`, icon: Printer },
  ]
  return (
    <LinkTabs
      label="Lab sections"
      items={tabs.map((t) => ({
        ...t,
        active: t.href === base ? pathname === base || pathname === `${base}/setup` : pathname.startsWith(t.href),
      }))}
    />
  )
}
