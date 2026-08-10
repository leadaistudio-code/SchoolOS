# Development Roadmap

Every phase below already has its **database schema, indexes, entitlement flag
and navigation entry** in place. What each phase adds is the service layer, the
API routes and the screens.

A module's navigation entry appears only when the tenant's plan enables it *and*
the role holds the permission — so a school never sees a control that does
nothing.

---

## Definition of done

A feature is complete only when all of these exist:

- [ ] Database tables and migration
- [ ] Service function with permission enforcement and a transaction where needed
- [ ] API route under `/api/v1`
- [ ] UI with loading, empty and error states
- [ ] Zod validation shared between the API and the form
- [ ] Audit entry for sensitive operations
- [ ] Tests for the critical behaviour
- [ ] Works end to end against seeded data

---

## Phase 1 — Foundation ✅ complete

Next.js + TypeScript + Postgres, the design system, tenant architecture,
authentication, RBAC, row-level scoping, entitlements, the audit log, the
provider abstractions, role-specific dashboards, the students module end to end,
the platform console, the seed and the test suite.

Verified end to end: two tenants resolve by subdomain with their own branding; a
School A cookie is rejected on School B; a parent sees 2 of 120 students; a
teacher is refused `students.create` at the API; creating a student writes an
enrollment, a guardian and an audit entry in one transaction.

## Phase 2 — People and attendance ✅ complete

Parents and staff modules; classes, sections and subjects; the daily student
register with bulk marking and automatic absence notification; geofenced staff
check-in with audited admin override; and the full leave workflow.

Verified end to end: saving a register wrote 9 rows, changed 4 and notified 2
parents in one transaction; a check-in from 1,125km away was refused while one
from 7m away was accepted and recorded as late; a device reporting a mock
location was refused and audited; approving a 2-day leave wrote LEAVE into the
register for both days; deciding the same request twice returned 409; a teacher
was refused `leave.approve` with 403; and a parent saw 2 of 26 leave requests.

Also fixed here: a genuine timezone defect. Calendar dates were normalised
through *local* midnight, which in a positive-offset zone (IST) is 18:30 UTC on
the previous day — so registers saved a day early and a date already read from
the database shifted again on every re-normalisation, silently dropping the last
day of a multi-day leave. `src/lib/dates.ts` now normalises calendar dates in
UTC throughout, with six regression tests covering it.

## Phase 3 — Academics ✅ complete

Homework (set → publish → hand in → review), classwork, the timetable builder
with conflict detection, the school calendar, the notice board with audience
targeting, and permission-checked file upload/download.

Verified end to end: an admin saw 160 homework items while a parent saw the 32
for their own children's classes, each carrying that child's own submission
state; a parent handed work in and a teacher marked it 18/20, notifying both
guardians; handing in twice returned 409; a score above the maximum returned
400; a parent submitting for another family's child returned 403.

Notice targeting was checked from three sides: a parent saw the school-wide
notice and the one for their child's class, but not the one aimed at another
class nor the teachers-only one — and requesting the other class's notice by id
returned 404 rather than confirming it exists. A teacher saw the school-wide and
teachers-only notices and neither class notice.

Timetable conflicts were checked on a cleared day: placing a teacher with one
class succeeded, placing the same teacher with a different class in the same
period was refused with "That teacher is already taking Hindi with Class 1 A in
this period", a different period succeeded, and clearing a slot succeeded.

Also fixed here: upload validation only rejected files whose magic bytes matched
a *different* known type, so an executable renamed to `.pdf` sniffed as
"unknown" and was accepted. The check is now positive — a declared type with a
known signature must carry it — with six regression tests.

## Phase 4 — Finance ✅ complete

Fee heads and structures, bulk invoice generation with concessions applied per
line, counter collection with idempotency, the online gateway flow with
signature-verified webhooks, sequential receipts, refunds that restore invoice
balances, late-fee rules, and the outstanding/overdue dashboards.

Money is integer paise throughout; `src/lib/money.ts` is the only place
arithmetic happens and carries 42 dedicated tests.

Verified end to end against a live ledger:

| Scenario | Result |
| --- | --- |
| Partial payment | Allocated oldest-invoice-first, receipt issued |
| Same idempotency key replayed | Original receipt returned, charged once |
| Overpayment of ₹999,999 | Balance settled, remainder held as advance, not lost |
| Online payment started | `INITIATED`, no allocations, no receipt — money had not moved |
| Webhook, no signature | Rejected |
| Webhook, wrong signature | Rejected |
| Webhook, signed but amount tampered | Rejected: "Amount did not match the order" |
| Webhook, signed and correct | Settled, receipt `RCP-2627-00003` |
| Exact webhook replay | "Duplicate event", ignored |
| New event id, same payment | "Already settled", ignored |
| Partial refund | Invoice balance restored 11,800 → 12,000 |
| Refund above the remainder | Refused: "Only ₹300 can still be refunded" |
| Refund without `fees.refund` | 403 |
| Bulk generation, dry run then commit | 18 invoices, 50% concession applied to the one eligible student |
| Re-running the same generation | 0 created, 18 skipped — no double billing |
| 10 concurrent collections | 13 receipts, all unique, zero gaps |

Ledger identity held after every operation: `total = paid + balance`,
`sum(allocations) = sum(invoice.paid)`, no negative balances, and no invoice
paid beyond its total.

Also fixed here: an env var set to the empty string parsed as `''` rather than
"unset", so `PAYMENT_WEBHOOK_SECRET=` silently became the HMAC signing key and
every signature verified against an empty secret. Empty values are now treated
as absent, and the payment provider refuses a blank signing key outright.

## Phase 5 — Examination

Exam creation and scheduling; subject and class mapping; marks entry with
validation against maximum marks; configurable grading scales; result
computation with ranking; report card templates and PDF generation; the
certificate builder with dynamic variables and QR verification.

## Phase 6 — Operations

Library catalogue, circulation and fines; inventory and asset lifecycle; front
office visitors and appointments; the admissions CRM as a Kanban pipeline with
follow-up reminders and conversion analytics; events; sports.

## Phase 7 — Transport ✅ built

Buses with driver, attendant and document-expiry tracking; routes with an
ordered, geocoded stop list; student-to-stop assignments enforced against bus
capacity; the driver console (start/end trip, GPS ping ingestion, boarding
roster); the live map with route progress and arrival estimates; parent
tracking scoped to their own children's bus, with driver contact details and
approach notifications.

The map is drawn from our own coordinates rather than a tile provider, so no
pupil stop location leaves the deployment and the screen works on a filtered
school network.

Still open: transport fares are held on the stop and billed through the
standard fee structure rather than being invoiced automatically from the
assignment.

## Phase 8 — SaaS operations

Tenant provisioning and suspension from the console; plan and entitlement
editing; usage metering against limits; billing and subscription invoices;
audited impersonation; support ticketing; the system health view.

## Phase 9 — White label and mobile

The branding editor; custom domain verification and certificate issuance; the
school website CMS; email, SMS and PDF template editing; full PWA with offline
shell and push notifications.

## Phase 10 — Hardening

Postgres RLS enabled with connection-level tenant context; MFA enrolment and
challenge; Redis-backed rate limiting and caching; load testing; monitoring and
alerting; automated backup and restore drills; CI/CD.
