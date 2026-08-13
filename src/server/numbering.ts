/**
 * Structural type for a transaction client.
 *
 * Declared by shape rather than as `Prisma.TransactionClient`, because the
 * tenant-scoped client is a Prisma *extension* and its transaction client is a
 * different (equally valid) type. All this function needs is raw SQL.
 */
export type RawCapableClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

export type DocumentKind = 'INVOICE' | 'RECEIPT' | 'REFUND' | 'CERTIFICATE' | 'LEAD'

const PREFIX: Record<DocumentKind, string> = {
  INVOICE: 'INV',
  RECEIPT: 'RCP',
  REFUND: 'REF',
  CERTIFICATE: 'CRT',
  LEAD: 'LEAD',
}

/**
 * Sequential document numbers.
 *
 * A receipt number is a legal artefact: it must not repeat, and an auditor will
 * ask about gaps. Two naive approaches both fail here:
 *
 *   - `count() + 1` races. Two cashiers collecting at the same moment both read
 *     N and both write N+1, and the unique index rejects one of them after the
 *     money has already moved.
 *   - A per-tenant counter row read-then-written has the same race unless the
 *     read locks.
 *
 * So the sequence is derived inside the caller's transaction with a row lock on
 * the previous highest number for this tenant, kind and financial year. Postgres
 * serialises the second transaction behind the first, and it reads the number
 * the first one actually wrote.
 */
export async function nextDocumentNumber(
  tx: RawCapableClient,
  params: { tenantId: string; kind: DocumentKind; sessionLabel: string },
): Promise<string> {
  const prefix = `${PREFIX[params.kind]}-${params.sessionLabel}-`

  const table =
    params.kind === 'RECEIPT'
      ? 'FeeReceipt'
      : params.kind === 'CERTIFICATE'
        ? 'Certificate'
        : params.kind === 'LEAD'
          ? 'AdmissionLead'
          : 'FeeInvoice'

  const column = params.kind === 'LEAD' ? 'reference' : 'number'

  // FOR UPDATE takes a row lock; a concurrent transaction blocks here rather
  // than reading a stale maximum.
  const rows = await tx.$queryRawUnsafe<{ value: string }[]>(
    `SELECT "${column}" AS value FROM "${table}"
      WHERE "tenantId" = $1 AND "${column}" LIKE $2
      ORDER BY "${column}" DESC
      LIMIT 1
      FOR UPDATE`,
    params.tenantId,
    `${prefix}%`,
  )

  const last = rows[0]?.value
  const lastSeq = last ? Number(last.slice(prefix.length)) : 0
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1

  return `${prefix}${String(next).padStart(5, '0')}`
}

/**
 * The Indian financial year label a date falls in (April to March), which is
 * how schools group receipt books.
 */
export function financialYearLabel(date: Date): string {
  const year = date.getUTCFullYear()
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`
}
