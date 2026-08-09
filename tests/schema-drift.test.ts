import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLATFORM_MODELS,
  TENANT_OPTIONAL_MODELS,
  TENANT_SCOPED_MODELS,
} from '../src/server/db/tenant-models'

/**
 * Guards the isolation layer against schema drift.
 *
 * The tenant client only narrows models it knows about. If someone adds a new
 * tenant-scoped table and forgets to register it, every query against it would
 * silently run unscoped. This test reads the Prisma schema and fails the build
 * in that case, so the omission cannot ship.
 */
const schema = readFileSync(
  path.resolve(__dirname, '../prisma/schema.prisma'),
  'utf8',
)

function modelsWithTenantId(): string[] {
  const found: string[] = []
  const modelBlocks = schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)

  for (const match of modelBlocks) {
    const [, name, body] = match
    if (!name || !body) continue
    if (/^\s*tenantId\s+String/m.test(body)) found.push(name)
  }
  return found
}

describe('tenant model registry', () => {
  it('registers every model that carries a tenantId', () => {
    const registered = new Set<string>([
      ...TENANT_SCOPED_MODELS,
      ...TENANT_OPTIONAL_MODELS,
      ...PLATFORM_MODELS,
    ])
    const missing = modelsWithTenantId().filter((m) => !registered.has(m))

    expect(
      missing,
      `These models have a tenantId but are not registered in src/server/db/tenant-models.ts: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('does not register a model that has no tenantId', () => {
    const actual = new Set(modelsWithTenantId())
    const bogus = TENANT_SCOPED_MODELS.filter((m) => !actual.has(m))

    expect(
      bogus,
      `These models are registered as tenant-scoped but have no tenantId column: ${bogus.join(', ')}`,
    ).toEqual([])
  })

  it('keeps the strict and optional lists disjoint', () => {
    const overlap = TENANT_SCOPED_MODELS.filter((m) => TENANT_OPTIONAL_MODELS.has(m))
    expect(overlap).toEqual([])
  })
})

describe('schema conventions', () => {
  it('indexes tenantId on tenant-scoped models', () => {
    // Every tenant-scoped read filters on tenantId, so it must lead an index
    // or a unique constraint on each model the tenant client narrows. Models
    // outside that set (Session, AuditLog, Job) are looked up by other keys.
    const scoped = new Set<string>(TENANT_SCOPED_MODELS)
    const missing: string[] = []

    for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = match
      if (!name || !body) continue
      if (!scoped.has(name)) continue

      const hasTenantIndex =
        /@@index\(\[tenantId/.test(body) ||
        /@@unique\(\[tenantId/.test(body) ||
        /tenantId\s+String\s+@unique/.test(body)

      if (!hasTenantIndex) missing.push(name)
    }

    expect(
      missing,
      `These tenant-scoped models have no index starting with tenantId: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('stores money as integer minor units, never floats', () => {
    const floatMoney = [...schema.matchAll(/^\s*(\w*[Aa]mount\w*|\w*Minor)\s+Float/gm)].map(
      (m) => m[1],
    )
    expect(floatMoney, 'Money fields must be Int minor units').toEqual([])
  })
})
