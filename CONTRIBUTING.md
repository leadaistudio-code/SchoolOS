# Contributing

## Adding a module

Follow the students module; it is the reference implementation.

1. **Schema** — add models to `prisma/schema.prisma`. Every tenant-scoped model
   needs a `tenantId`, an index leading with `tenantId`, and tenant-scoped
   composite uniques. Money is `Int` minor units.
2. **Register it** — add the model name to `TENANT_SCOPED_MODELS` in
   `src/server/db/tenant-models.ts`. The schema-drift test fails otherwise, and
   that is on purpose: an unregistered model would query unscoped.
3. **Migrate** — `npm run db:migrate`.
4. **Permissions** — add entries to `src/lib/rbac/permissions.ts` and grant them
   in `src/lib/rbac/roles.ts`. Re-run the seed.
5. **Validation** — `src/server/modules/<module>/schema.ts`, using Zod.
6. **Service** — `src/server/modules/<module>/service.ts`. Take `AppContext`,
   call `ctx.require(...)`, use `ctx.db` (already tenant-bound), wrap multi-table
   writes in a transaction, and call `audit()` for sensitive operations.
7. **API** — `src/app/api/v1/<module>/route.ts` using the `route()` wrapper.
8. **UI** — a server component page that calls the service; client components
   only where interaction demands it.
9. **Navigation** — add to `src/lib/navigation.ts` with its permission and, if it
   is a paid module, its feature key.
10. **Tests** — at minimum the permission boundary and any money or attendance
    arithmetic.

## Rules that are not negotiable

- Never use the raw `prisma` client in tenant-facing code. Use `ctx.db`.
- Never trust a client-supplied `tenantId`, permission or price.
- Never confirm a payment from the frontend.
- Never hardcode a plan limit, a brand colour or a permission string outside its
  catalogue.
- Never `SELECT` an unbounded set — every list is paginated.
- A UI check is a convenience; the server check is the control.

## Before opening a PR

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
