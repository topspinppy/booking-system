import {
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';

/**
 * Distributed Lock using Redis SET NX EX (single-node Redlock pattern).
 *
 * Flow:
 *  acquire() → SET lock:<key> <token> NX EX <ttl>
 *  release() → Lua: if GET == token then DEL (atomic check-and-delete)
 *
 * This prevents:
 *  - Race conditions (only one holder at a time)
 *  - Stale locks (auto-expire via TTL)
 *  - Accidental release by wrong owner (token check)
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly ttlMs: number;

  // Lua script: atomically release only if the token matches
  private readonly RELEASE_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.ttlMs = this.config.get<number>('LOCK_TTL_MS', 10000);
  }

  /**
   * Acquire a distributed lock for the given key.
   * Retries up to maxRetries times with exponential backoff.
   *
   * @returns token string — must be passed to release()
   * @throws ServiceUnavailableException if lock cannot be acquired
   */
  async acquire(
    key: string,
    maxRetries = 10,
    retryDelayMs = 100,
  ): Promise<string> {
    const lockKey = `lock:${key}`;
    const token = randomUUID();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.redis.set(
        lockKey,
        token,
        'PX',
        this.ttlMs,
        'NX',
      );

      if (result === 'OK') {
        this.logger.debug(`Lock acquired: ${lockKey} (attempt ${attempt + 1})`);
        return token;
      }

      // Exponential backoff with jitter
      const delay = retryDelayMs * Math.pow(1.5, attempt) + Math.random() * 50;
      await this.sleep(delay);
    }

    throw new ServiceUnavailableException(
      `Could not acquire lock for "${key}" after ${maxRetries} attempts. Please try again.`,
    );
  }

  /**
   * Release a lock. Only releases if the token matches (prevents releasing
   * a lock owned by another process after TTL expiry).
   */
  async release(key: string, token: string): Promise<void> {
    const lockKey = `lock:${key}`;
    const released = await this.redis.eval(
      this.RELEASE_SCRIPT,
      1,
      lockKey,
      token,
    );
    if (released === 0) {
      this.logger.warn(
        `Lock not released (expired or wrong token): ${lockKey}`,
      );
    } else {
      this.logger.debug(`Lock released: ${lockKey}`);
    }
  }

  /**
   * Convenience wrapper — runs fn() while holding the lock.
   * Always releases the lock in a finally block.
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    maxRetries?: number,
  ): Promise<T> {
    const token = await this.acquire(key, maxRetries);
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
