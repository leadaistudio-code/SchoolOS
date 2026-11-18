# Security Test Coverage Inventory

Audit date: 18 November 2026

Legend: **Done** · **Manual** · **Partial** · **Not tested** · **Blocked** · **N/A**

---

## 1. Environments & tooling

| Item | Status | Notes |
|------|--------|-------|
| Repository SAST (human + agents) | Done | Architecture + smell hunt |
| `npm audit` SCA | Done | 36 findings aggregated |
| Passive prod headers | Done | www + app login |
| Passive `/api/health`, `/api/metrics` | Done | Confirmed public |
| Gitleaks | Blocked | Not installed |
| Semgrep | Blocked | Not installed |
| Trivy / OSV-Scanner | Blocked | Not installed |
| OWASP ZAP Baseline/Full | Blocked | No staging + prod ban |
| Authenticated API crawl | Blocked | No staging credentials |
| Dual-tenant isolation live | Blocked | Needs staging School A/B |
| Payment sandbox abuse tests | Not tested | `PAYMENT_DRIVER=mock` |
| Railway TCP / env key review | Done | Values not published |

---

## 2. Cross-cutting controls

| Control | Status |
|---------|--------|
| Session cookie flags | Manual (code) |
| Password hashing | Manual (code) |
| Login lockout / rate limit | Manual (code + docs) |
| Password reset / invite tokens | Manual (code) |
| MFA | Manual (existence) |
| `tenantDb()` enforcement | Manual + existing unit tests in repo |
| Postgres RLS live | Not tested (disabled) |
| RBAC `route(permission)` | Partial (pattern review, not full matrix) |
| Audit logging presence | Manual |
| File upload MIME/magic | Manual |
| S3 proxy ACL | Manual |
| Razorpay / payment webhook HMAC | Manual |
| Cron `CRON_SECRET` | Manual |

---

## 3. Roles (authorization matrix)

| Role | Inventory | AuthZ tested live |
|------|-----------|-------------------|
| SUPER_ADMIN (platform) | Done | Not tested |
| MYCAMPUS_SUPPORT | Done | Not tested |
| SCHOOL_ADMIN | Done | Not tested |
| PRINCIPAL | Done | Not tested |
| TEACHER | Done | Not tested |
| PARENT | Done | Not tested |
| STUDENT | Done | Not tested |

Full BFLA matrix across 228 permission keys: **Blocked** (needs staging).

---

## 4. Major modules / API prefixes

| Area | Routes / module | Status |
|------|-----------------|--------|
| Auth | `/api/v1/auth/*` | Manual |
| Students | `/api/v1/students/*` | Partial |
| Parents | `/api/v1/parents/*` | Partial |
| Staff | `/api/v1/staff/*` | Partial |
| Attendance | `/api/v1/attendance/*` | Partial |
| Fees / finance | `/api/v1/finance/*` | Partial |
| Exams / certificates | `/api/v1/exams/*`, certificates UI | Manual (XSS confirmed) |
| Messages / notices | `/api/v1/messages/*`, notices | Partial |
| Files | `/api/v1/files/*` | Manual |
| Platform | `/api/v1/platform/*` | Partial |
| WhatsApp | `/api/v1/whatsapp/*` | Manual |
| Webhooks | `/api/v1/webhooks/*` | Manual |
| Cron jobs | `/api/cron/*` | Manual |
| Marketing site | `/api/v1/site/*`, `(site)` | Partial + passive |
| CCTV / biometric / device | device-gateway, cctv, biometric | Partial |
| LMS / Tapasya / Labs | respective modules | Partial |
| Accounting / Tally | accounting, tally | Partial |
| Store / inventory | store | Partial |
| Transport | transport + ingest | Partial |
| Public verify / receipts | `/verify/*`, `/r/[token]` | Manual |

“Partial” = design/pattern review only, not endpoint-by-endpoint authenticated testing.

---

## 5. OWASP API Top 10:2023

| Risk | Status |
|------|--------|
| API1 BOLA | Partial / Blocked for live |
| API2 Broken Auth | Manual |
| API3 BOPLA | Partial |
| API4 Resource consumption | Partial (rate limits reviewed) |
| API5 BFLA | Blocked live |
| API6 Business flows | Partial |
| API7 SSRF | Manual (domain probe noted) |
| API8 Misconfig | Done (headers, metrics) |
| API9 Inventory | Done (route inventory) |
| API10 Unsafe API consumption | Partial (growth discovery) |

---

## 6. Coverage gaps (why)

1. **No staging environment / credentials** → no safe authenticated DAST.  
2. **Production ROE** → no intrusive or state-changing probes.  
3. **Scanner binaries missing** → Semgrep/Gitleaks/ZAP/Trivy not run.  
4. **294 API route files** → exhaustive BOLA proof exceeds static-only session; prioritized high-risk surfaces.

---

## 7. Recommended coverage to close gaps

Provide:

- Staging base URL  
- Two synthetic school tenants (Admin A / Admin B)  
- Teacher, parent, student accounts on A  
- Platform owner test account  
- Explicit approval for ZAP baseline on staging only  

Then re-run Phases 4–5 and update this file.
