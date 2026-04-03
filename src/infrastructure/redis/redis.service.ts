import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { DistributedLockService } from '../lock/distributed-lock.service';

@Injectable()
export class RedisService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly lock: DistributedLockService,
  ) {}

  /** Same key for every seat mutation so cancel / booking / rollback cannot interleave. */
  private seatLockKey(eventId: string): string {
    return `seat-counter:${eventId}`;
  }

  private seatsKey(eventId: string): string {
    return `event:${eventId}:seats`;
  }

  /** Set available seats for an event (called when event is created/updated) */
  async initSeats(eventId: string, capacity: number): Promise<void> {
    await this.redis.set(this.seatsKey(eventId), String(capacity));
  }

  /**
   * Try to reserve one seat.
   * Returns remaining seats (>= 0), or -1 if none left.
   */
  async tryClaimSeat(eventId: string): Promise<number> {
    const key = this.seatsKey(eventId);
    return this.lock.withLock(this.seatLockKey(eventId), async () => {
      const raw = await this.redis.get(key);
      const n = raw !== null ? Number.parseInt(raw, 10) : Number.NaN;
      if (raw === null || Number.isNaN(n) || n <= 0) {
        return -1;
      }
      return this.redis.decr(key);
    });
  }

  /**
   * Release one seat (e.g. cancel). Never increments above `capacity`.
   */
  async releaseSeat(eventId: string, capacity: number): Promise<number> {
    const key = this.seatsKey(eventId);
    return this.lock.withLock(this.seatLockKey(eventId), async () => {
      const raw = await this.redis.get(key);
      let current = raw !== null ? Number.parseInt(raw, 10) : 0;
      if (Number.isNaN(current)) current = 0;
      if (current >= capacity) {
        return current;
      }
      return this.redis.incr(key);
    });
  }

  /** Decrement seats by 1 (remaining after decrement). */
  async decrementSeats(eventId: string): Promise<number> {
    const key = this.seatsKey(eventId);
    return this.lock.withLock(this.seatLockKey(eventId), async () =>
      this.redis.decr(key),
    );
  }

  /** Increment seats by 1 (e.g. rollback or cancel without waitlist promotion). */
  async incrementSeats(eventId: string): Promise<number> {
    const key = this.seatsKey(eventId);
    return this.lock.withLock(this.seatLockKey(eventId), async () =>
      this.redis.incr(key),
    );
  }

  async getAvailableSeats(eventId: string): Promise<number | null> {
    const val = await this.redis.get(this.seatsKey(eventId));
    return val !== null ? Number.parseInt(val, 10) : null;
  }

  async addToWaitlist(eventId: string, userId: string): Promise<void> {
    const score = Date.now();
    await this.redis.zadd(`event:${eventId}:waitlist`, score, userId);
  }

  async removeFromWaitlist(eventId: string, userId: string): Promise<void> {
    await this.redis.zrem(`event:${eventId}:waitlist`, userId);
  }

  async popNextFromWaitlist(eventId: string): Promise<string | null> {
    const result = await this.redis.zpopmin(`event:${eventId}:waitlist`, 1);
    // zpopmin returns [member, score, ...] or []
    return result.length > 0 ? result[0] : null;
  }

  async getWaitlistPosition(eventId: string, userId: string): Promise<number> {
    const rank = await this.redis.zrank(`event:${eventId}:waitlist`, userId);
    return rank !== null ? rank : -1;
  }

  async getWaitlistSize(eventId: string): Promise<number> {
    return this.redis.zcard(`event:${eventId}:waitlist`);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /** Evaluate a Lua script atomically (generic escape hatch). */
  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.redis.eval(script, keys.length, ...keys, ...args);
  }
}
