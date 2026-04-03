import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  // ── Seat counter (atomic) ────────────────────────────────────────────────

  /** Set available seats for an event (called when event is created/updated) */
  async initSeats(eventId: string, capacity: number): Promise<void> {
    await this.redis.set(`event:${eventId}:seats`, capacity);
  }

  /** Atomically decrement seats. Returns remaining seats AFTER decrement. */
  async decrementSeats(eventId: string): Promise<number> {
    return this.redis.decr(`event:${eventId}:seats`);
  }

  /** Atomically increment seats (on booking cancellation). */
  async incrementSeats(eventId: string): Promise<number> {
    return this.redis.incr(`event:${eventId}:seats`);
  }

  async getAvailableSeats(eventId: string): Promise<number | null> {
    const val = await this.redis.get(`event:${eventId}:seats`);
    return val !== null ? parseInt(val, 10) : null;
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

  /** Evaluate a Lua script atomically. */
  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.redis.eval(script, keys.length, ...keys, ...args);
  }
}
