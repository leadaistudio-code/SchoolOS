# API Reference — v1

The API is the same service layer the web UI uses. A native iOS or Android
client can be built against it without changing the backend.

Base URL: `https://<school>.<root-domain>/api/v1`

**The tenant is always taken from the Host header**, never from a body or query
parameter. A request to `demo.schoolos.app` can only ever touch School Demo.

---

## Envelope

Every response has the same shape.

Success:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 25, "total": 120, "totalPages": 5 },
  "error": null
}
```

Failure:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid",
    "details": [{ "path": "classLevelId", "message": "Required" }]
  }
}
```

`meta` is `null` for single-object responses.

### Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed or contradictory request |
| 401 | `UNAUTHENTICATED` | No session, expired, revoked, or belongs to another tenant |
| 403 | `FORBIDDEN` | Authenticated but missing the required permission |
| 404 | `NOT_FOUND` | Does not exist, or is not in your tenant — deliberately indistinguishable |
| 409 | `CONFLICT` | Duplicate key, or a business rule such as a full section |
| 402 | `QUOTA_EXCEEDED` | The plan limit for this resource is reached |
| 422 | `VALIDATION_ERROR` | Failed schema validation; see `details` |
| 429 | `RATE_LIMITED` | Slow down |
| 500 | `INTERNAL_ERROR` | Server fault; internals are never exposed |

---

## Authentication

Sessions are opaque tokens in an `httpOnly` cookie, set on login.

### `POST /auth/login`

```bash
curl -c jar -X POST https://demo.schoolos.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@demo.schoolos.dev","password":"Password@123"}'
```

`identifier` is an email address or a phone number.

```json
{
  "data": {
    "user": {
      "id": "c...", "firstName": "Anita", "lastName": "Rao",
      "email": "admin@demo.schoolos.dev",
      "roles": ["SCHOOL_ADMIN"],
      "permissions": ["dashboard.view", "students.view", "..."],
      "mustChangePassword": false
    },
    "tenant": { "id": "c...", "slug": "demo", "name": "Demo International School" }
  },
  "meta": null, "error": null
}
```

Returns `401 INVALID_CREDENTIALS` for both an unknown user and a wrong password,
so the endpoint cannot be used to discover who has an account.

### `GET /auth/me`

The current identity, its roles, its full permission set and its tenant. Clients
use the permission list to decide what to render — the server still enforces it.

### `POST /auth/logout`

Revokes the session server-side, not just the cookie.

### `POST /auth/password/forgot`

```bash
curl -X POST https://demo.schoolos.app/api/v1/auth/password/forgot   -H 'content-type: application/json'   -d '{"email":"parent@demo.schoolos.dev"}'
```

Emails a one-hour reset link. Always reports success, whether or not the address
belongs to an account — an app must not be able to enumerate a school's families
any more than a browser can.

### `POST /auth/password/otp/request`

```bash
curl -X POST https://demo.schoolos.app/api/v1/auth/password/otp/request   -H 'content-type: application/json'   -d '{"phone":"9842115933"}'
```

Sends a WhatsApp code to the number on the school record. Local numbers are
normalised against `DEFAULT_COUNTRY_CODE`. Returns `challengeToken` and a
masked number. A number belonging to nobody still receives a challenge, so a
native client cannot enumerate a school's families. `503 CHANNEL_UNAVAILABLE`
means WhatsApp could not deliver and a support ticket was raised instead.

### `POST /auth/password/otp/verify`

```bash
curl -X POST https://demo.schoolos.app/api/v1/auth/password/otp/verify   -H 'content-type: application/json'   -d '{"challengeToken":"...","code":"123456"}'
```

Exchanges a correct code for a short-lived `resetToken`, which is then spent
against `/auth/password/reset` below. Returns **no session** — the client signs
in afterwards, so MFA still applies. Fails `400 INVALID_CODE` with an
`attemptsLeft` detail; the challenge dies after five wrong codes.

### `POST /auth/password/reset`

```bash
curl -X POST https://demo.schoolos.app/api/v1/auth/password/reset   -H 'content-type: application/json'   -d '{"token":"<from the emailed link>","password":"NewPassword123"}'
```

Redeems a reset link, or an invitation with `"purpose":"INVITE"`. Returns **no
session**: the client signs in afterwards, so MFA still applies. Fails with
`INVALID_TOKEN` when the link is expired, spent or issued for another school,
and `WEAK_PASSWORD` when it does not meet the policy.

---

## Conventions

### Pagination, search, sort

All list endpoints accept:

| Parameter | Default | Notes |
| --- | --- | --- |
| `page` | `1` | 1-indexed |
| `pageSize` | `25` | Maximum 100 — an unbounded fetch is not possible |
| `q` | — | Server-side search, minimum 2 characters |
| `sort` | per endpoint | Resolved against a whitelist; anything else is ignored |
| `dir` | `asc` | `asc` or `desc` |

### Rate limits

| Bucket | Limit |
| --- | --- |
| Login (per identifier) | 8 / 5 min |
| Login (per IP) | 24 / 5 min |
| Reads | 300 / min |
| Mutations | 60 / min |
| Webhooks | 600 / min |

---

## Students

### `GET /students`

Requires `students.view`. Self-scoped roles receive only their own records.

Additional filters: `classLevelId`, `sectionId`, `status`
(`ACTIVE|ALUMNI|TRANSFERRED|WITHDRAWN|SUSPENDED`), `gender`, `hasDues`
(`yes|no`). Sortable by `firstName`, `lastName`, `admissionNo`, `createdAt`,
`status`.

```bash
curl -b jar 'https://demo.schoolos.app/api/v1/students?classLevelId=c...&hasDues=yes&sort=admissionNo'
```

```json
{
  "data": [{
    "id": "c...", "admissionNo": "DIS/2025/0001",
    "firstName": "Meera", "lastName": "Pillai",
    "className": "Class 8", "sectionName": "A", "rollNumber": 1,
    "guardianName": "Charvi Pillai", "guardianPhone": "+91...",
    "status": "ACTIVE", "dueMinor": 2050000
  }],
  "meta": { "page": 1, "pageSize": 25, "total": 120, "totalPages": 5 },
  "error": null
}
```

`dueMinor` — like every money field in the API — is an integer in **minor units**
(paise). Format at the edge; never store or transmit a float.

### `POST /students`

Requires `students.create`. Creates the student, their enrollment and, if
supplied, a guardian — in one transaction.

```json
{
  "admissionNo": "DIS/2025/0121",
  "firstName": "Aarav", "lastName": "Sharma",
  "gender": "MALE", "dateOfBirth": "2014-05-12",
  "classLevelId": "c...", "sectionId": "c...", "rollNumber": 24,
  "guardian": {
    "firstName": "Manoj", "lastName": "Sharma",
    "relation": "FATHER", "phone": "+919812345678"
  }
}
```

Rejects: a duplicate admission number (`409`), a section that does not belong to
the given class (`400`), a section already at capacity (`409`), a plan student
limit reached (`402`), no active academic session (`409`).

### `GET /students/{id}`

Requires `students.view`, plus row access. Returns the full profile: enrollment
history, guardians, documents, invoices and transport assignment.

### `PATCH /students/{id}`

Requires `students.edit`. Changing the class or section updates the current
enrollment; historical enrollments are never rewritten.

### `DELETE /students/{id}`

Requires `students.delete`. **Archives** — sets `deletedAt`, ends the current
enrollment and records the outstanding balance at the time of archival. Attendance,
invoices, receipts and results reference students, and schools have statutory
retention duties, so nothing is destroyed.

---

## Search

### `GET /search?q=...`

Global search across students, staff, parents, invoices and notices. Each source
is queried only if the caller holds the matching permission, and is narrowed by
the same row-level scope as its module — search is never a way around
authorization.

```json
{ "data": [
  { "id": "c...", "type": "Student", "title": "Aarohi Sharma",
    "subtitle": "DIS/2025/0003 · Class 5 A", "href": "/students/c..." }
], "meta": null, "error": null }
```

---

## Health

### `GET /api/health`

Unauthenticated. Reports process liveness, the database round trip, and Redis
when configured; returns `503` when the database is unreachable (or when Redis
is required by `RATE_LIMIT_DRIVER=redis` and down).

```json
{ "status": "ok",
  "checks": { "database": "up", "latencyMs": 3, "redis": "up", "redisLatencyMs": 1 },
  "uptimeSeconds": 412, "timestamp": "2026-08-08T12:02:14.165Z" }
```

### `GET /api/metrics`

Unauthenticated Prometheus text metrics (`mycampusview_uptime_seconds`, memory,
DB/Redis latency). Restrict at the edge in production.

See also [docs/MONITORING.md](MONITORING.md), [docs/LOAD_TESTING.md](LOAD_TESTING.md),
and [docs/BACKUP_RESTORE.md](BACKUP_RESTORE.md).

---

## Adding an endpoint

```ts
export const GET = route(
  async (req, ctx) => {
    const query = parseListQuery(req.nextUrl.searchParams)
    return ok(...)
  },
  { permission: 'module.view' },
)
```

`route()` supplies authentication, tenant binding, the permission check, rate
limiting and error shaping. `ctx.db` is already bound to the tenant. There is no
correct way to write a handler that skips one of these.
