# Deploying to Netlify

This is a server-rendered, multi-tenant application with a Postgres database.
Every page is rendered on demand, because the same route renders differently
for each school. Netlify runs it as Functions through the Next.js runtime; the
database, cache and object storage are external services you provide.

---

## Before you start: three things that do not work as-is

Read these first. Two are one-line fixes; one needs code.

### 1. File uploads will not persist

`storageProvider()` in `src/server/providers/index.ts` always returns the local
disk driver — the `s3` option is declared in the environment schema but the
driver behind it was never written. Serverless functions have no durable disk,
so anything uploaded (student photographs, homework attachments, documents)
would be written to a temporary directory and lost on the next request.

Choose one:

- **Implement the S3 driver** before launch and point it at S3, R2 or Spaces.
- **Launch without uploads** and avoid the upload screens until it is built.

Deploying with `STORAGE_DRIVER=local` and using uploads will silently lose
files. It is the one item on this page that will cost you data rather than
just convenience.

### 2. Rate limiting across instances

`RATE_LIMIT_DRIVER` defaults to in-memory (fine for one process). For more than
one app instance set `RATE_LIMIT_DRIVER=redis` and `REDIS_URL` (Upstash speaks
the Redis protocol). Counters use an atomic Lua script; if Redis is down the
app falls back to memory and keeps serving. Entitlement lookups are also cached
in Redis for 60 seconds when available.

### 3. Tenant subdomains need wildcard DNS

Schools are resolved from the host name — `stjohns.yourdomain.com`. That needs
a `*.yourdomain.com` DNS record **and** a wildcard TLS certificate. On Netlify
that means letting Netlify DNS manage the domain, which provisions the wildcard
certificate for you. If you keep DNS elsewhere, you can still run:

- one school on the apex domain, or
- a custom domain per school, which the `TenantDomain` table already supports —
  add each one in Netlify's domain settings.

---

## Step 1 — Create the database

Netlify does not host Postgres. Use any managed provider; Neon and Supabase
both have free tiers and both offer a **pooled** connection string, which is
what serverless needs. A direct connection will exhaust the server's connection
limit under load.

You need two URLs:

| Variable | Which string | Used by |
|---|---|---|
| `DATABASE_URL` | **pooled** (PgBouncer / Neon pooler) | the running app |
| `DIRECT_URL` | direct, unpooled | `prisma migrate deploy` |

Neon calls these "Pooled connection" and "Direct connection". On Supabase the
pooled one is port `6543`, the direct one `5432`.

Add `?sslmode=require` if your provider needs it, and `&pgbouncer=true` on the
pooled URL for Prisma.

## Step 2 — Point the schema at both URLs

Migrations cannot run over a pooled connection. Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Add `DIRECT_URL` to `src/lib/env.ts` alongside `DATABASE_URL` so a missing
value fails at boot rather than at migration time.

## Step 3 — Apply migrations

Run once from your machine, against the production database:

```bash
DATABASE_URL="<direct url>" npx prisma migrate deploy
```

After this the production context of every Netlify build runs
`prisma migrate deploy` automatically (see `netlify.toml`), so later schema
changes ship with the deploy that needs them.

## Step 4 — Create the first school

**Do not run `npm run db:seed` against a real database.** It creates two demo
schools and about 340 users, all with the password `Password@123`.

For a real deployment, insert one tenant, one school and one administrator.
Write a small script modelled on `seedTenant()` in `prisma/seed.ts`, or run
`npx prisma studio` against the production URL and create the rows by hand:
`Tenant` → `School` → `User` (with a bcrypt hash) → `UserRole` pointing at the
`SCHOOL_ADMIN` role.

If you only want a demo online, seeding is fine — but change every password
afterwards and never point it at a database holding real children's records.

## Step 5 — Connect the repository

In Netlify: **Add new site → Import an existing project → GitHub →
`leadaistudio-code/SchoolOS`**.

Netlify reads `netlify.toml`, so leave the build command and publish directory
alone. Pick the branch you want deployed; `master` once this branch is merged.

## Step 6 — Set environment variables

**Site configuration → Environment variables.** Mark everything except
`APP_*` as secret.

Required — the app refuses to boot without them:

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled Postgres URL |
| `DIRECT_URL` | direct Postgres URL |
| `AUTH_SECRET` | 32+ random characters — `openssl rand -base64 48` |

Set these too, or you will get development behaviour in production:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | cookie security and error verbosity |
| `APP_URL` | `https://yourdomain.com` | absolute links in email |
| `APP_ROOT_DOMAIN` | `yourdomain.com` | how a subdomain becomes a school |
| `APP_NAME` | your product name | titles and email |
| `RATE_LIMIT_DRIVER` | `redis` | see the warning above |
| `REDIS_URL` | your Redis URL | required by the above |
| `EMAIL_DRIVER` | `smtp` | needed for demo requests from the website; schools still connect their own SMTP in Settings → Email |
| `SMTP_URL` | your mailbox | see below |
| `EMAIL_FROM` | `"MyCampusView <contact@yourdomain.com>"` | must be the mailbox you authenticate as |

`AUTH_SECRET` also encrypts the SMTP passwords schools save in Settings →
Email. **Changing it later makes every stored mail password undecryptable** and
each school will have to re-enter theirs.

### The platform mailbox

A demo request from the website is stored in the database and emailed to the
sales inbox. The database copy is the durable one — the email is how anybody
finds out it arrived, so an unconfigured mailbox loses no leads but answers
none either.

`SMTP_URL` is any mailbox that speaks SMTP. For one hosted with Hostinger:

```
SMTP_URL=smtps://contact%40yourdomain.com:PASSWORD@smtp.hostinger.com:465
```

- The username is the full address, and the password is the **mailbox**
  password, not the Hostinger account password.
- Percent-encode `@`, `/` and `+` in both (`%40`, `%2F`, `%2B`).
- `smtps://` is implicit TLS on 465. If the host blocks outbound 465, use
  `smtp://…@smtp.hostinger.com:587`, which is STARTTLS.
- `EMAIL_FROM` must be that mailbox or an alias of it. Hostinger rejects a
  From address it does not own.

Enquiries go to `SALES_INBOX` if it is set, and otherwise to the address
published on the site (`CONTACT.sales` in `src/content/site/company.ts`). Set
it on staging so test submissions do not reach the sales team.

Prove the whole path before you rely on it:

```bash
npm run mail:doctor              # sends a sample enquiry to the sales inbox
npm run mail:doctor -- you@x.com # or somewhere else
```

It reports the configuration, authenticates, sends one real enquiry email, and
names the thing to change when a step fails. Check the spam folder the first
time — if it lands there, add SPF and DKIM for the sending domain.

## Step 7 — Deploy

Trigger the first deploy. Expect roughly two to four minutes. Watch the log for:

- `prisma migrate deploy` reporting no pending migrations,
- `Compiled successfully`,
- the Next.js runtime reporting the routes it packaged.

If the build fails on `@prisma/client did not initialise yet`, the generate
step did not run — confirm `npm run build` still begins with `prisma generate`.

## Step 8 — Domain and subdomains

1. **Domain management → Add a domain**, and let Netlify DNS manage it.
2. Point your registrar at the four Netlify nameservers.
3. Once DNS has propagated, add `*.yourdomain.com` as a domain alias. Netlify
   issues the wildcard certificate.
4. Set `APP_ROOT_DOMAIN` to the bare domain and redeploy so the tenant resolver
   agrees with reality.

Check it: `https://<school-slug>.yourdomain.com` should show that school's
branding, and `https://yourdomain.com` should show no tenant.

## Step 9 — Verify before announcing it

- Sign in as the administrator you created.
- Confirm the school name and colours in the sidebar are that school's.
- Open Settings → Email, connect the school's mailbox and **send the test
  message**. It must arrive before you trust fee reminders to it.
- Create a second tenant and confirm from an account in the first that you
  cannot see any of its data. This is the check that matters most in a
  multi-tenant product.
- Watch **Logs → Functions** during the above for cold-start errors.

---

## Provisioning schools

Two equivalent paths:

1. **Platform console** — sign in as a super admin at `/platform`, open
   **Schools**, and use **Provision school**. This runs the same shared
   `provisionSchool()` service as the CLI.
2. **CLI** — `npm run setup:school` (or `npx tsx scripts/create-school.ts`) for
   first-run setup on a fresh database without using the browser.

Both create the tenant, subscription, default domain, academic session and school
administrator. The console is for day-to-day SaaS operations; the CLI remains
the right tool when the database has no roles or permissions yet.

---

## Known limitations in production

| Area | Behaviour | Fix |
|---|---|---|
| File uploads | lost — local disk driver on ephemeral storage | implement the S3 driver |
| Queued email/SMS | `Job` rows are written but nothing drains them; notifications to 25 or fewer recipients send inline | build the worker (Phase 8) |
| Rate limiting | per-instance unless Redis is configured | `RATE_LIMIT_DRIVER=redis` |
| Postgres RLS | Opt-in: apply `prisma/rls.sql`, use a non-owner role, set `DATABASE_RLS=true` so `tenantTx()` issues `SET LOCAL app.tenant_id` | leave off in local/dev unless configured |
| MFA (TOTP) | School users enrol at `/settings/security`; challenge at `/login/mfa` | optional per user |

| Cold starts | first request after idle is slow | expected on serverless |

---

## If you would rather not use serverless

This application is a long-running server by nature: a job queue, a mail
transport, connection pooling and file storage all want a process that stays
up. A container host — Railway, Render, Fly, or any VPS running
`npm run build && npm start` — removes every limitation in the table above
except the ones that need code. Netlify works, and this guide is accurate for
it, but it is the harder fit.
