# Booking System API

ระบบจองงาน Event ที่รองรับ concurrency สูง สร้างด้วย NestJS + TypeORM + Redis บน Clean Architecture

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 (strict mode) |
| Database | PostgreSQL 16 |
| Cache / Lock | Redis 7 |
| ORM | TypeORM |
| Validation | class-validator, class-transformer |
| Containerization | Docker, Docker Compose |

---

## Architecture

โปรเจกต์นี้ใช้ **Clean Architecture** แบ่งเป็น 4 ชั้น:

```
src/
├── domain/                           ← Business logic (ไม่ขึ้นกับ framework)
│   ├── entities/base.entity.ts       ← Base entity (uuid, createdAt, updatedAt, deletedAt)
│   ├── repositories/                 ← Repository interfaces
│   └── use-cases/base.use-case.ts   ← IUseCase<TInput, TOutput>
│
├── infrastructure/                   ← Framework / External services
│   ├── database/database.module.ts   ← TypeORM async config
│   ├── redis/                        ← RedisModule (@Global) + RedisService
│   ├── lock/                         ← DistributedLockService (Redis SET NX)
│   └── repositories/base.repository.ts
│
├── modules/
│   ├── event/                        ← Event module
│   │   ├── domain/                   ← Entity, Repository interface
│   │   ├── infrastructure/           ← TypeORM Repository implementation
│   │   ├── application/              ← Use Cases, DTOs
│   │   └── presentation/            ← Controller
│   │
│   └── booking/                      ← Booking module
│       ├── domain/                   ← Booking + Waitlist Entity, Interfaces
│       ├── infrastructure/           ← TypeORM Repository implementations
│       ├── application/              ← Use Cases (Create, Cancel), DTOs
│       └── presentation/            ← Controller
│
└── common/
    └── exceptions/                   ← Custom exceptions
```

---

## Concurrency & Safety Design

ระบบมี **3 ชั้นป้องกัน** Race Condition และ Double-Booking ซ้อนกัน:

### Layer 1 — Distributed Lock (Redis SET NX EX)

ทุก booking request ต้องผ่าน lock ก่อน จะมีแค่ 1 process ต่อ event ที่เข้า critical section ได้พร้อมกัน

```
acquire lock(event:<id>:booking)
  → ตรวจสอบ / จอง / waitlist
release lock (finally)
```

- Auto-expire หลัง `LOCK_TTL_MS` (default 10 วินาที) ป้องกัน deadlock
- Retry ด้วย exponential backoff สูงสุด 10 ครั้ง
- Token-based release (Lua script) ป้องกัน process อื่น unlock แทน

### Layer 2 — Redis Atomic DECR

นับ seat แบบ atomic ไม่มีทาง "อ่านค่าเก่า" พร้อมกัน 2 process:

```
DECR event:<id>:seats
  → ได้ค่า >= 0 → จองสำเร็จ
  → ได้ค่า < 0  → restore counter → เข้า Waitlist
```

### Layer 3 — PostgreSQL Partial Unique Index

เป็น safety net สุดท้ายในระดับ Database:

```sql
UNIQUE (userId, eventId) WHERE status NOT IN ('cancelled')
```

---

## Booking Flow

### จองที่นั่ง

```
POST /bookings
  │
  ├─ Acquire distributed lock (event:<id>:booking)
  ├─ Guard: event published?
  ├─ Guard: already booked / on waitlist?
  ├─ Redis DECR seats
  │    ├─ seats >= 0 → CREATE confirmed booking
  │    │               DECR availableSeats ใน DB
  │    │               → { status: "confirmed" }
  │    │
  │    └─ seats < 0  → INCR seats (restore)
  │                    ADD to Redis waitlist (ZADD score=timestamp)
  │                    CREATE waitlist record ใน DB
  │                    → { status: "waitlisted", position: N }
  │
  └─ Release lock (finally)
```

### ยกเลิกการจอง + Auto-Promote Waitlist

```
DELETE /bookings/cancel
  │
  ├─ Acquire distributed lock (event:<id>:booking)
  ├─ UPDATE booking → CANCELLED
  ├─ Redis INCR seats
  ├─ ZPOPMIN waitlist (ดึงคนแรกในคิว)
  │    ├─ มีคน → UPDATE waitlist → PROMOTED
  │    │         CREATE new CONFIRMED booking
  │    │         DECR seats กลับ (seat ถูกใช้โดย promoted user)
  │    │
  │    └─ ไม่มีคน → INCR availableSeats ใน DB
  │
  └─ Release lock (finally)
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- npm

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment

```bash
cp .env.example .env
```

แก้ไข `.env` ตามต้องการ:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking_system
DB_SYNCHRONIZE=true
DB_LOGGING=true

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_secret

LOCK_TTL_MS=10000
```

### 3. รันด้วย Docker Compose

```bash
# รัน PostgreSQL + Redis + App ทั้งหมด
docker compose up

# รันแค่ PostgreSQL + Redis (สำหรับ local dev)
docker compose up postgres redis
```

### 4. รัน App (local dev)

```bash
npm run start:dev
```

API พร้อมใช้ที่ `http://localhost:3000`

---

## API Reference

### Events

#### สร้าง Event

```http
POST /events
Content-Type: application/json

{
  "name": "NestJS Workshop 2025",
  "description": "เรียนรู้ NestJS ขั้นสูง",
  "location": "Bangkok",
  "startDate": "2025-06-01T09:00:00.000Z",
  "endDate": "2025-06-01T17:00:00.000Z",
  "capacity": 100
}
```

**Response `201`**

```json
{
  "id": "uuid",
  "name": "NestJS Workshop 2025",
  "capacity": 100,
  "availableSeats": 100,
  "status": "published",
  "createdAt": "..."
}
```

#### ดู Event + จำนวนที่นั่ง

```http
GET /events/:id
```

**Response `200`**

```json
{
  "event": { "id": "uuid", "name": "...", "capacity": 100, "availableSeats": 87 },
  "availableSeats": 87,
  "waitlistSize": 3
}
```

---

### Bookings

#### จองที่นั่ง

```http
POST /bookings
Content-Type: application/json

{
  "userId": "uuid",
  "eventId": "uuid"
}
```

**Response `201` — จองสำเร็จ**

```json
{
  "status": "confirmed",
  "booking": {
    "id": "uuid",
    "userId": "uuid",
    "eventId": "uuid",
    "status": "confirmed",
    "confirmedAt": "..."
  }
}
```

**Response `201` — ที่นั่งเต็ม (เข้า Waitlist)**

```json
{
  "status": "waitlisted",
  "waitlist": { "id": "uuid", "userId": "uuid", "eventId": "uuid", "position": 4 },
  "position": 4
}
```

**Error Responses**

| Status | เหตุผล |
|---|---|
| `404` | Event ไม่พบ |
| `400` | Event ไม่ได้เปิดรับจอง |
| `409` | จองซ้ำ หรืออยู่ใน Waitlist แล้ว |
| `503` | ระบบ load สูงมาก ได้ lock ไม่ทัน (retry) |

#### ยกเลิกการจอง

```http
DELETE /bookings/cancel
Content-Type: application/json

{
  "bookingId": "uuid",
  "userId": "uuid"
}
```

**Response `200`**

```json
{
  "id": "uuid",
  "status": "cancelled",
  "cancelledAt": "..."
}
```

> เมื่อยกเลิก ระบบจะ **auto-promote** คนแรกในคิว Waitlist โดยอัตโนมัติ

---

## Database Schema

### `events`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Primary key |
| name | varchar(255) | ชื่อ event |
| description | text | รายละเอียด |
| location | varchar(500) | สถานที่ |
| startDate | timestamp | วันเริ่ม |
| endDate | timestamp | วันจบ |
| capacity | int | จำนวนที่นั่งทั้งหมด |
| availableSeats | int | ที่นั่งเหลือ (sync กับ Redis) |
| status | enum | draft / published / cancelled / completed |
| createdAt | timestamp | auto |
| updatedAt | timestamp | auto |
| deletedAt | timestamp | soft delete |

### `bookings`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Primary key |
| userId | uuid | ผู้จอง |
| eventId | uuid (FK) | อ้างอิง event |
| status | enum | confirmed / cancelled / waitlisted / promoted |
| confirmedAt | timestamp | เวลายืนยัน |
| cancelledAt | timestamp | เวลายกเลิก |

> **Unique Index:** `(userId, eventId)` WHERE `status NOT IN ('cancelled')`

### `waitlists`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Primary key |
| userId | uuid | ผู้รอ |
| eventId | uuid (FK) | อ้างอิง event |
| status | enum | waiting / promoted / expired |
| position | int | ลำดับในคิว (1-indexed) |
| promotedAt | timestamp | เวลาที่ได้รับการ promote |

> **Unique Index:** `(userId, eventId)` WHERE `status = 'waiting'`

---

## Redis Key Design

| Key Pattern | Type | ใช้สำหรับ |
|---|---|---|
| `event:<id>:seats` | String | จำนวน seat ที่เหลือ (atomic counter) |
| `event:<id>:waitlist` | Sorted Set | คิว waitlist (score = timestamp, FIFO) |
| `lock:event:<id>:booking` | String (NX EX) | Distributed lock ต่อ event |

---

## Scripts

```bash
# Development
npm run start:dev      # Hot reload
npm run start:debug    # Debug mode

# Build & Production
npm run build
npm run start:prod

# Code Quality
npm run lint           # ESLint check
npm run format         # Prettier format

# Testing
npm run test           # Unit tests
npm run test:cov       # Coverage report
npm run test:e2e       # E2E tests
```

---

## VSCode Setup

เปิด `.vscode/settings.json` ที่มาพร้อมโปรเจกต์จะได้:

- **Format on Save** ด้วย Prettier
- **ESLint auto-fix** on save

Extensions ที่แนะนำ:

- `dbaeumer.vscode-eslint`
- `esbenp.prettier-vscode`
- `ms-vscode.vscode-typescript-next`
