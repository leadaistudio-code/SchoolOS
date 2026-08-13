import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Settings' }

type Tile = {
  href: string
  title: string
  description: string
  permission: string
}

const TILES: Tile[] = [
  {
    href: '/settings/branding',
    title: 'Branding',
    description: 'School colours, sign-in page and document footers.',
    permission: 'settings.branding',
  },
  {
    href: '/settings/security',
    title: 'Security',
    description: 'Two-factor authentication for your account.',
    permission: 'settings.view',
  },
  {
    href: '/settings/domains',
    title: 'Custom Domains',
    description: 'Manage your portal\'s web addresses.',
    permission: 'settings.manage',
  },
  {
    href: '/settings/templates',
    title: 'Message templates',
    description: 'Email, SMS and push copy for school notifications.',
    permission: 'settings.manage',
  },
  {
    href: '/settings/email',
    title: 'Email',
    description: 'Send from the school’s own mailbox.',
    permission: 'settings.manage',
  },
  {
    href: '/settings/sessions',
    title: 'Academic sessions',
    description: 'Session dates, promotion and archiving.',
    permission: 'academics.manage',
  },
  {
    href: '/settings/users',
    title: 'Users',
    description: 'Portal accounts and their status.',
    permission: 'users.view',
  },
  {
    href: '/settings/roles',
    title: 'Roles and permissions',
    description: 'Built-in roles and custom roles for your school.',
    permission: 'roles.view',
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description: 'Email, SMS, WhatsApp and payment gateway keys.',
    permission: 'settings.integrations',
  },
  {
    href: '/settings/audit',
    title: 'Audit log',
    description: 'Every sensitive change, who made it and when.',
    permission: 'audit.view',
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
          {visible.map((tile) => (
            <li key={tile.href}>
              <Link
                href={tile.href}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-base font-medium text-ink">{tile.title}</span>
                  <span className="block text-sm text-ink-muted">{tile.description}</span>
                </span>
                <ChevronRight className="size-4 text-ink-subtle shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
