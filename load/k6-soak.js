/**
 * MyCampusView soak / ramp load test (k6).
 *
 * docker run --rm -i grafana/k6 run -e BASE_URL=http://demo.lvh.me:3000 - < load/k6-soak.js
 * npm run load:soak
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://demo.lvh.me:3000'

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 25 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<3000'],
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/api/health`)
  check(res, { 'health responded': (r) => r.status === 200 || r.status === 503 })
  sleep(0.5)
}
