import Link from 'next/link'
import { requireLms } from '@/server/modules/lms/access'
import { listKits, openLoans } from '@/server/modules/lms/kits'
import { listCatalogue } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric } from '@/components/ui/metric'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'
import { KitButton, ReturnKitButton } from './kit-forms'

export const metadata = { title: 'Robotics kits · Robotics & AI' }

export default async function KitsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireLms('lms.view')
  const { view: raw } = await searchParams
  const view = raw === 'out' || raw === 'overdue' ? raw : 'kits'
  const canManage = ctx.can('lms.manage')
  const canTeach = ctx.can('lms.teach')
  const [kits, loans, courses] = await Promise.all([
    listKits(ctx),
    view === 'kits' ? Promise.resolve([]) : openLoans(ctx, view === 'overdue'),
    canManage ? listCatalogue(ctx) : Promise.resolve([]),
  ])
  const total = kits.reduce((s, k) => s + k.quantity, 0)
  const out = kits.reduce((s, k) => s + k.issued, 0)
  const late = kits.reduce((s, k) => s + k.overdue, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Robotics kits"
        description="Lend kits to students for projects and practice at home, and see who still has one."
        actions={
          canManage ? (
            <KitButton courses={courses.filter((c) => c.status === 'PUBLISHED').map((c) => ({ id: c.id, title: c.title }))} />
          ) : null
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric label="Kits held" value={String(total)} sub={`${kits.length} kind${kits.length === 1 ? '' : 's'}`} />
        <Metric label="With students" value={String(out)} />
        <Metric label="On the shelf" value={String(Math.max(0, total - out))} />
        <Metric label="Overdue" value={String(late)} sub={late ? 'Past their due date' : 'None late'} />
      </div>

      <LinkTabs
        label="Kits view"
        items={[
          { label: 'Kits', href: '/lms/kits', active: view === 'kits', count: kits.length },
          { label: 'With students', href: '/lms/kits?view=out', active: view === 'out', count: out },
          { label: 'Overdue', href: '/lms/kits?view=overdue', active: view === 'overdue', count: late },
        ]}
      />

      <Card className="overflow-hidden">
        {view === 'kits' ? (
          kits.length === 0 ? (
            <EmptyState
              title="No kits in the register"
              description={canManage ? 'Add the kits your lab holds, then issue them to students.' : 'Kits your school adds appear here.'}
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Kit</TH>
                    <TH align="right">Held</TH>
                    <TH align="right">With students</TH>
                    <TH align="right">Available</TH>
                  </tr>
                </THead>
                <TBody>
                  {kits.map((k) => (
                    <TR key={k.id}>
                      <TD>
                        <Link href={`/lms/kits/${k.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                          {k.name}
                        </Link>
                        <span className="block text-xs text-ink-subtle">
                          {[k.code, k.course?.title].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </TD>
                      <TD align="right">{k.quantity}</TD>
                      <TD align="right">
                        {k.issued}
                        {k.overdue ? (
                          <Badge tone="danger" className="ml-2">
                            {k.overdue} late
                          </Badge>
                        ) : null}
                      </TD>
                      <TD align="right">
                        <span className={k.available === 0 ? 'font-semibold text-[var(--danger)]' : 'font-semibold'}>{k.available}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )
        ) : loans.length === 0 ? (
          <EmptyState title={view === 'overdue' ? 'Nothing overdue' : 'No kits are out'} />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Kit</TH>
                  <TH>Issued</TH>
                  <TH>Due back</TH>
                  {canTeach ? <TH align="right" /> : null}
                </tr>
              </THead>
              <TBody>
                {loans.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <span className="font-medium text-ink">{l.student.name}</span>
                      <span className="block text-xs text-ink-subtle">{l.student.className || l.student.admissionNo}</span>
                    </TD>
                    <TD>
                      <Link href={`/lms/kits/${l.kit.id}`} className="text-ink hover:text-[var(--brand-600)]">
                        {l.quantity > 1 ? `${l.quantity} × ` : ''}
                        {l.kit.name}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatIst(l.issuedAt, 'd MMM yyyy')}</TD>
                    <TD className="whitespace-nowrap">
                      {l.dueOn ? formatIst(l.dueOn, 'd MMM yyyy') : '—'}
                      {l.overdue ? (
                        <Badge tone="danger" className="ml-2">
                          Overdue
                        </Badge>
                      ) : null}
                    </TD>
                    {canTeach ? (
                      <TD align="right">
                        <ReturnKitButton loanId={l.id} label={`${l.quantity} × ${l.kit.name} from ${l.student.name}`} />
                      </TD>
                    ) : null}
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
