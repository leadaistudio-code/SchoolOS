# Security Architecture

## Threat model

The assets worth protecting, in order: **another school's data**, **money**
(fees, refunds), **children's personal data** (addresses, medical notes, photos,
transport stops), and **academic records** (marks, results, certificates).

The attackers assumed: a curious or malicious authenticated user of one tenant,
a compromised low-privilege account (a student, a parent), an attacker holding a
stolen session cookie, and an unauthenticated attacker probing the API.

---

## 1. Tenant isolation

See ARCHITECTURE.md §3. Four layers, all covered by tests:

| Attack | Result |
| --- | --- |
| List another tenant's students | Own rows only |
| Read another tenant's record by guessed primary key | `null` |
| Pass another tenant's `tenantId` in a filter | Overwritten with own tenant |
| Update or delete another tenant's record | Throws; row untouched |
| `updateMany` / `deleteMany` across the boundary | Re-scoped; other tenant untouched |
| Create a row stamped with another `tenantId` | Stamped with own tenant |
| Aggregate or `groupBy` across tenants | Own tenant only |
| Replay a valid School A cookie on School B's host | `401` |

### Optional Postgres RLS

`prisma/rls.sql` contains row-level-security policies as defence in depth. It is
**not applied by default**.

To enable:

1. Create a non-owner Postgres role for the app (table owners bypass RLS unless
   `FORCE` is set — the script forces policies, but a dedicated role is safer).
2. Apply policies: `psql "$DATABASE_URL" -f prisma/rls.sql`
3. Set `DATABASE_RLS=true` so `tenantTx()` runs
   `SET LOCAL app.tenant_id = '<tenant>'` inside each tenant transaction.

Without step 3, policies would see an empty GUC and block every row. Leave the
flag false in local development unless you have completed the steps above.

---

## 2. Authentication

- **bcrypt**, cost 12.
- **Length-first password policy** (default 10 characters, mixed case, a digit).
  A long passphrase beats short symbol-soup, especially for parents typing on a
  phone.
- **Opaque session tokens**, 256 bits of entropy, stored **hashed** (SHA-256)
  server-side. Not JWTs: revocation, device listing and impersonation have to be
  exact, not eventually consistent.
- **Cookies**: `httpOnly`, `SameSite=Lax`, `Secure` in production, scoped path.
- **Per-account lockout**: 8 failed attempts locks the account for 15 minutes,
  and survives a rate-limit window reset.
- **Rate limiting per identifier *and* per IP**, so neither a single-account
  brute force nor a spray across many accounts gets far.
- **No user enumeration**: unknown user and wrong password return the same
  message.
- **The tenant comes from the Host header, never the form.** Credentials cannot
  be aimed at a school the caller did not connect to.
- **Changing a password revokes every other session.** If the password was
  changed because it leaked, leaving the attacker signed in elsewhere would
  defeat the point.
- Every attempt, successful or not, is recorded in `LoginEvent` with IP and user
  agent.

### Reset and invitation links

Both are the same mechanism (`VerificationToken`) with different lifetimes:
a reset lasts an hour, an invitation a week.

- The token is 256 bits of entropy and is stored **only as a SHA-256 hash**, so
  a database leak cannot be replayed into account takeover.
- **Single use, and issuing a new one invalidates the previous** — a "resend"
  does not leave another live key under the doormat.
- **Bound to the issuing school.** A link opened on another tenant's host is
  refused outright.
- **Spent in the same transaction that writes the password**, so a crash cannot
  both burn the link and leave the password unchanged.
- **Redeeming does not create a session.** The user is sent to the sign-in page,
  so an account with MFA still has to present its second factor — otherwise a
  mailbox compromise would be a way around it.
- Redeeming **revokes every existing session** and clears the lockout counter,
  which is also the intended way out of a lockout.
- Requesting a reset **answers identically whether or not the address exists**.
  Where the school has no mailbox connected and the platform has no email driver,
  the request falls back to a support ticket for the platform team; that choice
  depends on the school's configuration, never on the address typed.
- Super admins have no tenant host to receive a link on and remain reset by CLI
  (`npm run reset:password`).

### WhatsApp one-time codes

The primary self-service path. A six-digit code is a small secret, so what
makes it safe enough to reset a password with is everything bounding it:

- **Ten-minute expiry, five wrong guesses, then dead** (`VerificationToken.attempts`).
  Rate limited per number and per IP on top of that.
- **The code is never stored.** An HMAC keyed with `AUTH_SECRET` is, so a
  database leak alone does not reveal a live code.
- **Proving the code does not sign anyone in.** It exchanges for the same
  short-lived `PASSWORD_RESET` token the emailed link carries, so the password
  is set through one shared path and **MFA still applies** at the sign-in that
  follows. Without this, a phone would be a way around the second factor.
- **An unknown number is answered exactly like a known one** — a challenge is
  returned that no row backs, so verification fails as any wrong code does.
  The same applies when a request is throttled. Answering honestly would turn
  the form into a way of asking "does this child attend this school?", which
  is a safeguarding question before it is a security one.
- **Challenges are tenant-bound**; a code issued for one school is worthless
  on another's host.
- Requesting a new code retires the previous one.

**Residual risk worth naming:** whoever controls the phone can reset the
account. For a parent that is the intended trade. For a `SCHOOL_ADMIN` it means
a SIM swap reaches the whole school's data — so admin accounts should carry
MFA, which the exchange design above deliberately preserves.

Platform super admins are excluded from every self-service path and remain
CLI-only (`npm run reset:password`).

### Temporary passwords issued at the counter

For the people an emailed link never reaches — a mistyped address, a mailbox
nobody checks, a parent who does not use email — an administrator holding
`users.edit` can issue a temporary password from Settings → Users.

- Generated from pronounceable syllables with ambiguous characters removed
  (no `l/I/1`, `O/0`, `S/5`), because the failure mode is a parent who cannot
  transcribe it rather than an attacker who guesses it.
- **Shown once**, to the administrator who asked for it. The server keeps only
  the bcrypt digest, so there is nothing to retrieve afterwards. The plaintext
  is never written to the audit log — the log records that one was issued, by
  whom and for whom.
- **Expires in 24 hours** (`User.tempPasswordExpiresAt`), checked at sign-in
  *after* the password itself so an expired one cannot be used to probe which
  accounts have had a reset issued.
- **Forces a password change at first sign-in** (`mustChangePassword`, enforced
  in `requireContext`), and **revokes every live session** on issue.
- Refused for a disabled account, and for the administrator's own account —
  which would sign them out mid-action. `Account → Password` is that path.

---

## 3. Authorization

- 120 permissions in one catalogue; roles are unions of permissions.
- Checked **server-side on every path**. The UI hides unavailable actions as a
  usability measure; it is never the control.
- `route()` wraps API handlers with authentication, tenant binding, the
  permission check, rate limiting and error shaping, so an individual route
  cannot omit one of them.
- Row-level scoping decides *which* records a self-scoped role sees, separately
  from *whether* that role may see such records at all.
- Tests assert the negative cases: parents and students hold no `fees.collect`,
  `staff.*`, `settings.*`, `users.*`, `roles.*` or `audit.*` permission; teachers
  hold no `fees.collect`, `fees.refund` or `exams.publish`.

---

## 4. Input handling

- **Zod at every entry point** — API bodies, form actions, CSV imports, query
  strings. The API and the UI share one schema, so they cannot disagree about
  what is valid.
- **Parameterised queries throughout.** The few raw SQL statements (date
  bucketing for dashboard trends) use tagged-template parameters, never string
  concatenation.
- **Sort keys resolve against a whitelist** before reaching the query planner;
  anything else falls back to the default ordering.
- **Page size is capped** at 100, so a client cannot request the whole table.
- **Uploads** are validated for MIME type and size, stored under generated keys,
  and served through a permission-checked route rather than a public bucket path.

---

## 5. Payments

The rule: **the frontend never decides that money moved.**

```
Create invoice -> create FeePayment (INITIATED) -> gateway
                                                     |
         webhook (signature verified)  <-------------+
                     |
         allocate -> update invoice balance -> receipt -> notify
```

- A payment reaches `SUCCESS` only after server-side verification: a signed
  webhook, or a server-to-server fetch on return.
- Webhook signatures are verified with a constant-time comparison; unsigned or
  mis-signed bodies are rejected and recorded.
- `@@unique([provider, providerPaymentId])` makes a replayed webhook a no-op.
- `@@unique([tenantId, idempotencyKey])` makes a retried client request safe.
- `PaymentEvent` stores every callback verbatim for reconciliation and forensics.
- Allocation and invoice-balance updates happen in one transaction.
- Refunds require `fees.refund` and are audited with before/after snapshots.

---

## 6. Secrets

- Read only through `src/lib/env.ts`, which validates on boot — a missing or
  malformed variable fails at startup, not inside a payment webhook at 2am.
- Tenant-held third-party secrets (payment keys, SMTP passwords) are encrypted at
  rest with **AES-256-GCM** and flagged `isSecret`; they never reach the client.
- No secret is referenced in any client component or `NEXT_PUBLIC_` variable.
- Audit payloads are scrubbed: `passwordHash`, `password`, `mfaSecret`,
  `tokenHash`, `providerSignature` and `bankAccount` are redacted before storage.

---

## 7. Audit trail

Every sensitive operation writes an `AuditLog` row: actor, tenant, action,
module, entity, before/after snapshots, IP, user agent, timestamp. Fee edits,
refunds, student archival, permission changes, result modification, logins and
impersonation are all covered.

Impersonation by a super admin is stamped on the session (`impersonatedById`),
shown as a persistent banner to whoever is impersonating, and recorded — support
access is never invisible to the school.

---

## 8. Transport and headers

Set globally in `next.config.ts`: `Strict-Transport-Security` (2 years,
preload), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
denying camera and microphone while allowing geolocation to same-origin only
(needed for geofenced staff attendance). `X-Powered-By` is disabled.

---

## 9. Known limitations

Stated plainly rather than left implied:

- **Postgres RLS ships but is not enabled by default** (§1). Application-level
  isolation is the enforced mechanism today; set `DATABASE_RLS=true` only after
  applying `prisma/rls.sql` with a non-owner role.
- **Rate limiting is multi-instance when Redis is configured.** Set
  `RATE_LIMIT_DRIVER=redis` and `REDIS_URL`. Without Redis the limiter falls
  back to per-process memory (fine for a single instance).
- **Entitlements are cached in Redis for 60s** when Redis is available, and
  invalidated when platform overrides or plan entitlements change.
- **MFA is available for school users.** Enrol at `/settings/security` (TOTP
  authenticator app). Sign-in pauses for a `/login/mfa` challenge when
  `User.mfaEnabled` is true. Platform accounts are unchanged.
- **The local storage driver is for development.** Use S3-compatible storage in
  production so uploads do not live on the app instance disk.
- **Geofenced attendance trusts a cooperating client for location.** Coordinates,
  accuracy, computed distance and a mock-location flag are recorded, and admin
  override is audited — but GPS from a user-controlled device cannot be made
  authoritative. Treat it as strong evidence, not proof.
- **CSRF**: server actions carry Next.js's built-in origin protection and session
  cookies are `SameSite=Lax`. Add explicit origin checks before exposing any
  state-changing endpoint to cross-origin callers.
