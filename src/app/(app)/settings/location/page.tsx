import { requireContext } from '@/server/context'
import { getSchoolLocation } from '@/server/modules/settings/school-location'
import { PageHeader } from '@/components/page-header'
import { LocationForm } from './location-form'

export const metadata = { title: 'School location' }

/**
 * Where the school is.
 *
 * A settings page the product has been referring people to for some time
 * without it existing: the staff check-in screen tells administrators to set
 * the coordinates here, and until now the only way to do it was a database
 * update.
 */
export default async function SchoolLocationPage() {
  const ctx = await requireContext('settings.view')
  const school = await getSchoolLocation(ctx)

  return (
    <div>
      <PageHeader
        title="School location"
        description="Used by staff check-in to decide who is on the premises, and by the transport map as the point every route runs to"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'School location' }]}
      />

      <LocationForm
        school={{
          name: school.name,
          latitude: school.latitude,
          longitude: school.longitude,
          geofenceRadiusM: school.geofenceRadiusM,
          address: [school.addressLine1, school.city, school.state].filter(Boolean).join(', '),
          isSet: school.isSet,
        }}
        canManage={ctx.can('settings.manage')}
      />
    </div>
  )
}
