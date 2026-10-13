import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { listDocuments, canManageMailboxes } from '@/server/modules/platform/mail/service'
import { formatBytes } from '@/lib/platform-mail'
import { MailTabs, requireMailContext } from '../tabs'
import { DeleteDocumentButton, UploadDocumentForm } from './library-forms'

export const metadata = { title: 'Library · Mail' }

export default async function MailLibraryPage() {
  const ctx = await requireMailContext()
  const documents = await listDocuments(ctx)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Document library"
        description={`${documents.length} document${documents.length === 1 ? '' : 's'} · proposals, brochures and quotations ready to attach in one click`}
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail' }, { label: 'Library' }]}
      />
      <MailTabs current="library" showSettings={canManageMailboxes(ctx)} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="p-0">
            {documents.length === 0 ? (
              <EmptyState
                title="No documents yet"
                description="Upload your proposal PDFs and brochure once; then pick them while composing instead of searching your computer each time."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>Document</TH>
                      <TH>Size</TH>
                      <TH>Added</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {documents.map((doc) => (
                      <TR key={doc.id}>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,#f45a1e_12%,transparent)] text-[#f45a1e]">
                              <FileText className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <a
                                href={`/api/v1/platform/mail/documents/${doc.id}?view=1`}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate font-medium text-ink hover:underline"
                              >
                                {doc.title}
                              </a>
                              <p className="truncate text-xs text-ink-subtle">{doc.fileName}</p>
                            </div>
                          </div>
                        </TD>
                        <TD className="tnum text-ink-muted">{formatBytes(doc.sizeBytes)}</TD>
                        <TD className="text-ink-muted">
                          {doc.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {doc.uploadedByLabel ? <span className="block text-xs text-ink-subtle">{doc.uploadedByLabel}</span> : null}
                        </TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-1">
                            <a
                              href={`/api/v1/platform/mail/documents/${doc.id}`}
                              className="inline-flex h-8 items-center rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
                            >
                              Download
                            </a>
                            <DeleteDocumentButton id={doc.id} title={doc.title} />
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a document</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadDocumentForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
