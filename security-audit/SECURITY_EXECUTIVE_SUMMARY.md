# Security Executive Summary — MyCampusView

**Date:** 18 November 2026  
**Audience:** Leadership / product owners  
**Nature of work:** Independent audit-first review (no fixes applied)

---

## Overall posture

MyCampusView was built with **security-aware multi-tenant architecture**: schools are isolated by host and database scoping, passwords and sessions follow modern practice, and sensitive actions can be audited. That is stronger than many early-stage SaaS ERPs.

However, this review found **concrete gaps** that could expose school data or help attackers recon and persist—especially **certificate XSS**, **public operational metrics**, **missing CSP**, **database exposure via public proxy**, and **RLS not turned on** as a second line of defence. Cross-school isolation was **reviewed in code**, not **proven live** against two schools.

We do **not** assign a letter grade or “certified secure” claim.

---

## Confirmed critical vulnerabilities

**None confirmed** in this pass as unauthenticated remote code execution or trivial auth bypass against production.

*(Dependency scanners report “critical” Next.js advisories; exploitability on your Linux/Railway build needs follow-up—treated as high priority advisory, not proven breach.)*

---

## Confirmed high vulnerabilities

1. **Certificate templates can run attacker-controlled script** in the logged-in app (stored XSS). Affects users who open certificates.  
2. **Anyone on the internet can read production metrics** (memory, DB/Redis health, Node version) via `/api/metrics`.

---

## Sensitive data & cross-school leakage

| Risk | Assessment |
|------|------------|
| Student / parent PII in DB | Expected for ERP; protected by auth + tenant scoping **by design** |
| Cross-school read/write | **Not dynamically verified** this audit; unit tests exist; **enable RLS** recommended |
| Public document links | Time-limited receipt/certificate verify URLs — review expiry & guessing resistance ongoing |
| Exports | Permission-gated; abuse needs insider or stolen session |

---

## Deployment / Railway risks

- Postgres has a **public TCP proxy** (extra exposure if password leaks).  
- App DB connection uses private network (good).  
- Following Railway’s **October 2026 credential incident**, treat secrets as potentially exposed historically and **rotate** (DB, auth, WhatsApp, storage, cron, API keys)—without sharing values in tickets.  
- Production WebApp currently shows **mock payments** driver—confirm that matches business intent.

---

## Issues that should block “we’re secure for scale” claims

Until fixed or formally accepted:

1. Certificate XSS  
2. Public metrics (and ideally tighten health)  
3. Staging **dual-school** isolation test completed  
4. Secret rotation after Railway incident  
5. Decision on public DB proxy  

CSP and dependency upgrades should follow immediately after.

---

## Recommended next actions

1. Approve a **remediation sprint** (see `REMEDIATION_PLAN.md`).  
2. Provide a **staging environment** with two fake schools for isolation + ZAP.  
3. Authorise **credential rotation** list (ops, not engineering guessing).  
4. Do **not** claim Google Ads / Safe Browsing issues are “solved” by this app audit—those are separate (site reputation); keep landing pages clean and consistent.

---

## Documents in this folder

| File | Purpose |
|------|---------|
| `SECURITY_AUDIT_REPORT.md` | Full technical report |
| `VULNERABILITY_REGISTER.md` | Tracking table |
| `REMEDIATION_PLAN.md` | Prioritised fix roadmap (unapplied) |
| `SECURITY_TEST_COVERAGE.md` | What was / wasn’t tested |
| `SECURITY_EXECUTIVE_SUMMARY.md` | This brief |
