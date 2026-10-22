import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listClassTests } from '@/server/modules/class-tests/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Class tests' }

export default async function ClassTestsPage() {
  const ctx = await requireContext('exams.class_tests')
  const tests = await listClassTests(ctx, {})

  return (
    <div className="space-y-4">
      <PageHeader
        title="Class tests"
        description="Quick tests taken in class. No admit cards or exam schedule. Set the test, then tick who took it."
        actions={
          <Link href="/exams/class-tests/new" className={buttonVariants({ size: 'sm' })}>
            <Plus aria-hidden />
            New class test
          </Link>
        }
      />

      <Card>
        {tests.length === 0 ? (
          <EmptyState
            title="No class tests yet"
            description="Create one for a class and subject, then tick the students who completed it."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Class</TH>
                  <TH>Date</TH>
                  <TH>Completed</TH>
                </TR>
              </THead>
              <TBody>
                {tests.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/exams/class-tests/${t.id}`} className="text-sm font-medium text-ink hover:underline">
                        {t.title}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {t.subject} · {t.teacher}
                        {t.maxMarks ? ` · out of ${t.maxMarks}` : ''}
                      </p>
                    </TD>
                    <TD className="text-sm">
                      {t.className}
                      {t.sectionName ? ` ${t.sectionName}` : ' (all sections)'}
                    </TD>
                    <TD className="text-sm tnum">{formatDay(t.heldOn, 'd MMM yyyy')}</TD>
                    <TD>
                      <Badge tone={t.expected > 0 && t.completed >= t.expected ? 'success' : t.completed > 0 ? 'info' : 'neutral'}>
                        {t.completed} / {t.expected}
                      </Badge>
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
