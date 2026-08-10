import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Settings' }

type Tile = {
  href: string
  title: string
  description: string
  permission: string
  ready: boolean
}

const TILES: Tile[] = [
  {
    href: '/settings/branding',
    title: 'Branding',
    description: 'School colours, sign-in page and document footers.',
    permission: 'settings.branding',
    ready: true,
  },
  {
    href: '/settings/sessions',
    title: 'Academic sessions',
    description: 'Session dates, promotion and archiving.',
    permission: 'academics.manage',
    ready: false,
  },
  {
    href: '/settings/users',
    title: 'Users',
    description: 'Portal accounts and their status.',
    permission: 'users.view',
    ready: false,
  },
  {
    href: '/settings/roles',
    title: 'Roles and permissions',
    description: 'Built-in roles and custom roles for your school.',
    permission: 'roles.view',
    ready: false,
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description: 'Email, SMS, WhatsApp and payment gateway keys.',
    permission: 'settings.integrations',
    ready: false,
  },
  {
    href: '/settings/audit',
    title: 'Audit log',
    description: 'Every sensitive change, who made it and when.',
    permission: 'audit.view',
    ready: false,
  },
]

export default async function SettingsPage() {
  const ctx = await requireContext('settings.view')
  const school = await ctx.db.school.findFirst()
  const visible = TILES.filter((t) => ctx.can(t.permission))

  return (
    <div>
      <PageHeader
        title="Settings"
        description={school ? `${school.name} · school code ${school.code}` : 'School configuration'}
      />

      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {visible.map((tile) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-ink">{tile.title}</span>
                  <span className="block text-sm text-ink-muted">{tile.description}</span>
                </span>
                {tile.ready ? (
                  <ChevronRight className="size-4 text-ink-subtle shrink-0" aria-hidden />
                ) : (
                  <Badge tone="neutral">Not built yet</Badge>
                )}
              </>
            )

            // Unbuilt areas are listed so the roadmap is visible, but they are
            // not links — a navigation item that 404s is worse than one that waits.
            return (
              <li key={tile.href}>
                {tile.ready ? (
                  <Link
                    href={tile.href}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3 opacity-60">
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
