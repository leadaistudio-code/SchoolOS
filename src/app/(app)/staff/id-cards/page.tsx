import { requireContext } from '@/server/context'
import { buildStaffCards, staffIdCardFilters } from '@/server/modules/id-cards/cards'
import { loadIdCardSettings } from '@/server/modules/id-cards/settings'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { IdCardStudio } from '@/components/id-card/id-card-studio'
import { StoreFilters } from '@/app/(app)/inventory/store/store-filters'
import { saveStaffIdCardDesignAction } from './actions'

export const metadata = { title: 'Staff ID cards' }

const TYPE_LABEL: Record<string, string> = {
  TEACHING: 'Teaching',
  ADMIN: 'Administration',
  SUPPORT: 'Support',
  DRIVER: 'Driver',
  LIBRARIAN: 'Librarian',
  ACCOUNTANT: 'Accountant',
  OTHER: 'Other',
}

export default async function StaffIdCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('staff.id_cards')
  const query = await searchParams
  const [filters, settings, data] = await Promise.all([
    staffIdCardFilters(ctx),
    loadIdCardSettings(ctx, 'staff'),
    buildStaffCards(ctx, { department: query.department, staffType: query.type }),
  ])

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="Staff ID cards"
          description="Teacher and staff identity cards with photo, employee code and QR. The design is saved separately from student cards."
        />
      </div>

      <Card className="no-print">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-3">
          <StoreFilters
            filters={[
              {
                param: 'type',
                label: 'Staff type',
                allLabel: 'All staff',
                options: filters.types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })),
              },
              {
                param: 'department',
                label: 'Department',
                allLabel: 'All departments',
                options: filters.departments.map((d) => ({ value: d, label: d })),
              },
            ]}
          />
          <p className="text-sm text-ink-muted">
            {data.people.length} of {filters.total} staff
          </p>
        </CardContent>
      </Card>

      <IdCardStudio
        key={`${query.type ?? ''}-${query.department ?? ''}`}
        kind="staff"
        people={data.people}
        school={data.school}
        initialSettings={settings}
        canSave
        saveAction={saveStaffIdCardDesignAction}
      />
    </div>
  )
}
