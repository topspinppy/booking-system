/**
 * Concurrent Booking Test
 * ─────────────────────────────────────────────────────────────────────────────
 * ทดสอบ race condition โดยยิง N requests พร้อมกันในเวลาเดียวกัน
 *
 * วิธีรัน:
 *   node test/load/concurrent-booking.test.mjs
 *
 * ตัวแปรปรับได้:
 *   BASE_URL      - URL ของ API (default: http://localhost:3000)
 *   CAPACITY      - จำนวนที่นั่งของ event ที่จะสร้าง (default: 5)
 *   TOTAL_USERS   - จำนวน user ที่จะจองพร้อมกัน (default: 20)
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPACITY = Number(process.env.CAPACITY ?? 5);
const TOTAL_USERS = Number(process.env.TOTAL_USERS ?? 20);

// ── สี terminal ──────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, label, msg) {
  console.log(`${color}${c.bold}[${label}]${c.reset} ${msg}`);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ── สร้าง UUID ง่ายๆ ─────────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(60));
  log(c.cyan, 'CONFIG', `API: ${BASE_URL}`);
  log(c.cyan, 'CONFIG', `Event capacity : ${CAPACITY} seats`);
  log(c.cyan, 'CONFIG', `Concurrent users: ${TOTAL_USERS} users`);
  console.log('═'.repeat(60) + '\n');

  // ── Step 1: สร้าง Event ───────────────────────────────────────────────────
  log(c.cyan, 'SETUP', `Creating event with ${CAPACITY} seats...`);
  const { status: evStatus, data: event } = await post('/events', {
    name: `Concurrent Test Event – ${Date.now()}`,
    description: 'Auto-created for load test',
    location: 'Test Arena',
    startDate: new Date(Date.now() + 86400000).toISOString(),
    endDate: new Date(Date.now() + 90000000).toISOString(),
    capacity: CAPACITY,
  });

  if (evStatus !== 201) {
    log(c.red, 'ERROR', `Failed to create event: ${JSON.stringify(event)}`);
    process.exit(1);
  }
  log(c.green, 'SETUP', `Event created → id: ${event.id}`);

  // ── Step 2: สร้าง user IDs ───────────────────────────────────────────────
  const userIds = Array.from({ length: TOTAL_USERS }, () => uuid());

  // ── Step 3: ยิงทุก request พร้อมกัน ──────────────────────────────────────
  console.log('');
  log(c.yellow, 'TEST', `Firing ${TOTAL_USERS} concurrent booking requests...`);
  const startTime = Date.now();

  const results = await Promise.allSettled(
    userIds.map((userId) =>
      post('/bookings', { userId, eventId: event.id }),
    ),
  );

  const elapsed = Date.now() - startTime;

  // ── Step 4: รวมผล ──────────────────────────────────────────────────────────
  const confirmed = [];
  const waitlisted = [];
  const failed = [];
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const userId = userIds[i];

    if (result.status === 'rejected') {
      errors.push({ userId, error: String(result.reason) });
      continue;
    }

    const { status, data } = result.value;

    if (status === 201 && data.status === 'confirmed') {
      confirmed.push({ userId, bookingId: data.booking?.id });
    } else if (status === 201 && data.status === 'waitlisted') {
      waitlisted.push({ userId, position: data.position });
    } else {
      failed.push({ userId, status, message: data.message ?? JSON.stringify(data) });
    }
  }

  // ── Step 5: แสดงผล ────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  log(c.green, 'CONFIRMED', `${confirmed.length} / ${TOTAL_USERS} users (expected ≤ ${CAPACITY})`);
  log(c.yellow, 'WAITLISTED', `${waitlisted.length} / ${TOTAL_USERS} users`);

  if (failed.length > 0) {
    log(c.red, 'FAILED', `${failed.length} requests`);
    failed.forEach((f) => {
      log(c.red, `  HTTP ${f.status}`, `user ${f.userId.slice(0, 8)}… → ${f.message}`);
    });
  }

  if (errors.length > 0) {
    log(c.red, 'NETWORK ERR', `${errors.length} requests (server unreachable?)`);
    errors.forEach((e) => log(c.red, '  ERR', e.error));
  }

  console.log('─'.repeat(60));
  log(c.gray, 'TIME', `Completed in ${elapsed}ms`);

  // ── Step 6: Assertions ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  let pass = true;

  function assert(condition, label, detail) {
    if (condition) {
      log(c.green, '✓ PASS', `${label}  ${c.gray}(${detail})${c.reset}`);
    } else {
      log(c.red, '✗ FAIL', `${label}  ${c.gray}(${detail})${c.reset}`);
      pass = false;
    }
  }

  assert(
    confirmed.length <= CAPACITY,
    'Confirmed bookings do not exceed capacity',
    `${confirmed.length} ≤ ${CAPACITY}`,
  );

  assert(
    confirmed.length + waitlisted.length === TOTAL_USERS - failed.length - errors.length,
    'All successful responses are either confirmed or waitlisted',
    `${confirmed.length} + ${waitlisted.length} = ${TOTAL_USERS - failed.length - errors.length}`,
  );

  assert(
    new Set(confirmed.map((b) => b.userId)).size === confirmed.length,
    'No duplicate confirmed bookings (no double-booking)',
    `${confirmed.length} unique users`,
  );

  assert(
    errors.length === 0,
    'No network errors',
    `${errors.length} errors`,
  );

  console.log('═'.repeat(60) + '\n');

  if (!pass) {
    log(c.red, 'RESULT', '❌ Some assertions failed — race condition may exist!');
    process.exit(1);
  } else {
    log(c.green, 'RESULT', '✅ All assertions passed — concurrency protection works!');
  }
}

run().catch((err) => {
  log('\x1b[31m', 'FATAL', String(err));
  process.exit(1);
});
