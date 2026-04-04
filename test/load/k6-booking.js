import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const confirmedCount = new Counter('bookings_confirmed');
const waitlistedCount = new Counter('bookings_waitlisted');
const failedCount = new Counter('bookings_failed');
const successRate = new Rate('booking_success_rate');

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';
const EVENT_ID = __ENV.EVENT_ID;

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2s', target: 50 },
        { duration: '5s', target: 50 },
        { duration: '2s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  if (!EVENT_ID) {
    console.error('❌ กรุณาระบุ EVENT_ID: k6 run -e EVENT_ID=<uuid> ...');
    return;
  }

  const userId = generateUUID();

  const payload = JSON.stringify({ userId, eventId: EVENT_ID });
  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(`${BASE_URL}/bookings`, payload, { headers });

  const isSuccess = check(res, {
    'status is 201': (r) => r.status === 201,
    'has booking status': (r) => {
      const body = JSON.parse(r.body);
      return body.status === 'confirmed' || body.status === 'waitlisted';
    },
  });

  successRate.add(isSuccess);

  if (res.status === 201) {
    const body = JSON.parse(res.body);
    if (body.status === 'confirmed') {
      confirmedCount.add(1);
    } else if (body.status === 'waitlisted') {
      waitlistedCount.add(1);
    }
  } else {
    failedCount.add(1);
    console.warn(`⚠️  Unexpected status ${res.status}: ${res.body}`);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  const confirmed = data.metrics.bookings_confirmed?.values?.count ?? 0;
  const waitlisted = data.metrics.bookings_waitlisted?.values?.count ?? 0;
  const failed = data.metrics.bookings_failed?.values?.count ?? 0;
  const total = confirmed + waitlisted + failed;
  const p95 = data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0) ?? '-';

  console.log('\n════════════════════════════════════════');
  console.log('  Booking Load Test Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Total requests : ${total}`);
  console.log(`  ✅ Confirmed   : ${confirmed}`);
  console.log(`  🟡 Waitlisted  : ${waitlisted}`);
  console.log(`  ❌ Failed      : ${failed}`);
  console.log(`  ⏱  p95 latency : ${p95}ms`);
  console.log('════════════════════════════════════════\n');

  return {
    stdout: '',
  };
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
