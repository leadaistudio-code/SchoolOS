import { requireContext } from '@/server/context'
import { listGradingScales } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SYSTEM_META } from '@/lib/exams/grading-systems'
import { GradeScaleForm, type ScaleDraft } from './grade-scale-form'
import { ScaleActions } from './scale-actions'
import { PassRuleControl } from './pass-rule-control'

export const metadata = { title: 'Grading & marking systems' }

const num = (n: number) => String(Math.round(n * 100) / 100)

export default async function GradingScalesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; copy?: string }>
}) {
  const ctx = await requireContext('exams.manage')
  const params = await searchParams
  const scales = await listGradingScales(ctx)

  const source = scales.find((s) => s.id === (params.edit ?? params.copy))
  const mode = source ? (params.edit ? 'edit' : 'copy') : 'create'
  const draft: ScaleDraft | undefined = source
    ? {
        id: source.id,
        name: mode === 'copy' ? `${source.name} (copy)`.slice(0, 60) : source.name,
        description: source.description ?? '',
        isDefault: mode === 'edit' ? source.isDefault : false,
        system: source.system,
        basis: source.basis,
        outOf: source.outOf ? String(source.outOf) : '',
        passRule: source.passRule === 'OVERALL' ? 'OVERALL' : 'ALL_PAPERS',
        passPercent: String(source.passPercent),
        bands: source.bands.map((b) => ({
          grade: b.grade,
          min: num(source.basis === 'MARKS' && b.minMarks !== null ? b.minMarks : b.minPercent),
          max: num(source.basis === 'MARKS' && b.maxMarks !== null ? b.maxMarks : b.maxPercent),
          points: b.points === null ? '' : String(b.points),
          remark: b.remark ?? '',
          isPass: b.isPass,
        })),
      }
    : undefined

  return (
    <div>
      <PageHeader
        title="Grading & marking systems"
        description={`${scales.length} scale${scales.length === 1 ? '' : 's'} · letter grades, grade points, descriptive or marks-only — on percentages or marks`}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="space-y-4">
          {scales.length === 0 ? (
            <Card>
              <EmptyState title="No grading scale yet" description="Create a marking system before computing exam results." />
            </Card>
          ) : (
            scales.map((scale) => {
              const marks = scale.basis === 'MARKS' && scale.outOf
              const showPoints = scale.bands.some((b) => b.points !== null)
              const showRemark = scale.bands.some((b) => b.remark)
              return (
                <Card key={scale.id} className={scale.id === source?.id ? 'overflow-hidden ring-2 ring-[var(--brand-500)]' : 'overflow-hidden'}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{scale.name}</CardTitle>
                        {scale.isDefault ? <Badge tone="brand">Default</Badge> : null}
                        <Badge tone="neutral">{SYSTEM_META[scale.system].label}</Badge>
                        <Badge tone="info">{marks ? `Marks out of ${num(scale.outOf!)}` : 'Percentage'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {scale.description ? `${scale.description} · ` : ''}
                        Used by {scale._count.exams} exam{scale._count.exams === 1 ? '' : 's'}
                      </p>
                    </div>
                    <ScaleActions id={scale.id} name={scale.name} isDefault={scale.isDefault} examCount={scale._count.exams} />
                  </CardHeader>
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>{scale.system === 'DESCRIPTIVE' ? 'Descriptor' : scale.system === 'MARKS_ONLY' ? 'Result' : 'Grade'}</TH>
                          <TH align="right">From</TH>
                          <TH align="right">To</TH>
                          {marks ? <TH align="right">As %</TH> : null}
                          {showPoints ? <TH align="right">Points</TH> : null}
                          {showRemark ? <TH>Remark</TH> : null}
                          <TH>Result</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {scale.bands.map((band) => (
                          <TR key={band.id}>
                            <TD className="font-medium text-ink">{band.grade}</TD>
                            <TD align="right" className="tnum">{marks && band.minMarks !== null ? num(band.minMarks) : `${num(band.minPercent)}%`}</TD>
                            <TD align="right" className="tnum">{marks && band.maxMarks !== null ? num(band.maxMarks) : `${num(band.maxPercent)}%`}</TD>
                            {marks ? <TD align="right" className="tnum text-ink-muted">{num(band.minPercent)}–{num(band.maxPercent)}%</TD> : null}
                            {showPoints ? <TD align="right" className="tnum">{band.points ?? '—'}</TD> : null}
                            {showRemark ? <TD className="text-sm text-ink-muted">{band.remark ?? ''}</TD> : null}
                            <TD>
                              <Badge tone={band.isPass ? 'success' : 'danger'}>{band.isPass ? 'Pass' : 'Fail'}</Badge>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                  <PassRuleControl
                    id={scale.id}
                    passRule={scale.passRule === 'OVERALL' ? 'OVERALL' : 'ALL_PAPERS'}
                    passPercent={scale.passPercent}
                    examCount={scale._count.exams}
                  />
                </Card>
              )
            })
          )}
        </div>

        <GradeScaleForm key={`${mode}-${source?.id ?? 'new'}`} initial={draft} mode={mode} />
      </div>
    </div>
  )
}
