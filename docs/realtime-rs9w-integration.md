# Realtime RS9W integration

## Status

**Vendor SDK / DLL is not present in this repository.**

The Connect adapter boundary is:

```text
IBiometricDeviceAdapter
 ├── SimulatedBiometricAdapter   (lab / E2E)
 └── Realtime.RealtimeRS9WAdapter  (stub — throws until SDK is linked)
```

Cloud APIs and attendance processing do **not** import Realtime types.

## When you obtain the SDK

1. Place vendor DLLs / COM components under a documented private folder (do not commit proprietary binaries unless licensed).
2. Implement only `RealtimeRS9WAdapter`:
   - `Connect` / `Disconnect` / `TestConnection`
   - `GetDeviceInfo`
   - `GetNewAttendanceLogs(checkpoint)`
   - Optional: `GetDeviceTime` / `SetDeviceTime` / `GetUsers`
3. Map vendor records to `BiometricEvent` (user id, local timestamp, verification method, optional direction/event id).
4. Keep checkpointing in Connect (log index / event id — not timestamp-only).

## Do not

- Invent a proprietary wire protocol
- Fake successful device connections without the SDK
- Upload fingerprint templates or images to MyCampusView
- Change cloud APIs for vendor-specific fields (put them in `rawPayload`)

## Test without hardware

Use Simulator brand with `AllowSimulator=true` on a non-Production Connect profile. Prove:

punch → local queue → batch upload → raw event → mapping → attendance.
