import Link from 'next/link'
import { Download } from 'lucide-react'
import type { AppContext } from '@/server/context'
import { listDocumentsForStudent } from '@/server/modules/students/documents'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { env } from '@/lib/env'
import {
  documentCategoryLabel,
  expiryState,
  REQUIRED_DOCUMENT_KEYS,
} from '@/lib/student-documents'
import { UploadDocumentDialog } from '../documents/upload-dialog'

const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * The document shelf on a student's record.
 *
 * Deliberately part of the record rather than a link away from it: the moment
 * anyone asks "is this child's file complete?" they are already looking at the
 * child, and a document list one navigation away is one nobody checks.
 *
 * Rendered on the server so the file list never reaches a browser that is not
 * allowed it — the whole card is absent for a role without `documents.view`.
 */
export async function StudentDocumentsCard({
  ctx,
  studentId,
  studentName,
}: {
  ctx: AppContext
  studentId: string
  studentName: string
}) {
  if (!ctx.can('documents.view')) return null

  const documents = await listDocumentsForStudent(ctx, studentId)
  const held = new Set(documents.map((d) => d.category))
  const missing = REQUIRED_DOCUMENT_KEYS.filter((k) => !held.has(k))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        {ctx.can('documents.manage') ? (
          <UploadDocumentDialog
            student={{ id: studentId, name: studentName }}
            label="Upload"
            variant="secondary"
            maxUploadMb={env().MAX_UPLOAD_MB}
          />
        ) : null}
      </CardHeader>

      <CardContent className="py-1">
        {missing.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 py-2 text-xs text-ink-subtle">
            Not on file yet:
            {missing.map((key) => (
              <Badge key={key} tone="danger">
                {documentCategoryLabel(key)}
              </Badge>
            ))}
          </p>
        ) : null}

        {documents.length === 0 ? (
          <EmptyState
            title="Nothing on file"
            description="Birth certificate, Aadhaar and a photograph are the papers this record is checked for."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {documents.map((doc) => {
              const expiry = expiryState(doc.expiresOn)
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{doc.title}</p>
                    <p className="text-xs text-ink-subtle">
                      {documentCategoryLabel(doc.category)}
                      {doc.expiresOn
                        ? ` · valid until ${DATE.format(new Date(doc.expiresOn))}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {expiry === 'expired' ? <Badge tone="danger">expired</Badge> : null}
                    {expiry === 'soon' ? <Badge tone="warning">expiring</Badge> : null}
                    {doc.isVerified ? (
                      <Badge tone="success" dot>
                        checked
                      </Badge>
                    ) : null}
                    <a
                      href={`/api/v1/files/${encodeURIComponent(doc.storageKey)}`}
                      className="text-ink-subtle hover:text-ink"
                      aria-label={`Download ${doc.title}`}
                    >
                      <Download className="size-4" aria-hidden />
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {documents.length > 0 ? (
        <div className="border-t border-line px-4 py-2.5">
          <Link
            href={`/students/documents?studentId=${studentId}`}
            className="text-xs text-ink-muted hover:text-ink hover:underline"
          >
            Manage in the document register
          </Link>
        </div>
      ) : null}
    </Card>
  )
}
