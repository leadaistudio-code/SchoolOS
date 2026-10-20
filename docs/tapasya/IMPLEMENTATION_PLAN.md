# Tapasya Mode — repository audit and implementation plan

Tapasya Mode adds deep-work study sessions (Frog of the Day, a configurable
Pomodoro engine, XP, a cross-school leaderboard, guardian-approved exceptions and
honest device-restriction reporting) to the existing MyCampusView product. It is
an extension of the current code base, not a separate app.

## 1. What the repository actually is

| Concern | Finding |
|---|---|
| Web + API | Next.js 15 (App Router), React 19, Tailwind v4. One server answers the marketing apex and every school subdomain. |
| API style | `src/app/api/v1/**/route.ts` wrapped by `route()` / `platformRoute()` in `src/server/api/handler.ts` — session, tenant binding, permission and rate limit in one place; `{ data, meta, error }` envelope; Zod validation. |
| Database | PostgreSQL via Prisma 6. Shared schema with `tenantId` on every school table. |
| Tenancy | `tenantDb(tenantId)` Prisma extension narrows every read and stamps every write. Model classification lives in `src/server/db/tenant-models.ts`; `tests/schema-drift.test.ts` fails the build if a `tenantId` model is not registered. `PLATFORM_ONLY_MODELS` are refused outright from a school context. Optional Postgres RLS in `prisma/rls.sql`. |
| Auth | Opaque session tokens (cookie on web, `Authorization: Bearer` + `X-Tenant-Slug` on mobile). Platform super-admins are users with `tenantId = null`. |
| RBAC | Permission catalogue in `src/lib/rbac/permissions.ts`; built-in roles in `src/lib/rbac/roles.ts` (SCHOOL_ADMIN receives every non-`platform.*` key). `npm run rbac:sync` pushes new keys to the database. Row scope (parent → own children, teacher → own sections) in `src/server/scope.ts`. |
| People | `User`, `Student` (`userId`), `Parent` (`userId`), `StudentGuardian`, `Staff`, `Enrollment` → `Section`/`ClassLevel`. `Homework` exists and can be linked to tasks. |
| Notifications | `notify()` writes in-app rows and queues external channels (WhatsApp, SMS, push) as `Job` rows processed by the worker. Notification bodies are **stored**, so one-time codes must not go through it. |
| WhatsApp | `sendParentMessage()` (Meta Cloud / Gupshup / Twilio providers, template fallback, optional SMS failover); OTP pattern with HMAC-hashed codes, attempt caps and expiry in `src/server/auth/otp.ts`. |
| Audit | `audit()` → `AuditLog` (tenantId nullable for platform actions), sensitive fields scrubbed. |
| Tests | Vitest, 90+ suites, run serially against the seeded dev database. |
| Mobile | `mobile/` — Expo SDK 57, React Native 0.86, expo-router, TanStack Query, Zustand, SecureStore. Native, not a WebView. `android/` is produced by `expo prebuild` and is **not committed**; there is **no iOS project** and no iOS build pipeline. Android release is built manually (`gradlew bundleRelease`) from a copy of the folder without spaces in its path and uploaded to Google Play. |
| Mobile native code | None today beyond Expo packages. Local Expo modules (`mobile/modules/<name>`) are autolinked at prebuild. |

## 2. Reused entities (no duplicate identity)

* `User` / `Session` / roles — identity and permission checks.
* `Student` (via `Student.userId`) — the subject of every Tapasya record.
* `Parent` + `StudentGuardian` — who may consent and approve exceptions.
* `Staff` + `scope.ts` section helpers — which students a teacher may see or assign to.
* `Homework` — optional link from a Tapasya task.
* `AuditLog` — every administrative and authorization change.
* `notify()` and `sendParentMessage()` — in-app notices and WhatsApp delivery.

## 3. New data model (migration `20261019120000_tapasya`)

School-scoped (registered in `TENANT_SCOPED_MODELS`, isolated by `tenantDb`):

| Model | Purpose |
|---|---|
| `TapasyaSchoolPolicy` | One per school: enabled flag, allowed focus/break ranges (inside platform limits), pause/skip rules, unlock limits, global-leaderboard participation switch. |
| `TapasyaPreset` | Student personal presets (copies — never silently changed by an administrator). |
| `TapasyaTask` | Tasks / Frog of the Day, teacher-assigned or personal, optional Homework link and teacher-required focus duration. |
| `TapasyaFocusSession` | One Pomodoro run: frozen settings snapshot, server-authoritative state and timestamps, restriction level actually achieved, idempotency key, one-active-session lock. |
| `TapasyaFocusInterval` | One row per focus cycle; the thing XP is awarded against. Unique per (session, cycle). |
| `TapasyaSessionEvent` | Every transition with server and client time; unique client event id makes duplicate timer events harmless. |
| `TapasyaDevice` | Reported device capabilities and restriction state per installation. |
| `TapasyaUnlockRequest` | Guardian-approved temporary exceptions; hashed one-time code, attempts, expiry, grant window. |
| `TapasyaXpEvent` | The XP ledger. Unique `idempotencyKey` per school; status PENDING / VALIDATED / REJECTED; reversal reference; scoring version; flags. |
| `TapasyaUserAchievement` | Earned achievements, unique per user and key. |

Platform-owned (in `PLATFORM_ONLY_MODELS`; a school context cannot query them at all):

| Model | Purpose |
|---|---|
| `GlobalScoringConfig` | Versioned, published scoring rules with effective dates. Never edited after publishing. |
| `GlobalLeaderboardSeason` | Season windows. |
| `GlobalLeaderboardProfile` | Opt-in public identity: alias, preset avatar, consent state. No name, school, class or contact data. |
| `GlobalLeaderboardEntry` | Precomputed XP per profile per period (all-time, day, ISO week, month, season). Rebuilt idempotently from the ledger. |
| `GlobalLeaderboardSnapshot` | Daily rank snapshots for movement arrows. |
| `GlobalTapasyaSetting` | Platform switches (leaderboard on/off, preview mode, platform Pomodoro limits). |

Global reads go through one constrained service (`src/server/modules/tapasya/leaderboard.ts`) that returns only alias, avatar, XP, rank, movement and badges.

## 4. Policy hierarchy

1. **Platform** limits (`GlobalTapasyaSetting.platform_policy`) — the outer bound, default focus 5–180 min, break 1–60 min.
2. **School** ranges — must sit inside the platform bound; may require pause/skip rules.
3. **Teacher-assigned mandatory task** — fixes the focus duration for sessions on that task.
4. **Student preset** — free within the bounds above.

A preset outside the effective policy is **rejected with an explanation, never silently clamped**. Built-in presets (25/5, 45/10, 45/15) are code constants; when a student saves one it becomes a personal copy, so later default changes cannot alter it.

## 5. Session lifecycle and trust model

States: `READY → FOCUS_ACTIVE ⇄ FOCUS_PAUSED → BREAK_ACTIVE → READY…`, terminal `COMPLETED / CANCELLED / INTERRUPTED / EXPIRED`. `PENDING_SYNC` and `CONTROL_UNAVAILABLE` are client-only states (offline queue, device control failure) shown in the app.

The timer is reconstructed from persisted timestamps (`phaseStartedAt`, `phaseEndsAt`, accumulated pause), never from a running countdown. The server is authoritative for online sessions; offline events carry client timestamps, are checked for plausibility and cross-device overlap, and are recorded as `PENDING` until reconciled. A completed countdown is recorded as exactly that — the restriction level is stored separately and never inferred.

## 6. XP and fairness

* Default rule: the **same base XP for any eligible completed focus interval**, so choosing 45 minutes over 25 does not buy rank. Duration-based XP is an explicit, platform-wide opt-in.
* Bonuses: primary Frog completed, all planned cycles completed, achievements. Daily and weekly caps.
* Restriction level does **not** change XP, so students whose devices cannot be locked are not disadvantaged.
* Idempotency: XP key per interval / frog / session / achievement, unique in the database; awards happen in the same transaction as the completion.
* Scoring changes create a new version, apply prospectively, and are audited (actor, old, new, reason, effective date). Corrections are explicit ledger rows referencing the original.

## 7. Native device control — what is and is not possible

| Platform / deployment | What this implementation does | Status label |
|---|---|---|
| Any device, no native module | Timer only | Focus Timer Active |
| Android, normal Play install | Do Not Disturb (priority) via Notification Policy Access, if the user grants it. Screen pinning is deliberately not used: `startLockTask()` is only called when the app is allow-listed, so it can never fall back to pinning. | Partial Restrictions Active |
| Android, EMM-managed with `lockTaskAllowed` for `com.mycampusview.app` (or device-owner DPC) | `startLockTask()` → managed Lock Task Mode, only MyCampusView reachable | Managed Kiosk Active |
| iOS with Family Controls entitlement, and `EXPO_PUBLIC_TAPASYA_IOS_SHIELDING=1` set after on-device verification | Screen Time authorization + ManagedSettings category shielding | App Shielding Active |
| iOS supervised + MDM | Single App Mode / Autonomous Single App Mode — configured in MDM, reported only | Managed Kiosk Active (reported) |

There is no iOS project, no Family Controls entitlement and no EMM enrollment in this repository today; those paths are coded behind capability checks and documented, and report their real state.

## 8. Implementation order

1. Audit and plan (this document).
2. Schema, migration, tenant registration, permissions.
3. Pure engines (Pomodoro state machine, policy resolution, priority planner, scoring, period keys) + unit tests.
4. Services and API: tasks / frog / planner, presets, sessions, XP, achievements.
5. Global leaderboard: profiles, consent, projection, ranking, seasons, preview mode.
6. Guardian unlock workflow over WhatsApp.
7. Platform administrator APIs and console; school policy settings.
8. Web screens; mobile screens; mobile device-control abstraction and local native module.
9. Tests (unit + database), typecheck, build.
10. Delivery report (`docs/tapasya/DELIVERY_REPORT.md`).
