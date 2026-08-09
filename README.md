# SchoolOS

A multi-tenant School Management & ERP SaaS. One deployment serves many
schools, each with its own isolated data, branding, domain, users and enabled
modules.

This is an original product. It is not derived from, and does not reuse the
branding, copy, imagery or design of, any existing school ERP.

---

## Status

**Phases 1 to 4 are complete and verified end to end.** Later phases have their
database schema, entitlements and navigation in place, and are listed in
[docs/ROADMAP.md](docs/ROADMAP.md).

What runs today:

| Area | State |
| --- | --- |
| Multi-tenant architecture, subdomain + custom-domain resolution | Working |
| Tenant isolation (application-enforced, drift-guarded, tested) | Working |
| Authentication, sessions, lockout, rate limiting, audit log | Working |
| RBAC: 12 system roles, 120 permissions, custom roles supported | Working |
| Row-level scoping (a parent sees only their own children) | Working |
| White-label theme engine, per-tenant PWA manifest | Working |
| Role-specific dashboards with real aggregate queries | Working |
| Students module, end to end (list, filter, sort, create, edit, archive) | Working |
| Parents & staff modules, classes / sections / subjects | Working |
| Student attendance: daily register, bulk marking, absence notification | Working |
| Geofenced staff check-in, server-side verified, audited override | Working |
| Leave workflow: apply → approve/reject → notify → register reconciliation | Working |
| Notification engine (in-app now; email/SMS/WhatsApp queued as jobs) | Working |
| Homework: set → publish → hand in → review, with class progress | Working |
| Classwork lesson log, school calendar (month grid) | Working |
| Timetable builder with teacher/section conflict detection | Working |
| Notice board with audience targeting (all / role / class / section) | Working |
| File upload & download, signature-validated and permission-checked | Working |
| Fee structures, concessions, bulk invoice generation with preview | Working |
| Counter collection: idempotent, oldest-first allocation, instant receipt | Working |
| Online payments: gateway order, signature-verified webhook, replay-safe | Working |
| Refunds that restore invoice balances; late-fee rules | Working |
| Printable branded receipts, outstanding & overdue dashboards | Working |
| Versioned REST API (`/api/v1`) with a consistent envelope | Working |
| Subscription plans and feature entitlements | Working |
| Super-admin platform console | Working |
| Seed: 2 tenants, 160 students, 4,160 attendance rows, 11 demo logins | Working |
| Test suite: 169 tests, including 42 money tests and 14 isolation tests | Passing |

---

## Quick start

Requirements: Node 20.11+, Docker (for Postgres and Redis).

```bash
cp .env.example .env          # then set AUTH_SECRET to 32+ random characters
npm install
npm run db:up                 # Postgres on 5433, Redis on 6380
npm run db:deploy             # apply migrations
npm run db:seed               # demo data
npm run dev
```

Open **http://demo.lvh.me:3000**. `lvh.me` and all its subdomains resolve to
127.0.0.1, so tenant subdomains work locally with no hosts-file editing.

| URL | What it is |
| --- | --- |
| http://demo.lvh.me:3000 | Demo International School (Pro plan, 120 students) |
| http://greenwood.lvh.me:3000 | Greenwood Public School (Starter plan, 40 students) |
| http://lvh.me:3000/platform | Super-admin platform console |

### Demo accounts

Password for every account: `Password@123`

| Email | Role |
| --- | --- |
| admin@demo.schoolos.dev | School Admin |
| principal@demo.schoolos.dev | Principal |
| teacher@demo.schoolos.dev | Teacher |
| accounts@demo.schoolos.dev | Accountant |
| library@demo.schoolos.dev | Librarian |
| transport@demo.schoolos.dev | Transport Manager |
| driver@demo.schoolos.dev | Driver |
| reception@demo.schoolos.dev | Front Office |
| hr@demo.schoolos.dev | HR |
| parent@demo.schoolos.dev | Parent (two children — try the child switcher) |
| student@demo.schoolos.dev | Student |
| owner@schoolos.dev | Platform Super Admin (sign in at `lvh.me:3000`) |

The second tenant mirrors these at `@greenwood.schoolos.dev`. It exists so
cross-tenant isolation can be tested against real data on both sides.

---

## Architecture

Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

```
Browser / future native app
        │  Host header decides the tenant
        ▼
Next.js App Router (server components + server actions + /api/v1)
        │
   requireContext()  ── session + tenant + RBAC + row scope, in one place
        │
   tenantDb(tenantId) ── Prisma client permanently bound to one tenant
        │
   PostgreSQL (shared schema, tenantId discriminator, FK + indexes)
```

**Tenant isolation** is enforced by a Prisma client extension
([`src/server/db/tenant-client.ts`](src/server/db/tenant-client.ts)). Every read
is narrowed by `tenantId`, every write is stamped with it, and a caller-supplied
`tenantId` is overwritten on reads and stripped from updates. A user whose
session belongs to School A gets `401` on School B's host even with a valid
cookie, because `getContext()` compares the session's tenant against the one the
request resolved to.

A drift test reads `prisma/schema.prisma` and fails the build if a model with a
`tenantId` column is not registered with the isolation layer, so a new table
cannot silently ship unscoped.

**Nothing is hardcoded** that a school or a plan should control: brand colours
come from the database as CSS custom properties, module availability and numeric
limits come from the entitlement service, and permissions come from a single
catalogue that both the seed and every server-side check read from.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite |
| `npm run typecheck` | TypeScript, strict mode, no emit |
| `npm run db:up` / `db:down` | Start / stop Postgres and Redis |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:studio` | Prisma Studio |

---

## Project layout

```
prisma/
  schema.prisma         2,400+ lines: every module, normalised, indexed
  migrations/           versioned SQL
  seed.ts               two tenants of realistic, deterministic data
src/
  app/
    (auth)/login/       branded per-tenant sign-in
    (app)/              the school ERP shell and its pages
    (platform)/         the SaaS super-admin console
    api/v1/             versioned REST API
    api/health/         liveness + database readiness probe
  components/
    ui/                 design-system primitives
    shell/              sidebar, topbar, global search, mobile navigation
    dashboard/          stat tiles, charts, child switcher
  lib/
    rbac/               permission catalogue and role definitions
    navigation.ts       one declarative, permission-aware navigation tree
    query.ts            shared pagination / sort / filter contract
  server/
    db/                 Prisma client, tenant isolation, model registry
    auth/               password, session, login
    modules/            per-module services (business logic lives here)
    providers/          email / SMS / WhatsApp / payment / storage / maps / AI
    context.ts          the single authenticated entry point
    entitlements.ts     plan features and limits
    scope.ts            row-level scoping
    audit.ts            audit trail
tests/                  isolation, RBAC, schema-drift and core unit tests
docs/                   architecture, security, API, roadmap
```

---

## API

Versioned, envelope-consistent, and the same services the web UI uses — so a
native iOS/Android client can be built against it without touching the backend.

```bash
# Sign in (the tenant comes from the Host header, never the body)
curl -c jar -X POST http://demo.lvh.me:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@demo.schoolos.dev","password":"Password@123"}'

curl -b jar 'http://demo.lvh.me:3000/api/v1/students?page=1&pageSize=25&q=sharma&sort=admissionNo&dir=asc'
```

Every response has the same shape:

```jsonc
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 25, "total": 120, "totalPages": 5 }, "error": null }
{ "data": null, "meta": null, "error": { "code": "FORBIDDEN", "message": "Missing permission: students.create" } }
```

See [docs/API.md](docs/API.md).

---

## Testing

```bash
npm run db:seed   # the isolation tests assert against seeded data
npm test
```

169 tests covering cross-tenant isolation (read, write, update, delete,
aggregate, groupBy, key-guessing and tenantId injection, plus attendance and
leave), the RBAC matrix, schema drift, password policy, host resolution,
query-contract limits, validation, encryption, rate limiting, geofence
decisions, attendance arithmetic, timezone-stable calendar dates, homework and
notice-audience contracts, timetable rules, upload signature validation, and a
dedicated money suite (minor-unit integrity, concession stacking, allocation
conservation, invoice-status derivation, late fees and refund limits).

---

## Configuration

Every setting is read through [`src/lib/env.ts`](src/lib/env.ts), which
validates on boot — a missing or malformed variable fails immediately rather
than at runtime. See `.env.example` for the full list.

All third-party integrations sit behind provider interfaces
([`src/server/providers/types.ts`](src/server/providers/types.ts)). Out of the
box, email/SMS/WhatsApp use a `log` driver and payments use a signed `mock`
gateway, so the whole pipeline is exercisable with no vendor account. Swapping in
a real provider is a configuration change, not a code change: no vendor name
appears anywhere in business logic.

---

## Security

Detailed notes in [docs/SECURITY.md](docs/SECURITY.md). Summary:

- Tenant isolation enforced in the data layer, plus a session/tenant match check
- Server-side authorization on every route; the UI hides what you cannot do, but
  the server is what refuses it
- Opaque, hashed, revocable sessions (not JWTs) — "sign out everywhere" is real
- bcrypt password hashing, length-first policy, per-account lockout
- Rate limiting on login, mutations and the API
- Zod validation at every entry point, shared with the UI
- Parameterised queries throughout; sort keys resolved against a whitelist
- Third-party secrets encrypted at rest (AES-256-GCM)
- Payments are never trusted from the frontend — a payment moves to `SUCCESS`
  only after server-side verification, and webhook bodies must be signed
- Audit log with before/after snapshots and automatic redaction of secrets
- Secure headers, `httpOnly`/`SameSite`/`Secure` cookies, no secrets in the client
