import type { TenantClient } from '@/server/db/tenant-client'

export type CashBankAccount = { id: string; code: string; name: string; systemKey: string | null; isActive: boolean }

/**
 * The school's cash and bank ledgers: the CASH and BANK system accounts plus any
 * account a payment mode has been mapped to (a second bank, a petty-cash box).
 */
export async function cashBankAccounts(db: Pick<TenantClient, 'ledgerAccount' | 'ledgerAccountMap'>): Promise<CashBankAccount[]> {
  const maps = await db.ledgerAccountMap.findMany({ where: { kind: 'PAYMENT_MODE' }, select: { accountId: true } })
  const mapped = [...new Set(maps.map((m) => m.accountId))]
  return db.ledgerAccount.findMany({
    where: { OR: [{ systemKey: { in: ['CASH', 'BANK'] } }, ...(mapped.length ? [{ id: { in: mapped } }] : [])] },
    select: { id: true, code: true, name: true, systemKey: true, isActive: true },
    orderBy: { code: 'asc' },
  })
}
