import { notFound } from 'next/navigation'
import { ApiException } from '@/server/api/response'
import { requireLms } from '@/server/modules/lms/access'
import { getKit } from '@/server/modules/lms/kits'
import { classOptions, listCatalogue } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric } from '@/components/ui/metric'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'
import { ArchiveKitButton, IssueKitButton, KitButton, ReturnKitButton } from '../kit-forms'

export const metadata = { title: 'Kit · Robotics & AI' }

const CONDITION: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  GOOD: { label: 'Good', tone: 'success' },
  DAMAGED: { label: 'Damaged', tone: 'warning' },
  PARTS_MISSING: { label: 'Parts missing', tone: 'warning' },
  LOST: { label: 'Lost', tone: 'danger' },
}

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.view')
  const { id } = await params
  const data = await getKit(ctx, id).catch((err) => {
    if (err instanceof ApiException && err.status === 404) return null
    throw err
  })
  if (!data) notFound()
  const { kit, open, returned } = data
  const canManage = ctx.can('lms.manage')
  const canTeach = ctx.can('lms.teach')
  const [classes, courses] = await Promise.all([
    canTeach ? classOptions(ctx) : Promise.resolve([]),
    canManage ? listCatalogue(ctx) : Promise.resolve([]),
  ])
  const late = open.filter((l) => l.overdue).reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={kit.name}
        description={[kit.code, kit.course ? `Used in ${kit.course.title}` : null].filter(Boolean).join(' · ') || undefined}
        breadcrumbs={[{ label: 'Robotics kits', href: '/lms/kits' }, { label: kit.name }]}
        actions={
          <>
            {canManage ? (
              <>
                <ArchiveKitButton id={kit.id} />
                <KitButton
                  kit={{
                    id: kit.id,
                    name: kit.name,
                    code: kit.code ?? '',
                    description: kit.description ?? '',
                    courseId: kit.courseId ?? '',
                    quantity: String(kit.quantity),
                  }}
                  courses={courses.filter((c) => c.status === 'PUBLISHED').map((c) => ({ id: c.id, title: c.title }))}
                />
              </>
            ) : null}
            {canTeach ? <IssueKitButton kitId={kit.id} available={kit.available} classes={classes.map((c) => ({ id: c.id, name: c.name }))} /> : null}
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric label="Held" value={String(kit.quantity)} />
        <Metric label="With students" value={String(kit.issued)} />
        <Metric label="Available" value={String(kit.available)} />
        <Metric label="Overdue" value={String(late)} />
      </div>

      {kit.description ? (
        <Card>
          <CardHeader>
            <CardTitle>In the box</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-ink">{kit.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>With students</CardTitle>
        </CardHeader>
        {open.length === 0 ? (
          <EmptyState title="All on the shelf" />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH align="right">Qty</TH>
                  <TH>Issued</TH>
                  <TH>Due back</TH>
                  {canTeach ? <TH align="right" /> : null}
                </tr>
              </THead>
              <TBody>
                {open.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <span className="font-medium text-ink">{l.student.name}</span>
                      <span className="block text-xs text-ink-subtle">
                        {[l.student.className || l.student.admissionNo, l.note].filter(Boolean).join(' · ')}
                      </span>
                    </TD>
                    <TD align="right">{l.quantity}</TD>
                    <TD className="whitespace-nowrap">
                      {formatIst(l.issuedAt, 'd MMM yyyy')}
                      {l.issuedByLabel ? <span className="block text-xs text-ink-subtle">{l.issuedByLabel}</span> : null}
                    </TD>
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
                        <ReturnKitButton loanId={l.id} label={`${l.quantity} × ${kit.name} from ${l.student.name}`} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Returned</CardTitle>
        </CardHeader>
        {returned.length === 0 ? (
          <EmptyState title="No returns yet" />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH align="right">Qty</TH>
                  <TH>Out</TH>
                  <TH>Condition</TH>
                </tr>
              </THead>
              <TBody>
                {returned.map((l) => {
                  const c = CONDITION[l.returnCondition ?? 'GOOD'] ?? CONDITION.GOOD!
                  return (
                    <TR key={l.id}>
                      <TD>
                        <span className="font-medium text-ink">{l.student.name}</span>
                        <span className="block text-xs text-ink-subtle">{l.student.className || l.student.admissionNo}</span>
                      </TD>
                      <TD align="right">{l.quantity}</TD>
                      <TD className="whitespace-nowrap">
                        {formatIst(l.issuedAt, 'd MMM')} – {formatIst(l.returnedAt!, 'd MMM yyyy')}
                      </TD>
                      <TD>
                        <Badge tone={c.tone}>{c.label}</Badge>
                        {l.returnNote ? <span className="block text-xs text-ink-subtle">{l.returnNote}</span> : null}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
