# Load testing

MyCampusView ships k6 scripts under [`load/`](../load/). They hit unauthenticated
surfaces (`/api/health`, `/api/metrics`, `/login`) so you can run them against
a local or staging host without seed credentials.

## Smoke (quick)

App must be running (`npm run dev`).

```bash
npm run load:smoke
# or
docker run --rm -i grafana/k6 run \
  -e BASE_URL=http://host.docker.internal:3000 \
  - < load/k6-smoke.js
```

Defaults: 5 VUs for 30s. Override with `VUS` / `DURATION` / `BASE_URL`.

Thresholds fail the run if error rate ≥ 5% or p95 ≥ 2s.

## Soak / ramp

```bash
npm run load:soak
```

Ramps to 25 VUs over ~5 minutes. Use against staging, not a laptop Postgres
with tiny connection limits.

## What “good” looks like

| Check | Expectation |
| --- | --- |
| `/api/health` | `200` with `status: ok` when DB is up |
| `/api/metrics` | Prometheus text including `mycampusview_uptime_seconds` |
| Error rate | Under 5% (smoke) / 10% (soak) |
| p95 latency | Under 2s smoke / 3s soak on a warm host |

Authenticated ERP flows (login → dashboard → exams) should be added as a
second script once you have a dedicated load-test tenant and password in CI
secrets — do not hardcode production credentials.
