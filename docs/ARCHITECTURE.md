# SchoolOS — System Architecture

## 1. What this is

A single deployment that serves many schools. Each school ("tenant") gets its
own data, users, branding, domain, academic calendar, fee structure and set of
enabled modules. Schools never see each other.

The design goals, in priority order: **data isolation → security → correctness →
performance → UX → maintainability**. Where those conflict, the earlier one wins.

Capacity target: **500+ students per tenant**, comfortably. Pagination, indexed
queries and database-side aggregation are used throughout anyway — they cost
nothing extra and remove the ceiling.

---

## 2. Technology choices

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, App Router | Server components keep data access on the server; one codebase serves the ERP, the portal and the API |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Catches the class of bug that produces wrong fee totals |
| Database | PostgreSQL 16 | Real transactions, real constraints, partial indexes, `groupBy`, and RLS available if wanted |
| ORM | Prisma 6 | Its client-extension API is what makes tenant isolation enforceable in one place |
| Styling | Tailwind CSS v4 + CSS custom properties | Brand colours must be per-tenant at runtime; a build-time theme cannot do that |
| Components | Hand-built primitives (CVA + tailwind-merge) | No dependency on a component vendor for a product meant to be white-labelled |
| Charts | Recharts | Composable, themeable from CSS variables |
| Validation | Zod | One schema shared by the API, the form action and the CSV importer |
| Auth | Custom, database-backed sessions | Revocation, device listing and impersonation are requirements; stateless JWTs make all three approximate |
| Tests | Vitest | Fast, ESM-native, same TS config |

Deliberately **not** chosen: an auth SaaS (tenant-bound identity with
impersonation is core domain logic), a component library with its own brand, and
any vendor SDK imported directly into business logic.

---

## 3. Multi-tenancy

### 3.1 The model

**Shared database, shared schema, `tenantId` discriminator.**

Considered and rejected:

- *Database per tenant* — the strongest isolation, but migrating hundreds of
  databases and running cross-tenant platform analytics becomes the dominant
  operational cost. Revisit at very large scale or for an on-premise tier.
- *Schema per tenant* — same migration problem, plus Postgres connection and
  catalogue pressure.

The shared model keeps operations simple; the isolation risk it introduces is
neutralised by making isolation *impossible to forget* rather than a rule people
must remember.

### 3.2 Request → tenant

```
Host header
  ├─ exact match on TenantDomain.host (verified)   → custom domain: erp.school.com
  └─ <slug>.APP_ROOT_DOMAIN                        → subdomain: school.schoolos.app
      └─ reserved subdomains (www, api, admin, …) never resolve to a tenant
No match → platform surface (login, super-admin console)
```

Resolution is `React.cache`d per request, so the many server components on a
page share one query.

### 3.3 How isolation is enforced

Four independent layers:

1. **`tenantDb(tenantId)`** — a Prisma client extension that rewrites every
   query for tenant-scoped models: reads narrowed by `tenantId`, writes stamped
   with it, caller-supplied `tenantId` overwritten on reads and stripped from
   updates. Because Prisma supports non-unique filters alongside a unique field
   in `where`, `findUnique`/`update`/`delete` are narrowed in place rather than
   via a second query — which keeps the extension correct inside transactions.

2. **Session/tenant match** — `getContext()` refuses a session whose `tenantId`
   differs from the resolved tenant. A stolen or copied cookie from School A is
   inert on School B's host. *(Verified: returns 401.)*

3. **Schema drift guard** — `tests/schema-drift.test.ts` parses the Prisma schema
   and fails if any model with a `tenantId` column is not registered in
   `src/server/db/tenant-models.ts`. A new table cannot ship unscoped by
   accident.

4. **Row-level scoping** (`src/server/scope.ts`) — a second, finer question.
   `students.view` says a role may look at student records; it does not say
   *which*. Parents and students are narrowed to their own rows. A teacher who is
   also a parent is **not** narrowed — the elevated role wins.

`prisma/rls.sql` additionally ships Postgres row-level-security policies for
deployments that want defence in depth. It is **not** applied by default, because
enabling it correctly requires setting a per-connection tenant GUC; see
`docs/SECURITY.md`.

### 3.4 The one deliberate exception

The SaaS control plane (`Tenant`, `Subscription`, `Plan`, `UsageMetric`,
`SupportTicket`, `TenantDomain`) is **not** tenant-scoped. It is owned by the
platform and read by the super-admin console, which is the one context meant to
see across tenants. It lives behind `getPlatformContext()` — a separate entry
point requiring `isSuperAdmin`, so a tenant route cannot reach it by accident.

---

## 4. Authorization

Three distinct questions, answered in three places:

| Question | Mechanism |
| --- | --- |
| Which tenant is this? | `resolveTenant()` — from the Host header |
| What may this role do? | RBAC — 120 permissions in one catalogue |
| Which rows may this person see? | `src/server/scope.ts` |

### 4.1 Permissions

`src/lib/rbac/permissions.ts` is the single catalogue (`module.action`, e.g.
`fees.collect`). The seed reads it, every server check refers to it, and a test
asserts that no role grants a permission that is not in it.

12 system roles ship: `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`,
`ACCOUNTANT`, `LIBRARIAN`, `TRANSPORT_MANAGER`, `DRIVER`, `FRONT_DESK`, `HR`,
`STUDENT`, `PARENT`. Schools may create additional roles at runtime — `Role` has
a nullable `tenantId`; `null` means a built-in role shared by every tenant.

A user's effective permission set is the union of their roles, materialised once
per request when the session loads.

### 4.2 Enforcement

Every authenticated path goes through one of:

- `requireContext(permission?)` — server components; redirects
- `requireApiContext(permission?)` — API; throws typed errors
- `route(handler, { permission })` — wraps API routes with auth, tenant binding,
  the permission check, rate limiting and error shaping, so no individual route
  can forget one

The UI hides what you cannot do. The **server** is what refuses it. *(Verified: a
teacher POSTing to `/api/v1/students` gets 403 regardless of the UI.)*

---

## 5. Data model

2,400+ lines of Prisma covering every module in the product. Principles applied
throughout:

- **Money is `Int` minor units (paise).** Never a float. A test enforces this.
- **Soft delete** (`deletedAt`) wherever history matters. Students are archived,
  never destroyed: attendance, invoices, receipts and results reference them, and
  schools have statutory retention duties.
- **Academic history is preserved.** `Enrollment` is the join of student → class
  → section → session. Promotion creates a *new* enrollment; last year's record
  stays intact and queryable.
- **Composite uniques are tenant-scoped** — `@@unique([tenantId, admissionNo])`,
  so two schools may both have `ADM-001`.
- **Indexes lead with `tenantId`**, matching how every query filters. Enforced by
  a test.
- **Payments are append-only and idempotent.** `FeePayment` is created *before*
  the gateway redirect; `@@unique([provider, providerPaymentId])` makes a
  replayed webhook a no-op, and `PaymentEvent` records every callback verbatim
  for forensics.

---

## 6. Module services

Business logic lives in `src/server/modules/<module>/service.ts`, never in a
page or a route handler. A service takes `AppContext` (which carries the
tenant-bound client, the user and the permission predicates), enforces its own
permissions, wraps multi-table writes in transactions, and writes the audit
entry. Pages, server actions and API routes are thin callers.

This is why `POST /api/v1/students` and the admission form behave identically:
they call the same function and parse the same Zod schema.

---

## 7. Provider abstraction

`src/server/providers/types.ts` defines the interfaces: `EmailProvider`,
`SmsProvider`, `WhatsAppProvider`, `PaymentProvider`, `StorageProvider`,
`MapsProvider`, `AiProvider`. Business logic depends only on these. Selecting a
vendor is a configuration change.

The `mock` payment provider behaves like a real one where it matters: the order
is created server-side, the webhook body is HMAC-signed, and an unsigned or
mis-signed callback is rejected — so the verification path is exercised in
development rather than first tried in production.

AI is an abstraction with a `none` default. It is not on any critical path.

---

## 8. Frontend

- **Server components by default.** Client components are used only where
  interaction demands it (filters, forms, toasts, charts, search).
- **URL as state.** Filters, pagination and sorting live in the query string:
  shareable, bookmarkable, back-button-correct, and server-queried.
- **Theme engine.** `BrandStyle` emits the tenant palette as CSS custom
  properties, server-rendered, so a branded page never flashes default blue.
  Contrast for button text is *derived* from the brand colour, so a school
  picking a pale yellow still gets legible buttons.
- **Mobile is a different layout,** not a narrower one: bottom navigation, a
  drawer, and tables that scroll inside their own container so the page body
  never scrolls sideways.
- Skeletons, empty states, error states, inline validation, toasts and
  confirmation flows are part of the definition of done, not polish.

---

## 9. Reliability

- `/api/health` reports process liveness *and* database round-trip latency,
  returning 503 when the database is unreachable.
- Error boundaries at the route-group and global level; users see a reference
  digest, never a stack trace.
- Multi-table writes are transactional.
- The audit writer never throws into its caller — losing an audit row is bad,
  failing a fee collection because the audit write failed is worse.
- `Job` is a durable queue table, so background work survives a restart and
  stays inspectable.

---

## 10. Deployment

```
        ┌──────────────┐
        │  CDN / WAF   │  TLS, wildcard cert for *.schoolos.app
        └──────┬───────┘
               ▼
   ┌───────────────────────┐
   │  Next.js (2+ instances)│  stateless; sessions are in Postgres
   └───┬───────────┬────────┘
       ▼           ▼
  ┌─────────┐  ┌───────┐   ┌──────────────┐
  │ Postgres│  │ Redis │   │ S3-compatible│
  │ + PITR  │  │ cache │   │   storage    │
  └─────────┘  └───────┘   └──────────────┘
```

- Instances are stateless: sessions live in Postgres, so any instance can serve
  any request.
- Set `RATE_LIMIT_DRIVER=redis` behind more than one instance; the in-memory
  driver is per-process and correct only for a single instance.
- Custom domains: point CNAME at the platform, verify via `TenantDomain.verifyToken`,
  then issue a certificate.
- `npm run db:deploy` applies migrations; the build runs `prisma generate` first.

---

## 11. What Phase 1 deliberately left as schema-plus-API

Every module in the specification has its tables, relationships, indexes,
entitlement flag and navigation entry. Phase 1 shipped the foundation plus the
students module end to end as the reference implementation each later module
follows. Nothing is a fake button: navigation entries appear only when the plan
enables the module and the role holds the permission, so a school never sees a
control that does nothing.

See [ROADMAP.md](ROADMAP.md) for the phase order.
