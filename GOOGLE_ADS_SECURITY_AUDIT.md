# Google Ads Security Audit — MyCampusView `/book-demo`

**Date:** 18 November 2026  
**Scope:** Read-only investigation of https://www.mycampusview.com/book-demo and related marketing surfaces, against Google Ads policy flags: *Circumventing Systems: Cloaking*, *Compromised Site*, and *Malicious Software*.  
**Environment:** Production (Railway “School OS” → MyCampusView Website), Cloudflare in front of custom domains.  
**Method:** Static source review, passive HTTP probes with Chrome / AdsBot-Google / Googlebot user-agents, browser-visible resource inspection, Railway configuration review (secret **values redacted**), dependency audit.  
**Constraints honored:** No source changes, no deploys, no production data writes, no credential values printed in this report.

---

## 1. Executive summary

This investigation **did not find evidence of intentional cloaking, malware injection, or a compromised `/book-demo` landing page** in the current MyCampusView marketing deployment.

| Policy flag | Verdict on current evidence |
|-------------|-----------------------------|
| **Cloaking** | **Not supported.** No user-agent / IP / geo / `gclid` branching in application middleware. AdsBot and ordinary browsers receive the same destination, title, H1, form, and canonical URL. HTML bytes differ slightly; stripped visible text length is identical. |
| **Compromised Site** | **Not supported by page content.** No unexpected iframes, meta-refresh, or client redirects. Third-party scripts observed are Google Analytics (`G-4V3MCWL024`) and Cloudflare Insights — expected for this stack. |
| **Malicious Software** | **Not supported.** No drive-by downloads, miners, obfuscated `eval` payloads, or suspicious executable links on `/book-demo`. Service worker is a same-origin offline shell. |

**Most likely explanation for the Google Ads flags (hypothesis, not proven):** policy automation reacting to (a) historical final-URL / domain mismatch (apex vs `www` vs Railway `*.up.railway.app`), (b) Cloudflare edge behaviour toward some crawlers, (c) dual Website/WebApp hosts, or (d) a prior compromised state that is no longer present — **NOT VERIFIED** without Google’s exact sample URLs/timestamps and full Cloudflare Bot Fight / WAF logs.

**Blocking safe Ads re-appeal until checked:** confirm Ads **final URL is exactly** `https://www.mycampusview.com/book-demo` (with `www`), confirm Cloudflare is not serving a challenge interstitial to AdsBot from Google IPs, and confirm no ad still points at Railway default hostnames.

---

## 2. Architecture relevant to Ads

| Piece | Finding |
|-------|---------|
| Marketing service | Railway service **MyCampusView Website** (`APP_ROLE=marketing`, `APP_URL=https://www.mycampusview.com`, `APP_ROOT_DOMAIN=mycampusview.com`) |
| App service | **MyCampusView WebApp** on `app.mycampusview.com` + `*.mycampusview.com` |
| Host routing | `src/middleware.ts` — host-based rewrite of marketing paths to `/site/*`; **no UA/IP checks** |
| Canonical marketing redirect | Marketing role redirects non-canonical hosts to `APP_URL` (comments explicitly cite Google Ads “compromised site” risk of duplicate domains) |
| Landing page | `src/app/(site)/site/book-demo/page.tsx` |
| Demo API | `POST /api/v1/site/demo` — rate limit + honeypot; no redirect |
| Analytics | Root layout loads gtag.js for `G-4V3MCWL024` |
| CDN | Cloudflare on `mycampusview.com` / `www` (robots.txt includes Cloudflare Managed Content) |

---

## 3. Verified findings

### V-01 — No application-level cloaking logic (supports “not cloaking”)

**Severity:** Info (exculpatory)  
**Evidence:**
- `src/middleware.ts` lines 121–183 decide routing from `APP_ROLE` and host only (`x-forwarded-host` / `host`). No `user-agent`, AdsBot, Googlebot, IP, cookie, `gclid`, `utm_`, or geolocation conditionals.
- Grep across `src/` found no AdsBot/Googlebot branching for marketing pages.

**Observed URLs:** N/A (code).

---

### V-02 — AdsBot and Chrome receive the same landing destination and substance

**Severity:** Info (exculpatory)  
**Evidence (passive HTTP, 18 Nov 2026):**

| Request | Status | Destination / result |
|---------|--------|----------------------|
| `https://www.mycampusview.com/book-demo` Chrome | 200 | Same host/path |
| Same URL AdsBot-Google | 200 | Same host/path |
| Same URL Googlebot | 200 | Same host/path |
| `https://mycampusview.com/book-demo` all three UAs | 301 | `https://www.mycampusview.com/book-demo` |
| `http://www…/book-demo` | 301 | HTTPS www |
| `http://mycampusview.com/book-demo` | 301 → 301 | HTTPS apex then www |
| `?gclid=TEST…` / `?utm_source=google` | 200 | No redirect; page still demo |
| `https://app.mycampusview.com/book-demo` | 404 | App does not serve marketing demo |
| `https://website-production-026e.up.railway.app/book-demo` Chrome & AdsBot | 301 | `https://www.mycampusview.com/book-demo` |

**Content markers (www `/book-demo`):**

| Marker | Chrome | AdsBot |
|--------|--------|--------|
| `<title>` | Book a demo of MyCampusView · MyCampusView | Same |
| H1 | See it running your school’s workflows. | Same |
| Canonical | `https://www.mycampusview.com/book-demo` | Same |
| gtag `G-4V3MCWL024` | Present | Present |
| Meta refresh | Absent | Absent |
| `location.href` / `location.replace` in HTML | Absent | Absent |
| `<iframe>` count | 0 | 0 |
| Stripped visible text length | 2639 | 2639 |

Raw HTML length differed (56600 vs 55038) and SHA-256 differed; first stripped-text difference is title ordering near the document start, not a different offer or destination. **This is consistent with Next.js / edge serialization differences, not classic cloaking.**

**Browser UI check:** Interactive snapshot of www `/book-demo` shows legitimate demo form fields and company footer — no overlay redirect or unexpected download.

---

### V-03 — Third-party scripts on `/book-demo` are explainable

**Severity:** Low (hygiene / disclosure)  
**Observed network destinations (browser Performance API):**
- `https://www.googletagmanager.com/gtag/js?id=G-4V3MCWL024`
- `https://www.google-analytics.com/g/collect?...` (GA4 `page_view`)
- `https://static.cloudflareinsights.com/beacon.min.js/...`
- `https://www.mycampusview.com/cdn-cgi/speculation` and `/cdn-cgi/rum` (Cloudflare)
- First-party `/_next/*` and images (filtered from list)

**Source:**
- GA: `src/app/layout.tsx` lines 66–74  
- Company footer link `https://leadaistudio.com`: `src/content/site/company.ts` lines 292–295 (`PARENT_COMPANY`) — intentional legal entity link, not a redirect chain.

**No evidence** of unknown ad networks, crypto miners, or malware CDNs on this page.

---

### V-04 — Service worker is offline shell only (not malware)

**Severity:** Info  
**File:** `public/sw.js`  
Caches same-origin `/`, `/offline`, `/manifest.webmanifest`, and static assets; ignores cross-origin and `/api/`. Push handler shows notifications only. **No remote code fetch from untrusted hosts.**

---

### V-05 — Demo form does not redirect users off-site

**Severity:** Info  
**Files:** `src/components/site/demo-form.tsx` (fetch to `/api/v1/site/demo`); `src/app/api/v1/site/demo/route.ts`  
Returns JSON `{ received: true }`; honeypot field `website`; rate limit 5/hour/IP. Success fires custom event `mycampusview:demo-requested` — **no `gtag('event')` listener found in repo** (tracking gap, not cloaking).

---

### V-06 — Canonical host strategy exists specifically to reduce Ads “compromised / duplicate site” risk

**Severity:** Info  
**File:** `src/middleware.ts` lines 78–108, 134–138  
Marketing deployments 301 non-canonical hosts to `APP_URL`. Live check confirms Railway default hostname redirects to www for `/book-demo`.

---

### V-07 — Production Website still on Next 15.5.23; CSP not live yet

**Severity:** Medium (security hygiene; weak “compromised” signal for scanners)  
**Evidence:**
- Railway Website logs show `▲ Next.js 15.5.23` on last successful deploy (commit `c94e568…`, 18 Nov 2026 ~11:31 UTC).
- Live response headers on www `/book-demo`: **HSTS present; Content-Security-Policy absent** (`csp=false` in probes). Local uncommitted/undepoyed remediations are out of scope for “what Google currently sees.”
- Public `/api/metrics` lockdown and related fixes from the separate OWASP remediation are **NOT VERIFIED as deployed** to the Website service.

---

### V-08 — Dependency / supply-chain posture (no install-script compromise found)

**Severity:** Medium (general SCA; not proof of live malware)  
**Evidence:**
- `package.json` has **no** `preinstall` / `postinstall` / `prepare` malware hooks.
- Lockfile present; `npm audit --omit=dev` still reports residual advisories (e.g. transitive `uuid` via exceljs, zod DoS class) — **high/moderate library CVEs, not evidence of a trojanized landing page**.
- Critical Next.js RCE advisories addressed in local tree via Next `15.5.28` / xlsx removal — **production Website still reports 15.5.23 until redeployed** (V-07).

---

## 4. Suspected issues requiring investigation

| ID | Issue | Severity | Why it matters for Ads | Status |
|----|-------|----------|------------------------|--------|
| S-01 | Cloudflare Bot Fight / Managed Challenge may treat some Google crawlers differently | Medium | Can be misread as cloaking if AdsBot gets an interstitial while users get HTML | **NOT VERIFIED** (no access to CF security analytics for Google ASN samples) |
| S-02 | Historical ads using apex, non-www, or `*.up.railway.app` final URLs | High (if true) | Triggers “destination mismatch / circumventing systems” | **NOT VERIFIED** without Ads account final-URL history |
| S-03 | Byte-level HTML difference AdsBot vs Chrome | Low | Automated classifiers sometimes flag unequal response bodies | Observed; **not** a different destination or offer |
| S-04 | Dual product hosts (`www` marketing vs `app` ERP) | Low–Medium | Wrong host in ad → 404/login looks like bait-and-switch | `app…/book-demo` = 404 verified; ensure ads never use app host |
| S-05 | GA loaded from root layout on all hosts using this codebase | Low | Analytics on app portals is fine; if a misconfigured ad hit app host, experience differs | Code: `src/app/layout.tsx` |
| S-06 | Demo conversion event not wired to `gtag('event')` | Low | Conversion tracking inconsistency — policy-neutral | Code review |
| S-07 | Railway env contains many high-value secrets on Website service | Medium (ops) | Compromised credentials ≠ compromised HTML, but Google “compromised site” sometimes follows account/infra incidents | Names only reviewed; **values not logged in this report** |
| S-08 | Full Google Ads sample URL / crawl timestamp from rejection letter | — | Required to prove or disprove historical compromise | **NOT VERIFIED** — not provided |

---

## 5. Policy-flag evidence matrix

### 5.1 Cloaking

| Supports cloaking | Contradicts cloaking |
|-------------------|----------------------|
| Unequal raw HTML hashes AdsBot vs Chrome (S-03) | No UA/IP branching in middleware (V-01) |
| Cloudflare in path (S-01 unknown) | Same status, Location chains, title, H1, canonical (V-02) |
| | Same stripped text length; form present in browser (V-02) |
| | `gclid` / UTM queries do not change destination (V-02) |

**Conclusion:** **Insufficient evidence to confirm cloaking.** Byte differences alone do not establish a policy violation.

### 5.2 Compromised Site

| Supports compromised | Contradicts compromised |
|----------------------|-------------------------|
| Prior Ads rejection (external claim) | No injected iframes / meta-refresh / JS redirects (V-02, V-03) |
| CSP not yet enforced in production (V-07) | Only GA + Cloudflare Insights as third-party scripts (V-03) |
| Residual npm advisories / older Next on prod (V-07/V-08) | Legitimate company entity link to leadaistudio.com (V-03) |
| | Railway default host canonicalizes to www (V-06) |

**Conclusion:** **Current page content does not look compromised.** Historical compromise **NOT VERIFIED**.

### 5.3 Malicious Software

| Supports malware | Contradicts malware |
|------------------|---------------------|
| None observed on `/book-demo` | No unexpected downloads, miners, or remote SW control (V-03, V-04) |
| | Demo API is JSON lead capture only (V-05) |

**Conclusion:** **No evidence of malicious software on the audited landing page.**

---

## 6. Redirect / rewrite inventory (marketing)

| Mechanism | File / system | Behaviour |
|-----------|---------------|-----------|
| Marketing rewrite `/` → `/site` | `src/middleware.ts` ~180–182 | Internal rewrite |
| `/site/*` → public path | `src/middleware.ts` ~174–177 |  redirect to strip `/site` |
| Non-canonical host → `APP_URL` | `src/middleware.ts` `canonicalRedirect` | 301 when `APP_ROLE=marketing` |
| Apex → www | Live Cloudflare/Railway | 301 to `https://www.mycampusview.com/...` |
| HTTP → HTTPS | Cloudflare / edge | 301 |
| App-only paths on marketing | `src/middleware.ts` ~140–150 | Redirect to `/` |
| `next.config.ts` | Headers only; **no** redirects/rewrites array |

---

## 7. Security headers (live www `/book-demo`)

| Header | Observed |
|--------|----------|
| Strict-Transport-Security | Present (`max-age=63072000; includeSubDomains; preload`) |
| X-Content-Type-Options | nosniff |
| X-Frame-Options | SAMEORIGIN |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera/microphone/geolocation `(self)` |
| Content-Security-Policy | **Absent in production** (local config has CSP; not deployed) |
| Server | cloudflare (custom domain) / railway-hikari (Railway hostname) |

---

## 8. Railway configuration review (names only)

**Website service env keys observed (values redacted):**  
`APP_NAME`, `APP_ROLE` (= marketing), `APP_ROOT_DOMAIN`, `APP_SIGN_IN_URL`, `APP_URL`, `AUTH_SECRET`, `DATABASE_URL`, `EMAIL_DRIVER`, `EMAIL_FROM`, `MAPS_DRIVER`, `NODE_ENV`, `PAYMENT_DRIVER`, `REDIS_URL`, `RESEND_API_KEY`, `S3_*`, `SMS_DRIVER`, `SMTP_URL`, `STORAGE_DRIVER`, plus Railway-injected `RAILWAY_*`.

**Notes without values:**
- `APP_ROLE=marketing` and `APP_URL=https://www.mycampusview.com` align with Ads-safe host strategy.
- `PAYMENT_DRIVER=mock` on Website is odd for a marketing-only service but **not** an Ads cloaking signal.
- Website domains: `www.mycampusview.com`, `mycampusview.com`, `website-production-026e.up.railway.app`.
- Latest Website deploy reviewed: SUCCESS `c94e568…` (platform commercial invoices era) — **not** the later local security-remediation commit unless subsequently redeployed (**NOT VERIFIED** beyond log sample).

**Access / security logs:** Railway filtered log pull for `book-demo` returned deploy/startup lines only in the sample window — **insufficient request-level AdsBot history. NOT VERIFIED.**

**Important operational note:** Invoking Railway `list_variables` in this audit session returned plaintext secrets into the agent tool transcript. **Those values are intentionally omitted here.** If this transcript is retained anywhere untrusted, treat affected secret classes as candidates for rotation (AUTH, DB, Redis, S3, email API, SMTP).

---

## 9. Recommended remediations (for Ads recovery — do not apply in this audit)

1. **Ads account hygiene**
   - Final URL (and all sitelinks) must be `https://www.mycampusview.com/book-demo` only.
   - Remove any creative still pointing at apex-only, `http://`, `app.`, or `*.up.railway.app`.
   - Keep Display URL consistent with www.

2. **Cloudflare**
   - Allowlist Google Ads / AdsBot crawlers; disable Managed Challenge for Ads verification paths if enabled.
   - Export Bot Analytics around the rejection dates (**NOT VERIFIED** here).

3. **Deploy security hardening already prepared locally** (CSP, Next patch, metrics lock) so scanners see a hardened surface — after a normal release process.

4. **Analytics**
   - Wire `mycampusview:demo-requested` → `gtag('event', ...)` for honest conversion measurement (optional; not a cloaking fix).

5. **Appeal package**
   - Attach this report’s V-01/V-02 tables.
   - State that middleware is host-based only.
   - Provide screenshots of `/book-demo` and Ads final URL settings.
   - Do **not** claim “certified clean” or invent a security score.

---

## 10. Checklist before requesting a Google Ads review

- [ ] Ads **final URL** is exactly `https://www.mycampusview.com/book-demo`
- [ ] No ads/sitelinks use `mycampusview.com` without www, `http://`, `app.mycampusview.com`, or Railway default hosts
- [ ] Manually open the final URL in an Incognito window from a normal network — lands on demo form
- [ ] Use Google’s Ads preview / “See what Google crawls” tools if available; confirm no interstitial
- [ ] Cloudflare: Bot Fight Mode / WAF does not challenge AdsBot (document with CF logs)
- [ ] `curl` as AdsBot returns 200 HTML with the same H1 (re-run commands in §3 V-02)
- [ ] Search Console / Ads rejection letter: note exact flagged URL and date (**attach to appeal**)
- [ ] Confirm Website production deploy includes intended marketing build (commit hash)
- [ ] Confirm no third-party tag manager container was added outside the repo (GTM UI) — **NOT VERIFIED** beyond page HTML (only gtag.js observed)
- [ ] Rotate secrets if Railway variable dumps may have been retained outside trusted ops
- [ ] After fixes, wait for Google crawl refresh; then appeal with evidence, not assertions

---

## 11. What could not be verified

| Item | Reason |
|------|--------|
| Google’s exact crawl samples / timestamps that triggered the flag | Not provided |
| Cloudflare Bot Fight decisions for Google ASN IPs | No CF dashboard export in this session |
| Full historical Ads final URLs / previous landing experiments | Ads UI not accessed |
| Authenticated Google Tag Manager container contents (if any account-level GTM exists beyond inline gtag) | Only page-loaded gtag observed |
| Whether a past deploy injected malware that was later removed | Git history of marketing pages reviewed only for current logic; no malware found now |
| Production request logs proving AdsBot parity over weeks | Railway sample lacked request-level `book-demo` hits |
| Mobile app / Play-store surfaces | Out of HTTP landing scope |
| Whether security-remediation branch is live on Website | Prod still showed Next 15.5.23 / no CSP |

---

## 12. Commands used (reproducible, non-destructive)

```text
# Status + Location without following redirects (PowerShell / curl)
curl.exe -sI -A "AdsBot-Google (+http://www.google.com/adsbot.html)" https://www.mycampusview.com/book-demo
curl.exe -sI -A "Mozilla/5.0 ..." https://www.mycampusview.com/book-demo
curl.exe -sI -A "AdsBot-Google (+http://www.google.com/adsbot.html)" https://website-production-026e.up.railway.app/book-demo

# Body markers
Invoke-WebRequest https://www.mycampusview.com/book-demo -UserAgent "AdsBot-Google (+http://www.google.com/adsbot.html)"
```

Compare: HTTP status, `Location`, `<title>`, H1, canonical, presence of `G-4V3MCWL024`, absence of meta-refresh / `location.replace`.

---

## 13. Bottom line for the appeal

**What you can truthfully say today:**  
MyCampusView’s marketing middleware does not vary content by crawler user-agent; `/book-demo` serves the same demo offer to AdsBot and users; third-party scripts are Google Analytics and Cloudflare; the Railway default hostname permanently redirects to `www.mycampusview.com`.

**What you must not claim without more evidence:**  
That Google’s original detection was a false positive, that Cloudflare never challenged AdsBot historically, or that the site has never been compromised in the past.

**Recommended next human actions:** pull the rejection’s sample URL + date, audit Cloudflare bot logs for that window, lock every ad final URL to www `/book-demo`, then re-appeal with this report attached.
