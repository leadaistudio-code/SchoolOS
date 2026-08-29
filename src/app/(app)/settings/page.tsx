import { requireContext } from '@/server/context'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { HubTile, HubTileGrid } from '@/components/ui/hub-tile'
import type { SeriesKey } from '@/lib/chart-tones'

export const metadata = { title: 'Settings' }

type Tile = {
  href: string
  title: string
  description: string
  permission: string
  icon: string
  tone: SeriesKey
}

const TILES: Tile[] = [
  {
    href: '/settings/location',
    title: 'School location',
    description: 'The point staff check-in and the transport map are measured from.',
    permission: 'settings.view',
    icon: 'MapPin',
    tone: 'transport',
  },
  {
    href: '/settings/tracking',
    title: 'GPS trackers',
    description: 'Connect hardware trackers so buses report without a driver’s phone.',
    permission: 'transport.manage',
    icon: 'Satellite',
    tone: 'transport',
  },
  {
    href: '/settings/branding',
    title: 'Branding',
    description: 'School colours, sign-in page and document footers.',
    permission: 'settings.branding',
    icon: 'Palette',
    tone: 'admissions',
  },
  {
    href: '/settings/security',
    title: 'Security',
    description: 'Two-factor authentication for your account.',
    permission: 'settings.view',
    icon: 'Shield',
    tone: 'staff',
  },
  {
    href: '/settings/domains',
    title: 'Custom Domains',
    description: "Manage your portal's web addresses.",
    permission: 'settings.manage',
    icon: 'Globe',
    tone: 'students',
  },
  {
    href: '/settings/templates',
    title: 'Message templates',
    description: 'Email, SMS and push copy for school notifications.',
    permission: 'settings.manage',
    icon: 'Mail',
    tone: 'pending',
  },
  {
    href: '/settings/email',
    title: 'Email',
    description: 'Send from the school’s own mailbox.',
    permission: 'settings.manage',
    icon: 'AtSign',
    tone: 'fees',
  },
  {
    href: '/settings/sessions',
    title: 'Academic sessions',
    description: 'Session dates, promotion and archiving.',
    permission: 'academics.manage',
    icon: 'CalendarRange',
    tone: 'attendance',
  },
  {
    href: '/settings/users',
    title: 'Users',
    description: 'Portal accounts and their status.',
    permission: 'users.view',
    icon: 'UserCog',
    tone: 'staff',
  },
  {
    href: '/settings/roles',
    title: 'Roles and permissions',
    description: 'Built-in roles and custom roles for your school.',
    permission: 'roles.view',
    icon: 'KeyRound',
    tone: 'admissions',
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description: 'Email, SMS, WhatsApp and payment gateway keys.',
    permission: 'settings.integrations',
    icon: 'Plug',
    tone: 'transport',
  },
  {
    href: '/settings/audit',
    title: 'Audit log',
    description: 'Every sensitive change, who made it and when.',
    permission: 'audit.view',
    icon: 'ScrollText',
    tone: 'overdue',
  },
]

export default async function SettingsPage() {
  const ctx = await requireContext('settings.view')
  const school = await ctx.db.school.findFirst()
  const visible = TILES.filter((t) => ctx.can(t.permission))

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="staff"
        eyebrow="Settings"
        title="Settings"
        description={
          school ? `${school.name} · school code ${school.code}` : 'School configuration'
        }
      />

      <HubTileGrid>
        {visible.map((tile) => (
          <HubTile
            key={tile.href}
            href={tile.href}
            title={tile.title}
            description={tile.description}
            icon={tile.icon}
            tone={tile.tone}
          />
        ))}
      </HubTileGrid>
    </div>
  )
}
