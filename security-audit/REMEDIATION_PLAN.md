# Remediation Plan — MyCampusView

**Rule:** No code or production changes until you approve a remediation phase.  
This document prepares fixes only.

---

## Immediate (emergency / same week)

| # | Fix | Complexity | Regression tests | Depends on |
|---|-----|------------|------------------|------------|
| 1 | **H-01 Certificate XSS** — sanitize `bodyHtml` with `sanitize-html` (allowlist tags); HTML-escape all `{{var}}` substitutions in `renderCertificateBody` | S | Unit tests for malicious template + student name with `<script>`; certificate preview page | — |
| 2 | **H-02 / M-01 Metrics & health** — gate `/api/metrics` behind shared secret or private network; shrink `/api/health` public body | S | Health check still 200 for Railway; metrics 401/404 publicly | Edge/Railway network rules |
| 3 | **I-02 Secret rotation** — rotate AUTH_SECRET (forces re-login), DB, Redis, S3, WhatsApp, CRON_SECRET, API keys per Railway incident guidance | M | Login, uploads, WhatsApp, cron ticks | Maintenance window; dual-write careful for AUTH_SECRET |
| 4 | **M-03 Postgres TCP proxy** — disable if unused or IP-restrict; rotate DB password | S | App still connects via private URL | Railway dashboard |

## High priority (1–2 sprints)

| # | Fix | Complexity | Regression |
|---|-----|------------|------------|
| 5 | **M-02 CSP** — report-only then enforce; align with Next assets + GA if used | M | Marketing + app pages, certificates print |
| 6 | **M-06 Next.js upgrade** — patch within 15.x for image/cache advisories; verify `images` config | M | Smoke marketing + app; image CDN |
| 7 | **M-05 / L-05 WhatsApp** — Meta HMAC only where possible; rotate inbound secrets | S | Inbound “Hi” assistant; receipts status |
| 8 | **M-07 Cron identity** — dedicated permission set for discovery job; `timingSafeEqual` | S | Cron dry-run in staging |
| 9 | **Staging dual-tenant isolation suite** — automate School A/B IDOR matrix | M | CI job | Staging env |

## Medium priority

| # | Fix | Complexity |
|---|-----|------------|
| 10 | **M-04 Enable RLS** after staging bake | L — migrations, role, `tenantTx` coverage |
| 11 | Replace or isolate **xlsx** usage | M |
| 12 | Bump **nodemailer** when EMAIL_DRIVER live | S |
| 13 | **L-01** shorten session TTL; step-up auth for exports/refunds | S |
| 14 | **L-03** harden domain probe allowlists | S |
| 15 | Confirm **PAYMENT_DRIVER** intentional; document | S |

## Long-term

- Security alerting on failed logins / export spikes (A09)
- Periodic SCA in CI (npm audit / OSV) with fail gates
- Semgrep ASVS ruleset in CI
- Formal ASVS L2 gap assessment
- Bug bounty or annual pentest with written ROE

## Suggested implementation order

```
H-01 → H-02/M-01 → secret rotation → M-03
  → CSP report-only → Next patch → WhatsApp/cron harden
  → staging isolation CI → RLS enablement → dependency hygiene
```

## Deployment sequence (when approved)

1. Staging branch + migrate + tests  
2. Staging dual-tenant red team script  
3. Production migrate (if any)  
4. Config-only changes (metrics ACL, proxy, env)  
5. Code deploy  
6. Verify health, login, one fee/cert flow  
7. Monitor logs 24h  

## Explicit non-actions until approval

- No commits of security fixes  
- No production env mutation  
- No credential rotation without your go-ahead  
