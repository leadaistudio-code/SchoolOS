# MyCampusView — Security Audit Report

**Product:** MyCampusView (School ERP SaaS)  
**Production:** https://www.mycampusview.com · https://app.mycampusview.com  
**Host:** Railway (School OS project)  
**Audit date:** 18 November 2026  
**Mode:** Audit-first — **no remediation applied**, no destructive or authenticated production testing  
**Standards:** OWASP Top 10:2025, OWASP API Security Top 10:2023, ASVS (selected)

---

## 1. Executive summary

MyCampusView has a **serious, well-documented multi-tenant design** (host-bound sessions, Prisma `tenantDb()` extension, RBAC with ~228 permission keys, opaque hashed sessions, bcrypt passwords, rate limits, audit log). Existing docs (`docs/SECURITY.md`) and tests (`tests/tenant-isolation.test.ts`) align with that design.

This audit **did not** run authenticated cross-school attacks or ZAP/DAST against production. Cross-tenant isolation is therefore **code-reviewed and unit-tested in repo**, not dynamically verified on a staging pair of schools.

**Confirmed issues that should be fixed before treating the platform as release-hardened:**

| Severity | Count (confirmed) |
|----------|-------------------|
| Critical | 0 (no confirmed unauthenticated RCE / auth bypass in this review) |
| High | 2 |
| Medium | 7 |
| Low / Info | 8+ |

**Highest priorities:** certificate stored XSS + unescaped template variables; public `/api/metrics` (and `/api/health`) on the internet; missing Content-Security-Policy; Postgres public TCP proxy; production defence-in-depth RLS still off; dependency advisories (Next.js / SheetJS / Nodemailer); credential hygiene after Railway’s Oct 2026 incident.

---

## 2. Scope and methodology

### In scope

- Full repository static review (`src/`, `prisma/`, `scripts/`, deployment docs)
- Passive production HTTP header / endpoint probes (read-only, rate-limited)
- `npm audit` software composition analysis
- Railway configuration review via authorised MCP (env **key presence**, TCP proxies — **secret values not reproduced in this report**)

### Out of scope / not executed

| Item | Reason |
|------|--------|
| Authenticated DAST / ZAP Full Scan | No staging URL/credentials provided; production intrusive scans forbidden |
| Live cross-tenant IDOR with two schools | Requires isolated staging tenants |
| Brute-force / DoS / load tests | Explicitly disallowed |
| Payment gateway live exploitation | `PAYMENT_DRIVER=mock` in reviewed production WebApp; sandbox only |
| Gitleaks / Semgrep / Trivy / OSV | Tools not installed in this environment |
| Credential rotation | Requires explicit user approval |

### Evidence standards

Findings are labelled **Confirmed** (code or live probe) or **Suspected** (needs staging/runtime proof). Scanner SCA items are **advisory** until mapped to runtime exposure.

---

## 3. Technology stack (inventory)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15.5.x, React 19 |
| API | App Router route handlers under `/api/v1/*`, `/api/cron/*` |
| ORM / DB | Prisma 6.2 + PostgreSQL |
| Cache / limits | Redis (ioredis) optional; in-memory fallback |
| Auth | Custom opaque sessions (SHA-256 hashed), bcrypt cost 12, optional MFA TOTP |
| Tenancy | Shared DB + `tenantId`; `tenantDb()` Prisma extension; optional `prisma/rls.sql` |
| Storage | S3-compatible (`STORAGE_DRIVER=s3`) via permission-checked proxy |
| Hosting | Railway; Cloudflare at edge for marketing |
| Roles | SUPER_ADMIN, MYCAMPUS_SUPPORT, SCHOOL_ADMIN, PRINCIPAL, TEACHER, PARENT, STUDENT, … |

**Architecture (tenant request path):**

```
Host → resolveTenant() → Session → getContext()
  → match user.tenantId → tenantDb(tenantId) → optional RLS SET LOCAL
```

Platform operators: `tenantId === null`, unscoped Prisma, `/platform/*`.

---

## 4. Test environment details

| Environment | Use |
|-------------|-----|
| Production www / app | Passive headers, `/api/health`, `/api/metrics` only |
| Local repo | Static analysis, `npm audit` |
| Staging | **Not available** — requested for Phase 5 DAST / Phase 4.1 isolation |

---

## 5. OWASP Top 10:2025 coverage

| ID | Category | Coverage | Result snapshot |
|----|----------|----------|-----------------|
| A01 | Broken Access Control | Static + design review; unit tests exist | Strong design; live BOLA matrix **not** run |
| A02 | Security Misconfiguration | Passive headers + config | Missing CSP; public metrics/health; DB TCP proxy |
| A03 | Software Supply Chain | `npm audit` | Critical/high advisories present; tools limited |
| A04 | Cryptographic Failures | Code review | Generally strong (bcrypt, hashed sessions); long session TTL |
| A05 | Injection | Static | No confirmed SQLi; **confirmed XSS** in certificates |
| A06 | Insecure Design | Architecture | RLS optional/off; cron privilege blast radius |
| A07 | Authentication Failures | Code + docs | Solid login/lockout/reset design; CSRF relies on SameSite |
| A08 | Integrity Failures | Webhooks + deps | Payments signed; AiSensy URL-secret only; xlsx unfixed |
| A09 | Logging & Alerting | Code | `AuditLog` + `LoginEvent`; no evidence of real-time security alerting |
| A10 | Exceptional Conditions | Code | API hides stacks; fail-closed patterns in auth/tenant match |

---

## 6. Findings (confirmed / high-confidence)

### HIGH

#### H-01 — Stored XSS via certificate templates  
**OWASP:** A05 · **CWE-79**  
**Component:** `src/app/(app)/exams/certificates/[id]/page.tsx`, `src/lib/certificates.ts`  
**Evidence:** `bodyHtml` accepted as raw `z.string()`; rendered with `dangerouslySetInnerHTML`; `renderCertificateBody` injects variables **without HTML escaping**.  
**Impact:** Staff with template rights can execute script in the app origin for other users viewing certificates; student/purpose fields can break out of markup.  
**Status:** Confirmed (code)

#### H-02 — Public Prometheus metrics on production  
**OWASP:** A01 / A02 · **CWE-200**  
**Component:** `GET /api/metrics` (`src/app/api/metrics/route.ts`)  
**Evidence:** Live probe `https://www.mycampusview.com/api/metrics` returned uptime, RSS/heap, DB/Redis latency, Node version, `env=production`. Code comments say “expose only behind private network” but endpoint is public.  
**Impact:** Recon for attackers; infrastructure fingerprinting.  
**Status:** Confirmed (live)

### MEDIUM

#### M-01 — Public `/api/health` exposes dependency liveness  
**OWASP:** A02 · **CWE-200**  
**Evidence:** Live JSON with `database`/`redis` status. Acceptable for LB if locked down; currently world-readable.  
**Status:** Confirmed (live)

#### M-02 — No Content-Security-Policy on public responses  
**OWASP:** A02  
**Evidence:** Response headers on www/app include HSTS, `X-Frame-Options`, `X-Content-Type-Options`, Referrer-Policy — **no CSP**.  
**Impact:** Amplifies XSS (H-01) and third-party script risk.  
**Status:** Confirmed (live)

#### M-03 — Postgres exposed via public Railway TCP proxy  
**OWASP:** A02  
**Evidence:** Active TCP proxy `shuttle.proxy.rlwy.net:50792` → Postgres 5432. App uses private `postgres.railway.internal`; public proxy increases attack surface if credentials leak.  
**Status:** Confirmed (Railway config)

#### M-04 — Postgres RLS not enabled in production  
**OWASP:** A06  
**Evidence:** `docs/SECURITY.md` states RLS is opt-in; production WebApp env has no `DATABASE_RLS=true`. Isolation depends solely on application `tenantDb()`.  
**Impact:** Single missed query / bug = cross-tenant leak with no DB safety net.  
**Status:** Confirmed (config + docs)

#### M-05 — AiSensy WhatsApp webhook authenticated only by URL secret  
**OWASP:** A08 / API7  
**Component:** `src/server/modules/whatsapp-receipts/webhook.ts`  
**Evidence:** Meta path verifies HMAC; AiSensy documents URL key only.  
**Status:** Confirmed (code)

#### M-06 — Next.js / dependency advisories (SCA)  
**OWASP:** A03  
**Evidence:** `npm audit` — Next.js listed **critical** (includes Windows RCE, Image Optimization AVIF RCE, SSG/ISR cache poisoning). Runtime is Linux on Railway (Windows RCE likely N/A); Image/cache issues need version pinning and config review. Also **xlsx** high with **no fix**, **nodemailer** high (fix available).  
**Status:** Advisory / suspected until exploitability validated on your build flags

#### M-07 — Cron `CRON_SECRET` compromise → high privilege  
**OWASP:** A06 / A07  
**Evidence:** `growth-discovery` cron synthesises SUPER_ADMIN-like context after secret check; secret compared with `!==` (not timing-safe).  
**Status:** Confirmed design risk (code)

### LOW / INFO

| ID | Issue | Notes |
|----|-------|-------|
| L-01 | Session TTL 720 hours | Long-lived stolen cookie window |
| L-02 | No CSRF tokens | Relies on `SameSite=Lax` |
| L-03 | Domain HTTPS probe SSRF-ish | Admin-supplied host fetch to `/api/health` |
| L-04 | Report-card signature file key looseness | Suspected IDOR-ish read of signature assets |
| L-05 | Inbound WhatsApp `?token=` in query | May hit logs/proxies |
| L-06 | `PAYMENT_DRIVER=mock` on production WebApp | Business/integrity risk if live fees expected via this service |
| L-07 | Vitest critical advisories | DevDependency — lower prod risk if UI server not exposed |
| I-01 | Strong positives | bcrypt 12, opaque sessions, host-bound login, lockout, audit scrubbing, S3 proxy ACL, Razorpay HMAC |

---

## 7. Multi-tenant isolation

| Check | Result |
|-------|--------|
| Design (tenantDb, host binding, cookie mismatch → 401) | Reviewed — strong |
| Automated tests in repo | Present (`tests/tenant-isolation.test.ts`) |
| Live School A vs School B authenticated probes | **Not performed** (no staging) |
| DB RLS force policies | **Off** in production |

**Verdict:** Isolation is a first-class design. Treat **dynamic dual-tenant verification** as a mandatory follow-up before claiming “verified isolation.”

---

## 8. Authentication & authorization

| Area | Assessment |
|------|------------|
| Password / session / reset | Strong (per `docs/SECURITY.md` + code) |
| MFA | Supported |
| RBAC | Server-side `route({ permission })` + `ctx.require` |
| Platform vs school | Separated hosts and contexts |
| Impersonation | Platform-gated, audited |
| Live privilege-escalation matrix | **Not executed** |

---

## 9. Railway / infrastructure

| Check | Status |
|-------|--------|
| Private DB hostname for app | Yes (`*.railway.internal`) |
| Public Postgres TCP proxy | **Active — attention required** |
| Redis private | Internal URL pattern |
| Env secrets in Railway | Present (expected); **do not log values** |
| `DATABASE_RLS` | Not enabled |
| HTTPS / HSTS | Present via Cloudflare/Railway |
| Oct 2026 Railway credential incident | **Rotate** categories below without waiting for exploit proof |

**Credential categories to review/rotate (values omitted):** `AUTH_SECRET`, DB passwords, Redis, S3/Tigris keys, WhatsApp tokens/secrets, `CRON_SECRET`, VAPID keys, AI/Maps/search API keys, FKWeb gateway secret, any CI tokens.

---

## 10. False positives / non-issues

- Marketing host rewrite and public branding assets — intentional.
- Parameterized `$queryRaw` with internal table maps — not user SQLi.
- Blog HTML — sanitized at generation time.
- CORS `*` — not found.

---

## 11. Limitations

- No staging DAST, API ZAP, or authenticated crawler.
- No Semgrep/Gitleaks/Trivy.
- SCA may flag transitive/dev packages beyond runtime attack surface.
- OWASP Top 10:2025 naming used; map closely to 2021 categories where industry tooling still labels 2021.

---

## 12. Recommended next actions (approval required before code changes)

1. Fix certificate XSS (escape + sanitize HTML).  
2. Lock `/api/metrics` (and tighten `/api/health`) to private network / auth.  
3. Add CSP (+ keep HSTS).  
4. Decide: remove/restrict Postgres public TCP proxy; rotate DB password.  
5. Plan Next.js / nodemailer / xlsx upgrades.  
6. Provision staging dual-tenant isolation test.  
7. Rotate secrets per Railway incident guidance.  

**No application source fixes were applied in this audit.**
