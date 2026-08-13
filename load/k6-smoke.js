/**
 * MyCampusView smoke load test (k6).
 *
 * Run:
 *   docker run --rm -i grafana/k6 run -e BASE_URL=http://demo.lvh.me:3000 - < load/k6-smoke.js
 * or:
 *   npm run load:smoke
 *
 * Env:
 *   BASE_URL   default http://demo.lvh.me:3000
 *   VUS        default 5
 *   DURATION   default 30s
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://demo.lvh.me:3000'
const VUS = Number(__ENV.VUS || 5)
const DURATION = __ENV.DURATION || '30s'

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
}

export default function () {
  const health = http.get(`${BASE_URL}/api/health`)
  check(health, {
    'health is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'health has status field': (r) => String(r.body).includes('"status"'),
  })

  const metrics = http.get(`${BASE_URL}/api/metrics`)
  check(metrics, {
    'metrics is 200': (r) => r.status === 200,
    'metrics exposes uptime': (r) => String(r.body).includes('mycampusview_uptime_seconds'),
  })

  const loginPage = http.get(`${BASE_URL}/login`)
  check(loginPage, {
    'login page loads': (r) => r.status === 200,
  })

  sleep(1)
}
