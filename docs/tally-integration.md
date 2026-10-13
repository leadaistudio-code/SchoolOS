# Tally.ERP 9 Integration â€” MyCampusView

## Architecture (what we built)

```
MyCampusView (cloud)
        â”‚  HTTPS outbound from school only
        â–¼
Tally Connector (Windows PC beside Tally)
        â”‚  XML over HTTP
        â–¼
Tally.ERP 9  (localhost:9000)
```

Tally remains the **accounting** source of truth.  
MyCampusView remains the **school operations** source of truth (students, fees, receipts).

Cloud **never** dials `192.168.x.x:9000` in production. The school runs a local connector (same pairing/command pattern as biometric Connect).

`DIRECT` mode exists only for self-hosted deployments with `TALLY_ALLOW_DIRECT=1` and private/RFC1918 hosts (SSRF-guarded).

## What reuses the existing stack

| Concern | Existing building block |
|---|---|
| Multi-tenant isolation | `tenantDb()` + `TENANT_SCOPED_MODELS` |
| Auth / RBAC | `fees.tally`, `fees.tally_manage`, `settings.integrations` |
| Local agent pattern | Mirrors `DeviceConnector` / device-gateway |
| Fee money path | Hooks after `collectManualPayment` + online `settleOnlinePayment` â€” never reverses SUCCESS |
| Durable work | `TallyCommand` claimed by connector (+ existing `Job` table available) |
| Audit | `audit()` + `TallySyncLog` |
| Fee heads / payments / receipts / expenses | Existing Prisma models â€” only mapping tables added |

## Phased delivery status

| Phase | Status |
|---|---|
| 1 Connection + connector + settings | Done |
| 2 Master sync + mapping UI | Done (ledger cache + fee-head mapping + auto-match) |
| 3 Fee receipt posting + idempotency + retry | Done (queue on collect; test mode blocks live post) |
| 4 Reverse sync (balances/vouchers) | Scaffold (FETCH_* commands + cache); needs live Tally validation |
| 5 Reconciliation | Done (MCV vs voucher links; no silent mutation) |
| 6 Finance dashboard / Sync Center | Done (`/finance/tally`) |
| 7 Security tests | Unit tests for XML/SSRF/matching; live Tally E2E requires school lab |
| 8 Hardening | Windows GUI + NSIS installer + boot auto-start service (`tools/tally-connector`) |

## Setup (school)

1. In Tally.ERP 9: Gateway of Tally â†’ F12 â†’ **Enable ODBC / XML over HTTP** on port **9000** (exact menu label varies by release â€” confirm on the schoolâ€™s build).
2. Load the correct company.
3. Install **MyCampusView Tally Connector** from `MyCampusView-Tally-Connector-Setup-1.0.2.exe` (build with `npm run dist` inside `tools/tally-connector`).
4. MyCampusView â†’ **Settings â†’ Tally ERP** â†’ enable integration (leave **Test mode** on) â†’ generate a pairing code.
5. Open **MyCampusView Tally Connector** on the Tally PC:
   - Enter the school cloud URL and pairing code â†’ **Pair with school**
   - **Test Tally**
   - **Install Windows startup service** (approve the Administrator prompt)
6. In MyCampusView, queue **Test connection** then **Sync masters**.
7. **Finance â†’ Tally** â†’ map fee heads (or Auto-map â‰¥92%) and seed payment-mode rules.
8. Collect a test fee â†’ confirm voucher link is `SKIPPED` while test mode is on.
9. Turn **Test mode** off only after dry-run preview looks correct.

Developer CLI (optional):

```bash
node tools/tally-connector/index.mjs pair --code MCVT-XXXX-XXXX --cloud https://<school-host>
node tools/tally-connector/index.mjs run
```

## Environment

| Variable | Purpose |
|---|---|
| `TALLY_ALLOW_DIRECT=1` | Allow DIRECT mode HTTP from the app server (self-hosted only) |

No Tally secrets are stored in the browser. Connector secrets are hashed at rest (`secretHash`); plaintext is shown once at pairing.

## APIs

### School (session + RBAC)

- `GET/PATCH /api/v1/tally/status`
- `POST /api/v1/tally/sync`
- `GET/POST/DELETE /api/v1/tally/mappings`
- `GET/POST /api/v1/tally/connectors`
- `GET/POST /api/v1/tally/reconciliation`

### Connector (bearer `mcv_tally_â€¦`)

- `POST /api/v1/tally-connector/pair`
- `POST /api/v1/tally-connector/heartbeat`
- `GET /api/v1/tally-connector/commands`
- `POST /api/v1/tally-connector/commands/:id/result`

## Idempotency

Receipt posts use:

`{tenantId}:FEE_PAYMENT:{paymentId}:Receipt`

Duplicate queues return the existing `TallyCommand` / `TallyVoucherLink`. A payment SUCCESS is never rolled back if Tally is offline â€” status stays `PENDING` / `RETRYING` / `REQUIRES_REVIEW`.

## Accounting safety

- No automatic edit/delete of Tally vouchers to force a match.
- Reconciliation is review-only.
- Test mode blocks live `CREATE_RECEIPT_VOUCHER` posting.
- Auto ledger creation defaults **OFF**.

## XML note (requires live validation)

Envelope shapes follow documented Tally.ERP 9 Import/Export patterns (`List of Companies`, `List of Ledgers`, `Vouchers`). Field quirks differ by Tally build and company configuration â€” validate voucher XML against the schoolâ€™s company before production cut-over. Do not invent undocumented Tally fields.

## TallyPrime later

`ITallyProvider` + `TallyErp9Provider` isolate XML differences. A future `TallyPrimeProvider` can plug in without rewriting fee collection.

## Known limitations

- Windows auto-update channel not wired yet (ship new Setup.exe for upgrades).
- GST / cost-centre lines are configurable in schema but not fully UI-driven.
- Expense â†’ Tally posting is flagged (`autoSyncExpenses`) but not hooked to `SchoolExpense` create yet.
- ODBC read path not implemented (XML HTTP preferred).
- Full E2E against a live Tally.ERP 9 company must be run in a school lab â€” CI uses a mock transport.

## Rollback

Disable `TallyIntegration.enabled` or revoke the connector. Existing fee collection continues unchanged.
