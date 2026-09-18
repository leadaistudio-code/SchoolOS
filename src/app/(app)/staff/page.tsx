import Link from 'next/link'
import { BookOpen, Briefcase, CalendarDays, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStaff } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { StaffTypeFilter } from './type-filter'
import { buttonVariants } from '@/components/ui/button-variants'
import { StaffTabs } from './tabs'
import { StaffTable } from './staff-table'

export const metadata = { title: 'Teachers & staff' }

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('staff.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const [staffCounts, staffList] = await Promise.all([
    Promise.all([
      ctx.db.staff.count({ where: { deletedAt: null } }),
      ctx.db.staff.count({ where: { deletedAt: null, staffType: 'TEACHING' } }),
    ]),
    listStaff(ctx, query, { staffType: params.staffType }),
  ])
  const [totalStaff, teachingStaff] = staffCounts
  const { rows, total } = staffList

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="staff"
        eyebrow="Staff"
        title={
          totalStaff > 0
            ? `${formatNumber(totalStaff)} staff on file`
            : 'No staff yet'
        }
        description={
          totalStaff > 0
            ? `${formatNumber(teachingStaff)} teaching · directory, payroll and leave`
            : 'Add teaching and support staff to assign classes and run payroll.'
        }
        actions={
          ctx.can('staff.create') ? (
            <Link href="/staff/new" className={colorBannerPrimaryBtn()}>
              <Plus aria-hidden /> Add staff
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Total staff"
          value={formatNumber(totalStaff)}
          sub="All staff types"
          tone="staff"
          href="/staff#directory"
          active={!params.staffType}
          icon={<Briefcase className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Teaching"
          value={formatNumber(teachingStaff)}
          sub="Teaching staff"
          tone="admissions"
          href="?staffType=TEACHING#directory"
          active={params.staffType === 'TEACHING'}
          icon={<BookOpen className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Payroll & leave"
          value="Open"
          sub="Appraisals, payroll and leave"
          tone="leave"
          href="/staff/payroll"
          icon={<CalendarDays className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <StaffTabs
        active="directory"
        ctxCan={{
          payroll: ctx.can('staff.payroll'),
          appraise: ctx.can('staff.appraise'),
          leave: ctx.can('leave.view'),
        }}
      />

      <Card id="directory" variant="elevated" className="scroll-mt-20 overflow-hidden">
        <SearchBar placeholder="Search name, employee code, phone or designation">
          <StaffTypeFilter />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q || params.staffType ? 'No staff match these filters' : 'No staff yet'}
            description="Add teaching and support staff to assign classes and subjects, run attendance, and manage salary and appraisals."
            action={
              ctx.can('staff.create') && !params.q && !params.staffType ? (
                <Link href="/staff/new" className={buttonVariants({ size: 'sm' })}>
                  Add the first staff member
                </Link>
              ) : undefined
            }
          />
        ) : (
          <StaffTable
            rows={rows}
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            canExport={ctx.can('staff.export')}
            canMessage={ctx.can('messages.send')}
            canBroadcast={ctx.can('messages.broadcast')}
            canTempPassword={ctx.can('users.edit')}
            staffTypeFilter={params.staffType}
          />
        )}
      </Card>
    </div>
  )
}
