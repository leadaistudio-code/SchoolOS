# Biometric troubleshooting

## Connector shows Offline

- Confirm Windows service is running
- Confirm outbound HTTPS to the school host (firewall / proxy)
- Check Connect logs under `%ProgramData%\MyCampusView\Connect\logs`
- Revoked connectors stay offline — generate a new pairing code

## Pairing code rejected

- Codes expire after 30 minutes
- Codes are single-use
- Copy the display form exactly (`MCV-XXXX-XXXX`)

## Device not listed in MyCampusView

- Device must be registered by Connect via `POST /device-gateway/devices`
- Confirm connector secret is valid
- Confirm `localDeviceId` is stable across restarts

## Events stuck UNMAPPED

- Map the device user ID under **Settings → Biometric → User mapping**
- Prefer matching `admissionNo` / `employeeCode`
- After mapping, pending events for that user are reprocessed automatically

## Duplicate attendance

- Raw events are deduped by `dedupeKey`
- Rapid re-punches may be SKIPPED for attendance interpretation (duplicate window) while raw rows remain
- Do not delete raw events to “fix” duplicates

## Manual ABSENT vs biometric PRESENT

- Default setting requires conflict review (`CONFLICT` status on the raw event)
- Resolve by correcting attendance manually or adjusting the setting

## Clock drift warning

- Device `clockDriftSec` is stored when Connect reports it
- Do not silently rewrite historical punches
- Use Sync Device Time command only if the adapter supports it

## Realtime RS9W errors

- “Vendor SDK required” means the stub adapter is still in use
- See `docs/realtime-rs9w-integration.md`

## Pending sync after outage

- Events stay in SQLite until cloud acknowledgement
- After reconnect, Connect drains the queue in batches
- Server duplicate responses are success for the queue (mark synced)
