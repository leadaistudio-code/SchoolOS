import { beforeEach, describe, expect, it, vi } from 'vitest'

const flagsMock = vi.hoisted(() => ({ module: true, approvals: true }))

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({
      module: flagsMock.module,
      studentLedger: false,
      approvals: flagsMock.approvals,
      whatsappReceipts: false,
      fiscalYearStartMonth: 4,
    })),
  }
})
vi.mock('@/server/audit', () => ({ audit: vi.fn(async () => undefined) }))

function ctxWith(permissions: string[], db: Record<string, unknown> = {}) {
  const can = (p: string) => permissions.includes(p)
  return {
    user: { userId: 'u1', firstName: 'A', lastName: 'B', roleKeys: [] },
    tenant: { id: 't1', currency: 'INR' },
    can,
    canAny: (...ps: string[]) => ps.some(can),
    require: (p: string) => {
      if (!can(p)) throw new Error(`Missing permission: ${p}`)
    },
    db,
  } as never
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('fixed assets access', () => {
  beforeEach(() => {
    flagsMock.module = true
    flagsMock.approvals = true
  })

  it('refuses every action while the accounting module is off', async () => {
    flagsMock.module = false
    const svc = await import('@/server/modules/accounting/fixed-assets-service')
    const ctx = ctxWith(['accounts.view', 'accounts.manage'])
    await expect(svc.listFixedAssets(ctx, {})).rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' })
    await expect(svc.previewDepreciation(ctx)).rejects.toMatchObject({ status: 403 })
    await expect(svc.createFixedAsset(ctx, {})).rejects.toMatchObject({ status: 403 })
    await expect(svc.createDepreciationRun(ctx, {})).rejects.toMatchObject({ status: 403 })
    await expect(svc.fixedAssetReconciliation(ctx)).rejects.toMatchObject({ status: 403 })
  })

  it('needs accounts.manage to change anything', async () => {
    const svc = await import('@/server/modules/accounting/fixed-assets-service')
    const ctx = ctxWith(['accounts.view'])
    await expect(svc.createFixedAsset(ctx, {})).rejects.toThrow('Missing permission: accounts.manage')
    await expect(svc.disposeFixedAsset(ctx, 'a1', {})).rejects.toThrow('Missing permission: accounts.manage')
    await expect(svc.createDepreciationRun(ctx, {})).rejects.toThrow('Missing permission: accounts.manage')
    await expect(svc.decideDepreciationRun(ctx, 'r1', 'approve')).rejects.toThrow('Missing permission: accounts.manage')
    await expect(svc.reverseDepreciationRun(ctx, 'r1', 'wrong period')).rejects.toThrow('Missing permission: accounts.manage')
    await expect(svc.setDepreciationFrequency(ctx, { depreciationFrequency: 'MONTHLY' })).rejects.toThrow('Missing permission: accounts.manage')
  })

  it('does not let the preparer approve their own run', async () => {
    const svc = await import('@/server/modules/accounting/fixed-assets-service')
    const update = vi.fn()
    const tx = {
      $queryRawUnsafe: vi.fn(async () => []),
      depreciationRun: {
        findFirst: vi.fn(async () => ({ id: 'r1', status: 'SUBMITTED', createdById: 'u1', periodKey: '2027-03-31', periodEnd: d('2027-03-31'), lines: [] })),
        update,
      },
    }
    const db = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
    await expect(svc.decideDepreciationRun(ctxWith(['accounts.manage'], db), 'r1', 'approve')).rejects.toMatchObject({ status: 403 })
    expect(update).not.toHaveBeenCalled()
  })

  it('needs a reason to reject or reverse a run', async () => {
    const svc = await import('@/server/modules/accounting/fixed-assets-service')
    const db = { $transaction: vi.fn() }
    const ctx = ctxWith(['accounts.manage'], db)
    await expect(svc.decideDepreciationRun(ctx, 'r1', 'reject', '')).rejects.toMatchObject({ issues: expect.any(Array) })
    await expect(svc.reverseDepreciationRun(ctx, 'r1', ' ')).rejects.toMatchObject({ issues: expect.any(Array) })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('assetTerms rate history', () => {
  const asset = {
    id: 'a1',
    costMinor: 100_000_00,
    openingAccumulatedMinor: 0,
    depreciationStartOn: d('2025-04-01'),
    residualMinor: 5_000_00,
    usefulLifeMonths: 120,
    rateBp: 1500,
    disposedOn: null,
  }

  it('uses the asset rate when nothing has changed', async () => {
    const { assetTerms } = await import('@/server/modules/accounting/fixed-assets-service')
    expect(assetTerms(asset, []).rates).toEqual([{ from: '2025-04-01', rateBp: 1500 }])
  })

  it('keeps the original rate before a change and the new rate after it', async () => {
    const { assetTerms } = await import('@/server/modules/accounting/fixed-assets-service')
    const terms = assetTerms({ ...asset, rateBp: 2000 }, [
      { effectiveFrom: d('2026-04-01'), previousRateBp: 1000, rateBp: 2000, createdAt: d('2026-05-01') },
    ])
    expect(terms.rates).toEqual([{ from: '2025-04-01', rateBp: 1000 }, { from: '2026-04-01', rateBp: 2000 }])
  })

  it('lets a later change replace an earlier one effective on or after its date', async () => {
    const { assetTerms } = await import('@/server/modules/accounting/fixed-assets-service')
    const terms = assetTerms({ ...asset, rateBp: 1800 }, [
      { effectiveFrom: d('2026-10-01'), previousRateBp: 1200, rateBp: 1500, createdAt: d('2026-11-01') },
      { effectiveFrom: d('2026-04-01'), previousRateBp: 1500, rateBp: 1800, createdAt: d('2027-01-01') },
    ])
    expect(terms.rates).toEqual([{ from: '2025-04-01', rateBp: 1200 }, { from: '2026-04-01', rateBp: 1800 }])
  })

  it('never moves a change before the depreciation start', async () => {
    const { assetTerms } = await import('@/server/modules/accounting/fixed-assets-service')
    const terms = assetTerms(asset, [{ effectiveFrom: d('2025-01-01'), previousRateBp: 1000, rateBp: 1500, createdAt: d('2025-06-01') }])
    expect(terms.rates).toEqual([{ from: '2025-04-01', rateBp: 1500 }])
  })
})

describe('fixed asset validation', () => {
  const valid = { name: 'Bus', category: 'Vehicles', capitalisedOn: '2026-04-01', costMinor: 25_00_000_00, rateBp: 3000 }

  it('accepts a minimal asset and defaults to already in the books', async () => {
    const { fixedAssetSchema } = await import('@/server/modules/accounting/fixed-assets-service')
    expect(fixedAssetSchema.parse(valid)).toMatchObject({ capitalisation: 'EXISTING', openingAccumulatedMinor: 0 })
  })

  it('rejects a zero cost, a rate above 100%, fractional paise and bad dates', async () => {
    const { fixedAssetSchema } = await import('@/server/modules/accounting/fixed-assets-service')
    expect(fixedAssetSchema.safeParse({ ...valid, costMinor: 0 }).success).toBe(false)
    expect(fixedAssetSchema.safeParse({ ...valid, rateBp: 10_001 }).success).toBe(false)
    expect(fixedAssetSchema.safeParse({ ...valid, rateBp: 0 }).success).toBe(false)
    expect(fixedAssetSchema.safeParse({ ...valid, costMinor: 100.5 }).success).toBe(false)
    expect(fixedAssetSchema.safeParse({ ...valid, capitalisedOn: '2026-02-30' }).success).toBe(false)
    expect(fixedAssetSchema.safeParse({ ...valid, usefulLifeMonths: 0 }).success).toBe(false)
  })

  it('needs a real period end for a run', async () => {
    const { runRequestSchema } = await import('@/server/modules/accounting/fixed-assets-service')
    expect(runRequestSchema.safeParse({ periodEnd: '2027-03-31' }).success).toBe(true)
    expect(runRequestSchema.safeParse({ periodEnd: '31/03/2027' }).success).toBe(false)
  })
})
