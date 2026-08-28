# Soft-Delete + Unique Constraint Rule

When creating records on models that have **both** `deletedAt` (soft-delete) **and** a `@@unique` constraint, you **MUST** use the `findOrRestore` helper from `@/server/db/soft-delete`.

## Why

Prisma `@@unique` constraints operate at the DB level and don't distinguish soft-deleted rows. If you check `findFirst({ where: { ...fields, deletedAt: null } })` and then call `.create()`, the INSERT will fail with a unique constraint violation when a soft-deleted record with the same unique fields exists.

## Affected Models

These models have both `deletedAt` and `@@unique` — always use `findOrRestore` for create operations:

- `ClassLevel` — `@@unique([tenantId, sessionId, name])`
- `Section` — `@@unique([tenantId, classLevelId, name])`
- `Subject` — `@@unique([tenantId, code])`
- `Curriculum` — `@@unique([tenantId, sessionId, classSubjectId])`
- `Student` — `@@unique([tenantId, admissionNo])`
- `Staff` — `@@unique([tenantId, employeeCode])`
- `LeaveType` — `@@unique([tenantId, name, appliesTo])`
- `FeeHead` — `@@unique([tenantId, code])`
- `FeeStructure` — `@@unique([tenantId, sessionId, name])`
- `FeedbackTemplate` — `@@unique([tenantId, name])`
- `Book` — `@@unique([tenantId, isbn])`
- `Asset` — `@@unique([tenantId, assetCode])`
- `AdmissionLead` — `@@unique([tenantId, reference])`
- `Bus` — `@@unique([tenantId, gpsDeviceId])`
- `Route` — `@@unique([tenantId, code])`

## Correct Pattern

```typescript
import { findOrRestore } from '@/server/db/soft-delete'

const record = await findOrRestore({
  model: ctx.db.classLevel,
  where: { tenantId: ctx.tenant.id, sessionId: session.id, name: input.name },
  createData: { tenantId: ctx.tenant.id, sessionId: session.id, ...input },
  restoreData: { numeric: input.numeric, stream: input.stream },
  conflictMsg: `${input.name} already exists in ${session.name}`,
})
```

## Wrong Pattern (DO NOT use)

```typescript
// ❌ This will crash when a soft-deleted record exists
const existing = await ctx.db.classLevel.findFirst({
  where: { sessionId: session.id, name: input.name, deletedAt: null },
})
if (existing) throw conflict('...')
const created = await ctx.db.classLevel.create({ data: { ... } })
```
