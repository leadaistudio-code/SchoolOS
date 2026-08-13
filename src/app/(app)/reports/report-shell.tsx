import * as React from 'react'
import { PageHeader } from '@/components/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { REPORTS, type ReportKey } from '@/lib/reports'
import { RangePicker } from './range-picker'
import { ExportMenu } from './export-menu'

/**
 * The frame every report page renders inside.
 *
 * One tab strip, one range picker and one export control, in the same place
 * on all six pages — so moving between reports never moves the controls, and
 * a report that forgets to offer an export cannot exist.
 */
export function ReportShell({
  report,
  description,
  range,
  extraQuery,
  canExport,
  filters,
  children,
}: {
  report: ReportKey
  description: React.ReactNode
  /** Omitted by reports that are not range-scoped, like exam results. */
  range?: { from: string; to: string }
  /** Report-specific query keys the export and range links must preserve. */
  extraQuery?: Record<string, string | undefined>
  canExport: boolean
  /** Filters this report adds beside the range picker. */
  filters?: React.ReactNode
  children: React.ReactNode
}) {
  const definition = REPORTS.find((r) => r.key === report)!

  return (
    <div>
      <PageHeader
        title={definition.title}
        description={description}
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: definition.label }]}
        actions={
          canExport ? (
            <ExportMenu report={definition} range={range} extraQuery={extraQuery} />
          ) : null
        }
      />

      <LinkTabs
        label="Reports"
        className="mb-4"
        items={REPORTS.map((r) => ({
          label: r.label,
          href: r.href,
          active: r.key === report,
        }))}
      />

      {range || filters ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-2.5">
          {range ? <RangePicker from={range.from} to={range.to} /> : null}
          {filters}
        </div>
      ) : null}

      <div className="space-y-4">{children}</div>
    </div>
  )
}
