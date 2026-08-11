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

Add these only when you want the in-app assistant (`docs/ASSISTANT.md`). It stays
switched off — no button, no cost — until `AI_DRIVER` and `AI_API_KEY` are both
set, so leave them out of the first deploy:

```
AI_DRIVER=openai
AI_API_KEY=<your OpenAI key>
AI_MODEL=gpt-4.1
```

They go on the **web** service, in the same Variables editor. Do not put the key
in `railway.json`, a Dockerfile, or any file in the repository: Railway variables
are the only place it belongs, and it is the one secret here that bills you if it
leaks. On the two-service layout below it goes on the **app** service only — the
marketing site never calls a model.

The `${{Postgres.DATABASE_URL}}` syntax is a Railway reference: it resolves to
the private connection string and follows the database if it is ever moved or
rotated. Do not paste the literal URL.

### Why NODE_ENV matters more than it looks

Setting `NODE_ENV=production` does two things at once. At runtime it is
required — it puts the `secure` flag on the session cookie. At install time npm
reads the same variable and skips `devDependencies` entirely.

So every build tool has to live in `dependencies`, which is where
`tailwindcss`, `@tailwindcss/postcss`, `typescript`, `prisma` and `tsx` now
are. If a future dependency is needed by `npm run build`, it belongs there too,
not in `devDependencies`, or the deploy will fail with `Cannot find module`
after the install appears to succeed. The same applies to `@types/*` packages
for anything `src/` imports: the build type-checks the application, and a
missing type declaration stops it as surely as a missing module.

Two consequences worth knowing:

- `package-lock.json` records which packages are dev-only, so moving one
  between the two sections in `package.json` is not enough on its own — run
  `npm install --package-lock-only` afterwards or the lock file will still say
  dev and the install will still skip it.
- The production build type-checks against `tsconfig.build.json`, which leaves
  out `prisma/`, `scripts/`, `tests/` and `vitest.config.ts`. Those import
  devDependencies that a production install correctly omits, and none of them
  is deployed. `npm run typecheck` still covers the whole repository.

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
`prisma migrate deploy` and then `npm run rbac:sync`, which pushes the permission
catalogue and re-grants the built-in roles. That second command is there because
role grants live in the database: adding a permission in code otherwise leaves
the feature it gates invisible to everybody, including the school admin, with no
error anywhere. It is idempotent — on a deploy that changes nothing it prints
`unchanged` for each role — and it leaves roles a school created itself alone.
Then the health check hits `/api/health`, which reports the database round trip. A deployment whose
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

## Step 6b — One service or two?

The website and the application are one Next.js deployment separated by host:
middleware sends the apex and `www` to the marketing pages and every other
hostname to a school. **One service with two domains is the default and needs no
code change** — that is what step 6 set up.

Running them as two services is also supported, and is worth it for one reason
above the others: the marketing site keeps answering while you deploy, migrate,
or break the application. Marketing traffic is also unauthenticated and cacheable
where a school's is neither, so they scale differently.

To do it, deploy the same repository twice and set `APP_ROLE` on each:

| | marketing service | app service |
|---|---|---|
| `APP_ROLE` | `marketing` | `app` |
| Custom domain | `yourdomain.com`, `www.yourdomain.com` | `*.yourdomain.com` |
| `APP_URL` | `https://yourdomain.com` | `https://yourdomain.com` |
| `APP_ROOT_DOMAIN` | `yourdomain.com` | `yourdomain.com` |
| `AI_*` | omit | set |
| `DATABASE_URL`, `REDIS_URL` | same references | same references |

`APP_ROLE` matters more than it looks. Both services still answer on their own
`*.up.railway.app` hostname, and that hostname is not the apex — so without the
role, the *marketing* service would happily serve the platform sign-in page and
the application's API on it. With `APP_ROLE=marketing` that deployment serves the
website on every hostname and redirects application paths to the front page;
with `APP_ROLE=app` it refuses `/site/*`, so the same pages never answer on two
domains. Both are covered by `tests/middleware.test.ts`.

Two things people expect to be true and are not:

- **The marketing service still needs the database.** Every request resolves the
  tenant (there is none on the apex, but the lookup happens), and the demo form
  writes an enquiry. Point it at the same Postgres.
- **It is not half the cost twice.** The web container is the cheap part; Postgres
  and Redis are the steady spend and are shared. Expect a few dollars more, not
  double.

Both services deploy from the same branch, so one push redeploys both. If you
would rather they moved independently, give them separate branches.

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

## Running a one-off command against production

`railway run` executes on **your machine** with the service's variables injected,
so `DATABASE_URL` points at `postgres.railway.internal` — a private hostname that
does not resolve outside Railway. It fails with *"Can't reach database server"*,
which looks like the database is down and is not.

**Use `railway ssh`.** It runs the command inside the container, where the
private hostname resolves and no credential ever reaches your machine:

```bash
railway ssh --service <your web service>
# then, in the container:
npm run rbac:sync
npm run assistant:enable            # with no slug, it lists the schools
```

`railway connect` opens `psql` the same way when you want SQL rather than a
script.

### Do not copy the database URL onto your laptop

Railway also exposes `DATABASE_PUBLIC_URL` for connecting over a TCP proxy, and
it is tempting to paste it into a shell variable to run a script locally. Don't.
That string is a full read-write credential for every school's records, and
pasting it puts it in your shell history file, your terminal scrollback, and any
screenshot or chat log of the session. There is no way to un-paste it — the only
remedy is rotating the password.

If a proxy connection is genuinely necessary — restoring a dump, or a tool that
cannot run in the container — take the credential from an environment reference
rather than by hand, and rotate it afterwards:

```powershell
# Reads the value into the process without printing or storing it
$env:DATABASE_URL = (railway variables --service Postgres --kv |
  Select-String '^DATABASE_PUBLIC_URL=' ).Line -replace '^DATABASE_PUBLIC_URL=', ''
npm run rbac:sync
Remove-Item Env:DATABASE_URL
```

Even then the value is in the process environment for the life of that shell.
`railway ssh` avoids the whole problem.

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
