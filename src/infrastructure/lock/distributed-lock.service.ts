import {
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly ttlMs: number;
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

      const delay = retryDelayMs * Math.pow(1.5, attempt) + Math.random() * 50;
      await this.sleep(delay);
    }

    throw new ServiceUnavailableException(
      `Could not acquire lock for "${key}" after ${maxRetries} attempts. Please try again.`,
    );
  }

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
