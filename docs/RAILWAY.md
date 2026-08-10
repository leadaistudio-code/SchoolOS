# Deploying to Railway

Railway runs this as a long-lived Node process with Postgres and Redis beside
it on a private network. That matches what the application actually is — a
server that holds a connection pool, keeps rate-limit counters, and will run a
job worker — rather than something reassembled per request.

Allow about an hour for the first deploy, most of it waiting for DNS.

`railway.json` in the repository root already sets the build command, the start
command, the health check and the pre-deploy migration, so most of the Railway
UI can be left alone.

---

## What you will end up with

| Service | Purpose |
|---|---|
| **web** | the Next.js server, publicly reachable |
| **Postgres** | the database, private network only |
| **Redis** | rate limiting and caching, private network only |
| **worker** | drains the `Job` queue — add this once the worker script exists |

Plus **Cloudflare R2** (or any S3-compatible bucket) for uploaded files. See
"Before you launch" at the end — uploads do not work yet.

Budget roughly **$15–25 a month** at one-school scale: Railway bills by usage,
and the database and Redis are the steady cost.

---

## Step 1 — Create the project

1. Sign in at [railway.app](https://railway.app) with GitHub.
2. **New Project → Deploy from GitHub repo → `leadaistudio-code/SchoolOS`**.
3. Grant Railway access to the repository if prompted.
4. Choose the branch you want deployed.

Railway starts building immediately. **It will fail**, because there is no
database yet. Ignore it; the next step fixes it.

## Step 2 — Add Postgres and Redis

Inside the project canvas:

1. **New → Database → Add PostgreSQL**
2. **New → Database → Add Redis**

Both attach to the project's private network. Nothing else to configure — no
connection pooler, no `sslmode` argument, no connection-limit arithmetic. This
is the main thing you are buying by not going serverless.

## Step 3 — Set the environment variables

Open the **web** service → **Variables** → **Raw Editor**, and paste this,
replacing the two marked values:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
RATE_LIMIT_DRIVER=redis

NODE_ENV=production
AUTH_SECRET=<paste a 48-character random string>
APP_NAME=SchoolOS
APP_URL=https://<your-domain>
APP_ROOT_DOMAIN=<your-domain>

EMAIL_DRIVER=log
STORAGE_DRIVER=local
```

The `${{Postgres.DATABASE_URL}}` syntax is a Railway reference: it resolves to
the private connection string and follows the database if it is ever moved or
rotated. Do not paste the literal URL.

Generate the secret with:

```bash
openssl rand -base64 48
```

Two warnings about `AUTH_SECRET`:

- It signs sessions **and** encrypts the SMTP passwords schools save under
  Settings → Email. Changing it later invalidates every session and makes every
  stored mail password undecryptable.
- Never reuse the value from your `.env`. That one has been on your laptop, in
  your shell history, and possibly in a screenshot.

Until you have a domain, set `APP_URL` and `APP_ROOT_DOMAIN` to the
`*.up.railway.app` host Railway gives you in step 5.

## Step 4 — Deploy

**Deployments → Deploy**, or push to the branch.

The build runs `prisma generate && next build`; the pre-deploy step runs
`prisma migrate deploy` against the new database; then the health check hits
`/api/health`, which reports the database round trip. A deployment whose
database is unreachable answers 503 and Railway will not put it into service —
so a broken deploy stays off the domain rather than replacing a working one.

Watch for, in order:

- `Applying migration 20260808112143_init` and the rest, then `4 migrations applied`
- `Compiled successfully`
- `Starting...` followed by the health check passing

## Step 5 — Create the first school

The database now has tables and no rows. Nobody can sign in yet.

> **Do not run `npm run db:seed` against this database.** It creates two
> fictional schools and about 340 users, every one with the password
> `Password@123`. It is demo data for a laptop, not a starting point for a
> deployment that will hold real children's records.

Point Prisma Studio at production from your machine:

```bash
railway login
railway link                      # choose the project
railway run npx prisma studio
```

`railway run` injects the service's environment, so Studio opens against the
production database. Create, in this order:

1. **Tenant** — `slug` is the subdomain a school is reached at, `status` `ACTIVE`
2. **School** — `tenantId` pointing at it, plus name and code
3. **User** — `tenantId`, `email`, `firstName`, `lastName`, and a bcrypt
   `passwordHash`
4. **UserRole** — joining that user to the `SCHOOL_ADMIN` role

Generate the password hash locally:

```bash
node -e "console.log(require('bcryptjs').hashSync('YourPassword', 12))"
```

If you would rather script it, copy `seedTenant()` from `prisma/seed.ts` into a
one-off file and run it with `railway run npx tsx yourfile.ts`.

## Step 6 — Domain and tenant subdomains

Schools are resolved from the host name, so this needs a wildcard.

1. **web service → Settings → Networking → Custom Domain**
2. Add `yourdomain.com`, then add `*.yourdomain.com` as a second domain.
3. Railway shows a CNAME target for each. Add both at your registrar:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `@` (or `www`) | the target Railway shows |
   | CNAME | `*` | the same target |

   Some registrars will not CNAME the apex — use an ALIAS/ANAME record there,
   or run the app on `app.yourdomain.com` and wildcard `*.yourdomain.com`.

4. Wait for propagation (minutes to a few hours). Railway issues certificates
   automatically, including for the wildcard.
5. Update `APP_URL` and `APP_ROOT_DOMAIN` to the real domain and redeploy, so
   the tenant resolver and the host header agree.

Then check: `https://<tenant-slug>.yourdomain.com` shows that school's name and
colours, and the bare domain shows no tenant.

## Step 7 — Verify before anyone else uses it

- Sign in as the administrator you created.
- Confirm the sidebar shows that school's name and branding.
- Settings → Email: connect the school's mailbox and **send the test message**.
  It has to arrive before you trust fee reminders to it.
- Create a second tenant, then confirm from an account in the first that none
  of its data is visible anywhere. In a multi-tenant product this is the check
  that matters most.
- **Observability → Logs** during all of the above: no `PrismaClientValidationError`,
  no unhandled rejections.

## Step 8 — Backups

Railway does not back up your database on the starter plan by default.

- **Postgres service → Settings → Backups**, and enable scheduled backups.
- Take a manual dump before every migration that drops or renames a column:

  ```bash
  railway run pg_dump --no-owner --format=custom > backup-$(date +%F).dump
  ```

Test a restore once, into a scratch project. An untested backup is a rumour.

## Step 9 — The worker service (once it exists)

The `Job` table records queued email, SMS and WhatsApp, and nothing drains it
yet — notifications to 25 recipients or fewer are delivered inline, larger
batches sit in the queue. When the worker script is written:

1. **New → GitHub Repo → the same repository**
2. **Settings → Start Command**: `npx tsx scripts/worker.ts`
3. **Settings → Networking**: leave it private, it serves no traffic
4. **Variables**: the same `DATABASE_URL` and `REDIS_URL` references as the web
   service

One replica is enough until mail volume justifies more.

---

## Before you launch

Two gaps, neither specific to Railway:

**Uploads lose files.** `storageProvider()` always returns the local-disk
driver — `STORAGE_DRIVER=s3` is accepted by the environment schema but the
driver behind it was never written. Railway containers have an ephemeral
filesystem, so student photographs and homework attachments would be written
and then disappear on the next deploy. Either the S3 driver gets built and
pointed at Cloudflare R2, or the upload screens stay unused. This is the one
that costs data rather than convenience.

**Queued notifications do not send.** As above: fine at one-to-one volumes,
silent at class-broadcast volumes.

---

## Day-to-day

| Task | How |
|---|---|
| Deploy | push to the branch; Railway builds automatically |
| Roll back | **Deployments →** older deployment **→ Redeploy** |
| Run a migration | included in every deploy via the pre-deploy command |
| Open a psql shell | `railway connect Postgres` |
| Tail logs | `railway logs` |
| Run a one-off script | `railway run npx tsx scripts/whatever.ts` |
| Scale up | **web → Settings → Replicas**; Redis-backed rate limiting makes this safe |
