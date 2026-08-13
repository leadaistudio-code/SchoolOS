# Monitoring and alerting

## Endpoints

| Path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness + readiness (DB required; Redis when `RATE_LIMIT_DRIVER=redis`) |
| `GET /api/metrics` | Prometheus text metrics (uptime, memory, DB/Redis latency) |
| `/platform/health` | Super-admin UI: tenants, failed jobs, deliveries, audit |

Protect `/api/metrics` at the edge (private network / Basic auth / IP allowlist).
It is intentionally unauthenticated for scraper simplicity.

### Health payload

```json
{
  "status": "ok",
  "checks": {
    "database": "up",
    "latencyMs": 4,
    "redis": "up",
    "redisLatencyMs": 1
  },
  "uptimeSeconds": 120,
  "timestamp": "…"
}
```

Returns **503** when the database is down, or when Redis is required by the
rate-limit driver and unreachable.

## Webhook watcher

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/… \
HEALTH_URL=https://your.app/api/health \
  npm run health:watch
```

Alerts after 3 consecutive failures (override with `HEALTH_FAIL_THRESHOLD`) and
sends a recovery message when the service returns to `ok`.

Run this as a small always-on process (Railway worker, systemd, or a cron that
restarts the script). For managed uptime, also point Better Stack / Checkly /
UptimeRobot at `/api/health`.

## Suggested alerts

| Signal | Action |
| --- | --- |
| `/api/health` 503 for >2 minutes | Page on-call |
| `mycampusview_db_latency_ms` > 500 sustained | Investigate DB / pool |
| `mycampusview_redis_up == 0` with redis driver | Rate limits degraded to memory |
| Platform open tickets / failed jobs spike | Check `/platform/health` |
