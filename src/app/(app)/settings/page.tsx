import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/shell/icon'

export const metadata = { title: 'Settings' }

type Tile = {
  href: string
  icon: string
  title: string
  description: string
  permission: string
  ready: boolean
}

const TILES: Tile[] = [
  {
    href: '/settings/branding',
    icon: 'Palette',
    title: 'Branding',
    description: 'School colours, sign-in page and document footers.',
    permission: 'settings.branding',
    ready: true,
  },
  {
    href: '/settings/sessions',
    icon: 'CalendarRange',
    title: 'Academic sessions',
    description: 'Session dates, promotion and archiving.',
    permission: 'academics.manage',
    ready: false,
  },
  {
    href: '/settings/users',
    icon: 'Users',
    title: 'Users',
    description: 'Portal accounts and their status.',
    permission: 'users.view',
    ready: false,
  },
  {
    href: '/settings/roles',
    icon: 'ShieldCheck',
    title: 'Roles and permissions',
    description: 'Built-in roles and custom roles for your school.',
    permission: 'roles.view',
    ready: false,
  },
  {
    href: '/settings/integrations',
    icon: 'Plug',
    title: 'Integrations',
    description: 'Email, SMS, WhatsApp and payment gateway keys.',
    permission: 'settings.integrations',
    ready: false,
  },
  {
    href: '/settings/audit',
    icon: 'ScrollText',
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((tile) => {
          const inner = (
            <Card
              className={
                tile.ready
                  ? 'h-full transition-shadow hover:shadow-[var(--shadow-lift)]'
                  : 'h-full opacity-70'
              }
            >
              <CardContent className="flex items-start gap-3">
                <span className="size-10 rounded-[var(--radius-sm)] bg-[var(--brand-50)] text-[var(--brand-500)] grid place-items-center shrink-0">
                  <Icon name={tile.icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink flex items-center gap-2">
                    {tile.title}
                    {!tile.ready ? <Badge tone="neutral">not built yet</Badge> : null}
                  </p>
                  <p className="text-[12.5px] text-ink-muted mt-0.5">{tile.description}</p>
                </div>
              </CardContent>
            </Card>
          )

          // Unbuilt areas are shown so the roadmap is visible, but they are not
          // links — a navigation item that 404s is worse than one that waits.
          return tile.ready ? (
            <Link key={tile.href} href={tile.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={tile.href}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}
