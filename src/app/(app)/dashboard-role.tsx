import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A privacy-safe landing page for operational roles without a dedicated dashboard. */
export async function RoleDashboard() {
  const ctx = await requireContext('dashboard.view')

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome, ${ctx.user.firstName}`}
        description="Use the navigation to open the areas assigned to your role."
      />
      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You can only open modules and records permitted for your assigned responsibilities.
          A school administrator can update your roles when required.
        </CardContent>
      </Card>
    </div>
  )
}
