import { Suspense } from 'react'
import { requireContext } from '@/server/context'
import { getClassOptions } from '@/server/modules/students/service'
import {
  documentCoverage,
  listStudentDocuments,
} from '@/server/modules/students/documents'
import { studentDocumentFilterSchema } from '@/server/modules/students/schema'
import { parseListQuery } from '@/lib/query'
import { env } from '@/lib/env'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { TableSkeleton } from '@/components/ui/states'
import { DocumentFilters } from './document-filters'
import { DocumentTable } from './document-table'
import { CoverageTable } from './coverage-table'
import { UploadDocumentDialog } from './upload-dialog'

export const metadata = { title: 'Student Documents' }

type SearchParams = Promise<Record<string, string | undefined>>

export default async function StudentDocumentsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const ctx = await requireContext('students.documents')
  const params = await searchParams
  const view = params.view === 'missing' ? 'missing' : 'all'

  const classes = (await getClassOptions(ctx)).map((c) => ({
    id: c.id,
    name: c.name,
    sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
  }))

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  )
  const tabHref = (next: string) => {
    const p = new URLSearchParams(query)
    p.delete('page')
    if (next === 'all') p.delete('view')
    else p.set('view', next)
    const qs = p.toString()
    return `/students/documents${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      <PageHeader
        title="Student documents"
        description="Birth certificates, transfer certificates and medical notes, held against the student record. Every download is permission-checked and recorded."
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Documents' }]}
      />

      <LinkTabs
        label="Document views"
        className="mb-3"
        items={[
          { label: 'All documents', href: tabHref('all'), active: view === 'all' },
          { label: 'Missing and expired', href: tabHref('missing'), active: view === 'missing' },
        ]}
      />

      <Card className="overflow-hidden">
        <DocumentFilters classes={classes}>
          {ctx.can('documents.manage') ? (
            <UploadDocumentDialog maxUploadMb={env().MAX_UPLOAD_MB} />
          ) : null}
        </DocumentFilters>

        <Suspense
          key={JSON.stringify(params)}
          fallback={<TableSkeleton rows={8} cols={view === 'missing' ? 5 : 6} />}
        >
          {view === 'missing' ? (
            <CoverageResults params={params} />
          ) : (
            <DocumentResults params={params} />
          )}
        </Suspense>
      </Card>
    </div>
  )
}

async function DocumentResults({ params }: { params: Record<string, string | undefined> }) {
  const ctx = await requireContext('students.documents')
  const query = parseListQuery(params)
  const filter = studentDocumentFilterSchema.parse(params)
  const { rows, total } = await listStudentDocuments(ctx, query, filter)

  return (
    <DocumentTable
      rows={rows}
      total={total}
      page={query.page}
      pageSize={query.pageSize}
      canManage={ctx.can('documents.manage')}
    />
  )
}

async function CoverageResults({ params }: { params: Record<string, string | undefined> }) {
  const ctx = await requireContext('students.documents')
  const filter = studentDocumentFilterSchema.parse(params)
  const rows = await documentCoverage(ctx, {
    classLevelId: filter.classLevelId,
    sectionId: filter.sectionId,
  })

  return <CoverageTable rows={rows} />
}
