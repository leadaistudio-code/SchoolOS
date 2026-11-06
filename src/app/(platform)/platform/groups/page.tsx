import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { listGroups } from '@/server/modules/platform/groups'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { createGroupAction } from './actions'

export const metadata = { title: 'School groups · Platform' }

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requirePlatformContext('platform.tenants')
  const [{ error }, groups] = await Promise.all([searchParams, listGroups(ctx)])

  return (
    <div className="space-y-4">
      <PageHeader
        title="School groups"
        description="Schools under one owner. The owner sees combined figures for the group from their own school login."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>New group</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createGroupAction} className="flex flex-wrap gap-2">
            <Input name="name" placeholder="e.g. Sharma Education Trust" required maxLength={120} className="max-w-sm" />
            <Button type="submit" size="sm">
              Create group
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="px-0 pb-0">
          {groups.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No groups yet" description="Create one, then add its schools and the owner's account." />
            </div>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Group</TH>
                    <TH>Schools</TH>
                    <TH align="right">Owners</TH>
                  </tr>
                </THead>
                <TBody>
                  {groups.map((g) => (
                    <TR key={g.id}>
                      <TD>
                        <Link href={`/platform/groups/${g.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                          {g.name}
                        </Link>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {g.tenants.length ? g.tenants.map((t) => t.school?.name ?? t.name).join(', ') : '—'}
                      </TD>
                      <TD align="right" className="tnum">
                        {g._count.owners}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
