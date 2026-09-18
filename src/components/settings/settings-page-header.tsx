import * as React from 'react'
import {
  AtSign,
  CalendarRange,
  Download,
  Fingerprint,
  Globe2,
  KeyRound,
  Mail,
  MapPin,
  Palette,
  Plug,
  RefreshCw,
  Satellite,
  ScrollText,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader, type Crumb } from '@/components/page-header'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type SettingsIcon =
  | 'AtSign'
  | 'CalendarRange'
  | 'Download'
  | 'Fingerprint'
  | 'Globe'
  | 'KeyRound'
  | 'Mail'
  | 'MapPin'
  | 'Palette'
  | 'Plug'
  | 'RefreshCw'
  | 'Satellite'
  | 'ScrollText'
  | 'Shield'
  | 'UserCog'

export type SettingsTone = 'brand' | 'success' | 'warning' | 'info' | 'danger'

const ICONS: Record<SettingsIcon, LucideIcon> = {
  AtSign,
  CalendarRange,
  Download,
  Fingerprint,
  Globe: Globe2,
  KeyRound,
  Mail,
  MapPin,
  Palette,
  Plug,
  RefreshCw,
  Satellite,
  ScrollText,
  Shield: ShieldCheck,
  UserCog,
}

const TONES: Record<SettingsTone, { solid: string; soft: string }> = {
  brand: {
    solid: 'bg-[var(--product-500)] text-white',
    soft: 'bg-[var(--product-50)]',
  },
  success: { solid: 'bg-success text-white', soft: 'bg-success-bg' },
  warning: { solid: 'bg-warning text-white', soft: 'bg-warning-bg' },
  info: { solid: 'bg-info text-white', soft: 'bg-info-bg' },
  danger: { solid: 'bg-danger text-white', soft: 'bg-danger-bg' },
}

export function SettingsPageHeader({
  title,
  description,
  icon,
  tone = 'brand',
  actions,
  breadcrumbs,
}: {
  title: string
  description?: React.ReactNode
  icon: SettingsIcon
  tone?: SettingsTone
  actions?: React.ReactNode
  breadcrumbs?: Crumb[]
}) {
  const Icon = ICONS[icon]
  return (
    <PageHeader
      title={title}
      description={description}
      breadcrumbs={breadcrumbs ?? [{ label: 'Settings', href: '/settings' }, { label: title }]}
      actions={actions}
      media={
        <div className={cn('grid size-11 place-items-center rounded-[var(--radius)] shadow-sm', TONES[tone].solid)}>
          <Icon className="size-6" aria-hidden />
        </div>
      }
    />
  )
}

export function SettingsPanelHeader({
  title,
  description,
  icon,
  tone = 'brand',
  actions,
  className,
}: {
  title: string
  description?: string
  icon: SettingsIcon
  tone?: SettingsTone
  actions?: React.ReactNode
  className?: string
}) {
  const Icon = ICONS[icon]
  return (
    <CardHeader className={cn('min-h-16', TONES[tone].soft, className)}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn('grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]', TONES[tone].solid)}>
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </div>
      {actions}
    </CardHeader>
  )
}
