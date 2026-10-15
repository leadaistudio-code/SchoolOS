import { requireContext } from '@/server/context'
import { listDeletedParents } from '@/server/modules/people/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { RestoreRecordButton } from '@/components/record-actions'
import { restoreParentAction } from '../actions'

export const metadata = { title: 'Deleted parents' }

export default async function DeletedParentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('parents.delete')
  const params = await searchParams
  const rows = await listDeletedParents(ctx, params.q?.trim() || undefined)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deleted parents"
        description="Restoring brings back the record, the portal login and the children they were linked to."
        actions={<BackButton fallbackHref="/parents" />}
      />
      <Card className="overflow-hidden">
        <SearchBar placeholder="Search name or phone" />
        {rows.length === 0 ? (
          <EmptyState title="No deleted parents" description="Parents you delete appear here and can be restored." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Parent</TH>
                  <TH>Phone</TH>
                  <TH>Deleted on</TH>
                  <TH align="right"> </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <span className="block text-sm text-ink">
                        {p.firstName} {p.lastName}
                      </span>
                      {p.email ? <span className="block text-xs text-ink-subtle">{p.email}</span> : null}
                    </TD>
                    <TD className="text-sm text-ink-muted">{p.phone ?? '—'}</TD>
                    <TD className="text-sm text-ink-muted">{p.deletedAt ? formatDay(p.deletedAt) : '—'}</TD>
                    <TD align="right">
                      <RestoreRecordButton action={restoreParentAction.bind(null, p.id)} doneMessage="Parent restored" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
