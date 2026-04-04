# Booking System API

API สำหรับจองที่นั่งงานอีเวนต์ มีคิวรอ (waitlist) และยกเลิกแล้วดึงคนถัดไปเข้ามาแทนอัตโนมัติ
สร้างด้วย **NestJS**, เก็บข้อมูลหลักใน **PostgreSQL**, ใช้ **Redis** ช่วยนับที่นั่งและล็อกเวลามีหลายคนจองพร้อมกัน

---

## ใช้อะไรบ้าง

| type           | Stack                                                 |
| -------------- | ----------------------------------------------------- |
| framework      | NestJS 11                                             |
| language       | TypeScript 5 (โหมด strict)                            |
| db             | PostgreSQL 16                                         |
| Redis          | Redis 7 ผ่าน `ioredis`                                |
| orm            | TypeORM                                               |
| Validation     | class-validator, class-transformer                    |
| เอกสาร API     | Swagger (เปิดดูที่ `/docs`)                           |
| Event          | `@nestjs/event-emitter` (ไว้ต่อยอด เช่น ส่งแจ้งเตือน) |
| รันด้วย Docker | Docker Compose                                        |

---

## โครงโปรเจกต์ (แบบเข้าใจง่าย)

โค้ดแบ่งชั้นตาม **Clean Architecture** โดยคร่าวๆ คือ: กฎธุรกิจอยู่กลางๆ ไม่ผูกกับ Nest โดยตรง ส่วนที่ต่อกับ DB / Redis / HTTP อยู่รอบนอก

```
src/
├── domain/                    ← กฎและสัญญา (entity ฐาน, interface repository, use case ฐาน)
├── infrastructure/            ← ต่อจริงกับ PostgreSQL, Redis, distributed lock
├── modules/
│   ├── event/                 ← สร้าง/ดูอีเวนต์
│   └── booking/               ← จอง, ยกเลิก, เช็คสถานะ + listener รับ event
└── common/                    ← exception ร่วม
```

แต่ละโมดูล (`event`, `booking`) จะมี `domain` → `application` (use case, DTO) → `infrastructure` (TypeORM) → `presentation` (controller) ตามลำดับ

---

## เวลาหลายคนกดจองพร้อมกัน ระบบกันยังไง

สั้นๆ คือ **ไม่ให้ตัวเลขที่นั่งใน Redis เพี้ยน** และ **ไม่ให้คนเดียวกันจองซ้ำได้** โดยมีสามชั้นช่วยกัน:

### 1) ล็อกใน Redis (ก่อนจะไปแตะตัวนับที่นั่ง)

เวลาจะอ่านหรือลด/เพิ่มค่า `event:<id>:seats` จะเข้า critical section ทีละคิวต่ออีเวนต์
คีย์ล็อกจริงใน Redis หน้าตาประมาณ **`lock:seat-counter:<eventId>`** (โค้ดส่ง logical key `seat-counter:<eventId>` เข้าไป แล้ว service ใส่ prefix `lock:` ให้)

- ล็อกหมดอายุเองตาม `LOCK_TTL_MS` (ค่าเริ่มต้น 10 วินาที) กันติดค้าง
- ถ้าได้ล็อกไม่ทันจะลองใหม่สูงสุด 10 ครั้ง โดยรอนานขึ้นเรื่อยๆ แบบถ่วงน้ำหนัก
- ปล่อยล็อกด้วย Lua ที่เช็ค token ก่อนลบ เพื่อกันคนอื่นมาปลดล็อกแทน

### 2) การ “ขอที่นั่ง” ทำในขณะถือล็อก

ขั้นตอนคือ: ดูค่าใน Redis ก่อน → ถ้าไม่มีตัวเลขหรือเหลือไม่พอถือว่าเต็ม → ถ้ายังพอให้ลดตัวนับลงหนึ่ง

ส่วนการใส่ชื่อเข้า waitlist (ZADD + แถวใน DB) เกิด **หลัง** ช่วงล็อกตัวนับแล้ว ส่วนชั้นถัดไปช่วยรองรับความผิดพลาด

### 3) Unique index ใน PostgreSQL

ถ้ามีอะไรหลุดรอดมา DB ยังมีกฎว่า **ห้ามมี booking ซ้ำสำหรับ user + event เดียวกัน** ถ้าสถานะยังไม่ใช่ cancelled:

```sql
UNIQUE (userId, eventId) WHERE status NOT IN ('cancelled')
```

---

## Flow การใช้งานหลัก

### จองที่นั่ง (`POST /bookings`)

- เช็คว่ามีอีเวนต์และเปิดรับจองอยู่
- เช็คว่ายังไม่เคยจองซ้ำ / ไม่อยู่ในคิวรอแล้ว
- ขอที่นั่งจาก Redis (ในขณะถือล็อกตามด้านบน)
  - **ได้ที่นั่ง** → สร้าง booking สถานะ confirmed และลด `availableSeats` ใน DB
  - **เต็ม** → ใส่ Redis waitlist + สร้างแถว waitlist ใน DB แล้วบอกลำดับคิว

### ยกเลิก (`DELETE /bookings/cancel`)

- เช็คว่าเป็นเจ้าของ booking จริง และยกเลิกได้ตามสถานะ
- ตั้งสถานะ cancelled แล้วคืนที่นั่งใน Redis (มีล็อกเหมือนเดิม)
- ดึงคนแรกในคิว waitlist ถ้ามี → อัปเดตสถานะ waitlist → สร้าง booking ใหม่ให้คนนั้น และ sync ตัวนับ Redis ให้ตรงกับที่นั่งที่ถูกใช้
- ถ้าไม่มีใครในคิว → เพิ่ม `availableSeats` ใน DB แทน

### Event ภายในแอป (log / ต่อยอด)

ตอนนี้มีการยิง event จริงๆ ตอน **ยกเลิก** และตอน **promote จาก waitlist**
`BookingListener` จะ log ให้เห็นใน console ส่วน event แบบ “จองสำเร็จ / เข้าคิว” ยังมี class ไว้ในโค้ดเผื่อต่อระบบแจ้งเตือนหรือ audit ภายหลัง

---

## เริ่มใช้งาน

### สิ่งที่ต้องมี

- Docker + Docker Compose
- Node.js 20 ขึ้นไป
- `npm` (ใน repo มี `pnpm-lock.yaml` ด้วย ถ้าใช้ pnpm ก็รัน `pnpm install` ได้)

### 1) ติดตั้งแพ็กเกจ

```bash
npm install
# หรือ: pnpm install
```

### 2) ตั้งค่า `.env`

```bash
cp .env.example .env
```

จากนั้นแก้ค่าตามเครื่องคุณ ตัวอย่าง:

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

### 3) รัน Docker

```bash
# รันทั้งแอป + PostgreSQL + Redis
docker compose up

# หรือรันแค่ DB กับ Redis แล้วรันแอปบนเครื่องเอง
docker compose up postgres redis
```

### 4) รันแอป (dev)

```bash
npm run start:dev
```

เปิดใช้ API ที่ `http://localhost:3000`

### ดูเอกสาร API แบบมีฟอร์มลองยิง

| ลิงก์                                                              | คำอธิบาย        |
| ------------------------------------------------------------------ | ----------------- |
| [http://localhost:3000/docs](http://localhost:3000/docs)           | Swagger UI        |
| [http://localhost:3000/docs-json](http://localhost:3000/docs-json) | OpenAPI เป็น JSON |

---

## API สรุปสั้นๆ

### Events

**สร้างอีเวนต์** `POST /events`
ตอนนี้พฤติกรรมคือสร้างแล้วถือว่า **เปิดรับจองเลย (`published`)** และตั้งค่า Redis ให้เหลือที่นั่งเท่ากับ `capacity`

ตัวอย่าง body:

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

ตอบ `201` แบบคร่าวๆ:

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

**ดูรายละเอียดอีเวนต์** `GET /events/:id`
ได้ทั้งข้อมูลอีเวนต์, ที่นั่งว่างจาก Redis, และจำนวนคนในคิว waitlist

```json
{
  "event": {
    "id": "uuid",
    "name": "...",
    "capacity": 100,
    "availableSeats": 87
  },
  "availableSeats": 87,
  "waitlistSize": 3
}
```

---

### Bookings

**จอง** `POST /bookings`

```json
{ "userId": "uuid", "eventId": "uuid" }
```

- จองได้ → `201` พร้อม `status: "confirmed"` และ object `booking`
- ที่นั่งเต็ม → ยัง `201` แต่ `status: "waitlisted"` พร้อม `waitlist` และ `position`

ถ้ามีปัญหามักเจอแบบนี้:

| HTTP  | ความหมาย                              |
| ----- | ----------------------------------------- |
| `404` | หา event ไม่เจอ                           |
| `400` | อีเวนต์ยังไม่เปิดรับจอง                   |
| `409` | จองซ้ำหรืออยู่ในคิวแล้ว                   |
| `503` | แน่นมาก จับล็อก Redis ไม่ทัน ลองใหม่ได้ |

**ยกเลิก** `DELETE /bookings/cancel`

```json
{ "bookingId": "uuid", "userId": "uuid" }
```

ถ้ายกเลิกสำเร็จได้ booking กลับมาสถานะ `cancelled` และถ้ามีคนรอ ระบบจะดึงคนแรกในคิวขึ้นมาแทนให้เอง

| HTTP  | ความหมาย                                                       |
| ----- | ------------------------------------------------------------------ |
| `404` | ไม่มี booking นี้                                                  |
| `403` | user นี้ไม่ใช่เจ้าของ                                              |
| `400` | ยกเลิกไม่ได้ เช่น ยกเลิกไปแล้ว หรือพยายามยกเลิกแถวที่เป็น waitlist |

**เช็คว่าตัวเองอยู่สถานะไหน** `GET /bookings/status/:userId/:eventId`
ดึงจาก DB เป็นหลัก ถ้ายังรอคิวจะไปดูลำดับใน Redis ด้วย

ใน body จะมี field `type` บอกสถานะ:

| `type`       | ความหมาย                                                                               |
| ------------ | ------------------------------------------------------------------------------------------ |
| `confirmed`  | มีที่นั่งแล้ว                                                                              |
| `promoted`   | เคยรอคิว แล้วได้ขึ้นมาเป็นที่นั่งจริง                                                      |
| `waitlisted` | ยังรอ มีทั้ง `position` ใน DB กับ `currentPosition` ที่คำนวณจาก Redis (นับแบบเริ่มที่ 1) |
| `cancelled`  | เคยจองแล้วยกเลิกไปแล้ว                                                                     |
| `not_found`  | ไม่มีทั้ง booking ที่ยังใช้อยู่และไม่มีแถว waitlist ให้คนนี้                               |

ถ้าเจอ edge case ของสถานะ waitlist แปลกๆ อาจได้ `404` จากข้างใน use case

---

## ตารางในฐานข้อมูล (สรุป)

### `events`

| คอลัมน์                         | ประเภท       | หมายเหตุ                                             |
| ------------------------------- | ------------ | ---------------------------------------------------- |
| id                              | uuid         | primary key                                          |
| name, description, location     | text/varchar | รายละเอียดงาน                                        |
| startDate, endDate              | timestamp    | เวลาเริ่ม–จบ                                         |
| capacity, availableSeats        | int          | ความจุ vs ที่ว่าง (ให้สอดคล้องกับ Redis เวลารันระบบ) |
| status                          | enum         | draft / published / cancelled / completed            |
| createdAt, updatedAt, deletedAt | timestamp    | มี soft delete                                       |

### `bookings`

| คอลัมน์                  | ประเภท    | หมายเหตุ                                      |
| ------------------------ | --------- | --------------------------------------------- |
| userId, eventId          | uuid      | ใครจองงานไหน                                  |
| status                   | enum      | confirmed / cancelled / waitlisted / promoted |
| confirmedAt, cancelledAt | timestamp | เวลาที่เกี่ยวข้อง                             |

กฎสำคัญ: **ห้ามซ้ำ (userId, eventId)** ถ้า status ยังไม่ใช่ cancelled

### `waitlists`

| คอลัมน์         | ประเภท    | หมายเหตุ                     |
| --------------- | --------- | ---------------------------- |
| userId, eventId | uuid      | ใครรองานไหน                  |
| status          | enum      | waiting / promoted / expired |
| position        | int       | ลำดับในคิว (นับ 1, 2, 3, …)  |
| promotedAt      | timestamp | เมื่อไหร่ที่ได้เลื่อนจากคิว  |

กฎสำคัญ: **ห้ามซ้ำ (userId, eventId)** ในสถานะ `waiting` เท่านั้น

---

## Redis เก็บอะไรบ้าง

| คีย์                     | ชนิด                  | ใช้ทำอะไร                           |
| ------------------------ | --------------------- | ----------------------------------- |
| `event:<id>:seats`       | string                | เหลือกี่ที่ (แก้ทีละทีเมื่อถือล็อก) |
| `event:<id>:waitlist`    | sorted set            | คิวรอ เรียงตามเวลาเข้า (FIFO)       |
| `lock:seat-counter:<id>` | string (NX + หมดอายุ) | ล็อกตอนปรับตัวนับที่นั่ง            |

---

## คำสั่งที่ใช้บ่อย

```bash
# พัฒนา
npm run start:dev
npm run start:debug

# build / production
npm run build
npm run start:prod

# คุณภาพโค้ด
npm run lint
npm run format

# เทส
npm run test
npm run test:cov
npm run test:e2e

# ทดสอบแบบหลายคนจองพร้อมกัน (ต้องรัน API + DB + Redis ก่อน)
npm run test:concurrent

# โหลดเทสด้วย k6 (ต้องใส่ EVENT_ID ของอีเวนต์จริง)
# ตัวอย่าง: EVENT_ID=<uuid> k6 run test/load/k6-booking.js
npm run test:load
```

---

## Postman

มีไฟล์ `booking-system.postman_collection.json` ให้ import แล้วตั้ง `baseUrl` ให้ชี้มาที่ API ของคุณ

---

## VSCode

แนะนำเปิด format on save กับ Prettier และ ESLint fix on save
ส่วนเสริมที่ใช้สะดวก: ESLint, Prettier, TypeScript (หรือตัว next ของ VS Code)
