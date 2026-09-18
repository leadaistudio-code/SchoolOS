import { Download, FileArchive } from 'lucide-react'
import { requireContext } from '@/server/context'
import { describeSchoolDataExport } from '@/server/modules/settings/data-export'
import { SettingsPageHeader } from '@/components/settings/settings-page-header'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/ui/states'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Data export' }

export default async function DataExportPage() {
  const ctx = await requireContext('settings.export')
  const { modules } = describeSchoolDataExport(ctx)
  const included = modules.filter((module) => module.included)

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Data export"
        description="Download students, staff, fees and the rest of your school records as CSV files in one ZIP."
        icon="Download"
        tone="info"
      />

      <Notice tone="info" title="What you get">
        The ZIP includes one CSV per table, with all fields your role can access. Money is written in
        rupees. Secrets, passwords and biometric raw data are never included.
      </Notice>

      <Card variant="elevated">
        <CardHeader>
          <div>
            <CardTitle>Full school archive</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Open the ZIP in Excel or Google Sheets. A manifest.csv file lists every sheet and row
              count.
            </p>
          </div>
          <FileArchive className="size-5 text-[var(--product-600)]" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {modules.map((module) => (
              <li
                key={module.key}
                className={`rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                  module.included
                    ? 'border-line bg-surface-2 text-ink'
                    : 'border-dashed border-line text-ink-subtle'
                }`}
              >
                <span className="font-medium">{module.label}</span>
                <span className="mt-0.5 block text-xs">
                  {module.included ? 'Included in your download' : 'Not included for your role'}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/v1/settings/data-export"
              className={cn(buttonVariants(), 'inline-flex items-center gap-2')}
            >
              <Download aria-hidden className="size-4" />
              Download full export ({included.length} module
              {included.length === 1 ? '' : 's'})
            </a>
            <p className="text-xs text-ink-muted">
              Large schools may take a minute. Keep this tab open until the download starts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
