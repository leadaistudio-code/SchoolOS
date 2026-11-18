# Ops follow-ups — RLS and secrets (M-04 / I-02)

These items are **not** flipped in production by the code remediation PR. They need an explicit ops window.

## M-04 — Postgres RLS

1. Apply `prisma/rls.sql` on a **staging** database with a non-owner app role.
2. Set `DATABASE_RLS=true` only after `tenantTx` smoke tests pass (login, fees, certificates, imports).
3. Confirm the app role is not the table owner (owner bypasses RLS).
4. Then promote the same sequence to production.

Do not enable `DATABASE_RLS=true` against the current owner connection string without the staging bake — it can fail open or break writes.

## I-02 / M-03 — Credential classes to rotate (no values in this file)

After the Railway credential-exposure class of incident, rotate when ready (maintenance window):

- `AUTH_SECRET` (forces re-login)
- Database password / `DATABASE_URL` credentials
- Redis URL credentials
- S3 / object storage keys
- WhatsApp / Meta tokens and inbound secrets
- `CRON_SECRET` (update all Railway schedulers in the same change)
- Payment / email / SMS / search API keys

## M-03 — Public Postgres TCP proxy

Application services already use `postgres.railway.internal`. The public TCP proxy on the Postgres service should be removed unless a named operator workflow still needs it (prefer `railway connect` / private networking).
