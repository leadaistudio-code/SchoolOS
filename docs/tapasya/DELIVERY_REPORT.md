# Tapasya Mode — delivery report

Tapasya Mode is built into MyCampusView as an extension: same database, same
API conventions, same roles, same web shell and the same Expo app. Nothing
existing was removed or renamed. The design and audit are in
`IMPLEMENTATION_PLAN.md`; this document says what was delivered, how it was
checked, and what still needs provisioning before each claim holds in the field.

## 1. Status at a glance

| Area | Status |
|---|---|
| Database schema, tenant isolation, permissions | Done, tested against Postgres |
| Pomodoro engine, policy hierarchy, presets | Done, unit-tested; server-authoritative |
| Tasks, Frog of the Day, priority planner | Done, tested |
| XP ledger, scoring versions, achievements | Done, tested |
| Global leaderboard, consent, preview mode | Done, tested |
| Guardian unlock (WhatsApp code or in-app) | Done, tested; real delivery needs a WhatsApp provider |
| School settings, teacher progress, platform console | Done; school pages smoke-tested in a browser |
| Mobile screens (student and guardian) | Done; typechecked, not run on a device |
| Android device control (DND, managed Lock Task) | Coded and compiled; not run on a device; kiosk needs EMM |
| iOS device control (Screen Time shield, Single App Mode) | Coded; **not compiled** (no Mac, no iOS project); shield off by default |

## 2. What works, by screen

Web (school subdomain, `/tapasya/...`) and mobile (`Tapasya Mode` in More):

| # | Screen | Web | Mobile |
|---|---|---|---|
| 1 | Dashboard | `/tapasya` | `tapasya` |
| 2 | Schedule builder | `/tapasya/plan` | `tapasya-plan` (add, done, frogs) |
| 3 | Frog of the Day | `/tapasya/plan` | `tapasya-plan` |
| 4 | Priority planner | `/tapasya/plan` ("Suggest a plan") | web only |
| 5 | Pomodoro setup and presets | `/tapasya/focus` (create, edit, duplicate, select, delete) | `tapasya-focus` (select; editing on web) |
| 6 | Active session | `/tapasya/focus` | `tapasya-focus` |
| 7 | Break and completion | `/tapasya/focus` | `tapasya-focus` |
| 8 | XP and achievements | `/tapasya/xp` | summary on `tapasya` |
| 9 | Global leaderboard | `/tapasya/leaderboard` (+ alias/consent panel) | `tapasya-leaderboard` (viewing) |
| 10 | Guardian approval / temporary unlock | `/tapasya/guardian`; student request in the focus room | `tapasya` (guardian view); request and code entry in `tapasya-focus` |
| 11 | Teacher assignment and progress | `/tapasya/teach` | web only |
| 12 | Device restrictions and capability | `/tapasya/devices` (reported devices) | `tapasya-device` (live check and setup) |
| 13 | Session history | `/tapasya/history` | recent sessions on `tapasya` |
| 14 | Platform admin and leaderboard management | `/platform/tapasya` (settings, scoring, seasons, moderation, audit) | — |

School administrators also get `/tapasya/settings` (enable, timer ranges, unlock
limits, global participation).

### Rules the server enforces (not the client)

* **School identity, role and student** come from the session; no request body
  can name a school or a student it does not own. School tables go through
  `tenantDb`; the global tables are reachable only through
  `src/server/modules/tapasya/leaderboard.ts`, which returns alias, avatar, XP,
  rank, movement and badges and nothing else.
* **Timers** are rebuilt from stored timestamps. The client sends events
  (start, pause, resume, break, finish), never durations or completion flags.
  Duplicate events are ignored by a unique client event id.
* **XP** is written only by the server, in the same transaction as the interval
  that earned it, under a unique idempotency key, with daily and weekly caps.
  There is no endpoint that accepts an XP amount. Offline intervals are recorded
  as `PENDING` until checked for plausibility and overlap. Corrections are new
  reversal rows; nothing is edited in place.
* **Scoring changes** are new versions with a future effective date, a reason,
  and an audit row; earlier activity keeps the rules it earned under. By default
  every eligible interval earns the same XP, so choosing longer intervals does
  not buy rank, and the device restriction level never changes XP.
* **Policy hierarchy**: platform ⊇ school ⊇ teacher-mandated task ⊇ student
  preset. A preset outside the current limits is shown as unusable with the
  reason. It is never silently clamped.
* **Device restriction level** a session reached is what the phone reported
  after the OS confirmed it, and it can only ever be lowered during a session.
  The UI uses the labels Focus Timer Active, Partial Restrictions Active, App
  Shielding Active and Managed Kiosk Active. It never says "Full Lockdown".
* **Guardian unlock codes** are six digits from `crypto.randomInt`, stored only
  as an HMAC, valid for 10 minutes, five attempts, single use, rate-limited per
  student per day, and bound to the request id (no replay across requests).
  They are never written to logs, audit rows or notifications: the messaging
  layer refuses to use its log drivers, so with no provider configured the code
  is simply not sent and guardians approve in the app instead. An approval lifts
  only restrictions the app itself applied; school-managed kiosk mode stays.
* **Leaderboard privacy**: alias only (unique; rejected if it contains the
  student's own first or last name, a phone-like run of digits, or a word on a
  short blocklist), preset avatars, no school or class shown. Every student
  needs a guardian's consent before appearing, and rejoining after leaving asks
  again; opt-out and guardian withdrawal remove the profile from rankings. Schools can
  switch participation off. The preview board is generated sample data, labelled
  "Example only — not real students or scores" on every row, served from a
  separate code path, and never mixed into live rankings.

## 3. How it was checked

| Check | Result |
|---|---|
| `npx vitest run tests/tapasya-*` | 73 / 73 pass (engine, policy, scoring, periods, aliases, planner, and database tests for sessions, XP idempotency, offline sync, frogs, leaderboard projection and consent, unlock codes) |
| `npx vitest run` (whole repository) | 1351 pass, 1 fail. The failure is `schema-drift.test.ts` asking for `CrmPhoto` in `PLATFORM_ONLY_MODELS`; that model came from the Growth CRM work (commit `b29afdf`) and is unrelated to Tapasya. |
| `npx tsc --noEmit` (web) | Clean apart from one existing error in `scripts/_cancel-future-fee-invoices.ts:40`, untouched |
| `npm run typecheck` (mobile) | Clean |
| Mirror test | `mobile/src/tapasya/engine.ts` and `device.ts` are byte-identical to the server copies |
| `npm run build` | Passes |
| Browser smoke (demo school, admin) | Settings, class progress, leaderboard and example board render. Two fixes came out of it: form labels are now tied to their inputs, and two-column layouts no longer overflow on phone widths. |
| Android module | `gradlew :tapasya-device-control:compileDebugKotlin` compiles |
| iOS module | Not compiled (Windows machine, no iOS project in the repository) |

Not checked: the student and parent flows in a browser, the platform console in
a browser (no platform login was available), any mobile screen on a device or
emulator, and real WhatsApp delivery.

## 4. Deploying

1. Back up the database, then `npx prisma migrate deploy` (migrations
   `20261019120000_tapasya` and `20261019130000_tapasya_engine_state`; both are
   additive). Rollback: `docs/tapasya/rollback.sql`.
2. `npm run rbac:sync` to add the permission keys `tapasya.use` (students),
   `tapasya.guardian` (parents), `tapasya.teach` (teachers, principals),
   `tapasya.manage` (principals, school admins) and `platform.tapasya`
   (platform super admin). Use `--dry-run` first to preview.
3. Schedule `POST /api/cron/tapasya?job=…` with `Authorization: Bearer $CRON_SECRET`:
   `reconcile` and `sweep` every 15 minutes, `rebuild` and `snapshot` daily just
   after midnight in the leaderboard timezone (Asia/Kolkata by default).
   Without `CRON_SECRET` the endpoint answers 503.
4. A school enables Tapasya Mode in `/tapasya/settings`. The global leaderboard
   is controlled separately in `/platform/tapasya`.

### WhatsApp delivery of unlock codes

Uses the existing parent messaging (`sendParentMessage`), so whatever provider
the school already uses for notices carries the code. On Meta Cloud,
business-initiated messages need an approved template: set
`WHATSAPP_NOTIFY_TEMPLATE` (the same one notices use). With
`MESSAGING_WHATSAPP_FAILOVER_SMS` the code falls back to SMS. With no provider,
requests still reach guardians as in-app notifications and can be approved
there; the student sees "could not be delivered" rather than waiting for a code.

## 5. Native device control — what needs provisioning

The phone always reports the strongest level it actually reached. Until the
steps below are done, a device reports a lower level, which is the correct and
expected behaviour.

### Android

| Level | Requirement | Code |
|---|---|---|
| Partial Restrictions | The student allows "Do Not Disturb access" (prompted from the Phone controls screen). `ACCESS_NOTIFICATION_POLICY` is declared. | `setDoNotDisturb` sets priority-only and restores the previous filter afterwards. Reports success only if the OS confirms. |
| Managed Kiosk | Device enrolled in an EMM (Android Enterprise) or a device-owner DPC that allow-lists `com.mycampusview.app` for Lock Task (`setLockTaskPackages`). | `startManagedLockTask` refuses unless `isLockTaskPermitted`, so it never falls back to user-exitable screen pinning. Reports Managed Kiosk only when the OS reports `LOCKED`. |

Phones are dialable for emergencies in both modes. Configure the EMM's Lock Task
features to keep the system dialer and status bar if the school's policy requires it.

Observed while compiling: a full Android build of this checkout stops while
configuring `@react-native-voice/voice`, which still declares `jcenter()`. That is
independent of Tapasya; the module was compiled with `--configure-on-demand`.
Whatever patch the release build uses for that package still applies.

### iOS

There is no iOS project or iOS build pipeline in the repository, so none of
this has been compiled or run.

| Level | Requirement | Code |
|---|---|---|
| App Shielding | Apple's Family Controls entitlement (`com.apple.developer.family-controls`, requested from Apple for distribution), the Screen Time capability in the app target, then `EXPO_PUBLIC_TAPASYA_IOS_SHIELDING=1` **only after** verifying on a device that the shield works and does not shield MyCampusView itself. | `requestScreenTimeAuthorization(.individual)`, then `ManagedSettingsStore(named: "tapasya")` shields all app and web categories; cleared when the session ends. Default off: iPhones report Focus Timer Active. |
| Managed Kiosk | Supervised device with an MDM profile granting Autonomous Single App Mode to the app. | `UIAccessibility.requestGuidedAccessSession`; reported only when iOS returns success. |

Not built on purpose: per-app selection with `FamilyActivityPicker` and
`DeviceActivity` schedules (which need a separate app extension target). The
module is structured so they can be added without changing the TypeScript API.

## 6. Known limits and honest caveats

* **"Focus" means a completed countdown with the app in use**, not verified
  attention. Nothing measures whether the student actually studied.
* The leaderboard is genuinely cross-school only once more than one school
  enables participation and students opt in. Until then it shows whoever has
  joined, or an empty state, never padding.
* Offline sessions work for events after a session starts; starting a session
  requires a connection.
* Restrictions are released when the session ends while the app is running. If
  the app is killed mid-session, Do Not Disturb stays on until the next session
  or until the student turns it off; managed kiosk is controlled by the EMM.
* Mobile preset editing, the priority planner and the teacher screens are web
  only for now.
