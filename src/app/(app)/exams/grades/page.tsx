import { requireContext } from '@/server/context'
import { listGradingScales } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { GradeScaleForm } from './grade-scale-form'

export const metadata = { title: 'Grading scales' }

export default async function GradingScalesPage() {
  const ctx = await requireContext('exams.manage')
  const scales = await listGradingScales(ctx)

  return (
    <div>
      <PageHeader
        title="Grading scales"
        description={`${scales.length} scale${scales.length === 1 ? '' : 's'} · used to derive grades and pass status`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="space-y-4">
          {scales.length === 0 ? (
            <Card>
              <EmptyState
                title="No grading scale yet"
                description="Create a scale before computing exam results."
              />
            </Card>
          ) : (
            scales.map((scale) => (
              <Card key={scale.id} className="overflow-hidden">
                <CardHeader>
                  <CardTitle>{scale.name}</CardTitle>
                  {scale.isDefault ? <Badge tone="brand">Default</Badge> : null}
                </CardHeader>
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Grade</TH>
                        <TH align="right">From</TH>
                        <TH align="right">To</TH>
                        <TH>Result</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {scale.bands.map((band) => (
                        <TR key={band.id}>
                          <TD className="text-ink font-medium">{band.grade}</TD>
                          <TD align="right">{band.minPercent}%</TD>
                          <TD align="right">{band.maxPercent}%</TD>
                          <TD>
                            <Badge tone={band.isPass ? 'success' : 'danger'}>
                              {band.isPass ? 'Pass' : 'Fail'}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </Card>
            ))
          )}
        </div>

        <GradeScaleForm />
      </div>
    </div>
  )
}
