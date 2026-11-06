import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import { getGroup } from '@/server/modules/platform/groups'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  addOwnerAction,
  addSchoolAction,
  deleteGroupAction,
  removeOwnerAction,
  removeSchoolAction,
  renameGroupAction,
} from '../actions'

export const metadata = { title: 'School group · Platform' }

const selectClass = 'h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm'

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const ctx = await requirePlatformContext('platform.tenants')
  const [{ id }, { error }] = await Promise.all([params, searchParams])
  const data = await getGroup(ctx, id)
  if (!data) notFound()
  const { group, available } = data
  const schoolName = (t: { name: string; school: { name: string } | null }) => t.school?.name ?? t.name
  const tenantName = new Map(group.tenants.map((t) => [t.id, schoolName(t)]))

  return (
    <div className="space-y-4">
      <PageHeader
        title={group.name}
        description={`${group.tenants.length} school${group.tenants.length === 1 ? '' : 's'} · ${group.owners.length} owner${group.owners.length === 1 ? '' : 's'}`}
        actions={
          <Link href="/platform/groups" className="text-sm text-[var(--brand-600)] hover:underline">
            All groups
          </Link>
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schools in this group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.tenants.length === 0 ? (
              <p className="text-sm text-ink-muted">No schools yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {group.tenants.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/platform/tenants/${t.id}`} className="flex-1 min-w-0 font-medium hover:underline">
                      {schoolName(t)}
                    </Link>
                    <span className="text-xs text-ink-subtle">{t.slug}</span>
                    {t.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
                    <form action={removeSchoolAction.bind(null, group.id, t.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {available.length > 0 ? (
              <form action={addSchoolAction.bind(null, group.id)} className="flex flex-wrap gap-2">
                <select name="tenantId" className={`${selectClass} flex-1 min-w-48`} required defaultValue="">
                  <option value="" disabled>
                    Add a school…
                  </option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {schoolName(t)} ({t.slug})
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="secondary">
                  Add school
                </Button>
              </form>
            ) : (
              <p className="text-xs text-ink-subtle">Every other school is already in a group.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-ink-muted">
              An owner signs in to their own school as usual and gets a Group overview page with combined figures for every
              school here. Nobody else sees it, including school admins.
            </p>
            {group.owners.length === 0 ? (
              <p className="text-sm text-ink-muted">No owners yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {group.owners.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">
                        {o.user.firstName} {o.user.lastName}
                      </span>
                      <span className="block text-xs text-ink-subtle">
                        {o.user.email ?? o.user.phone} · signs in at {tenantName.get(o.user.tenantId ?? '') ?? 'another school'}
                      </span>
                    </span>
                    {o.user.status !== 'ACTIVE' ? <Badge tone="warning">{o.user.status.toLowerCase()}</Badge> : null}
                    <form action={removeOwnerAction.bind(null, group.id, o.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {group.tenants.length > 0 ? (
              <form action={addOwnerAction.bind(null, group.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select name="tenantId" className={selectClass} required defaultValue={group.tenants[0]?.id}>
                  {group.tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      Account at {schoolName(t)}
                    </option>
                  ))}
                </select>
                <Input name="identifier" placeholder="Owner's email or phone" required />
                <Button type="submit" size="sm">
                  Add owner
                </Button>
              </form>
            ) : (
              <p className="text-xs text-ink-subtle">Add a school first; the owner needs an account at one of them.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Group settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <form action={renameGroupAction.bind(null, group.id)} className="flex gap-2">
            <Input name="name" defaultValue={group.name} required maxLength={120} className="w-72" />
            <Button type="submit" size="sm" variant="secondary">
              Rename
            </Button>
          </form>
          <form action={deleteGroupAction.bind(null, group.id)} className="ml-auto">
            <Button type="submit" size="sm" variant="ghost">
              Delete group
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
