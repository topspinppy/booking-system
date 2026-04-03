import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DistributedLockModule } from '../lock/distributed-lock.module';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule, DistributedLockModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const password = config.get<string>('REDIS_PASSWORD');
        const client = new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          ...(password ? { password } : {}),
          retryStrategy: (times) => Math.min(times * 50, 2000),
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
        });
        client.on('error', (err) =>
          console.error('[Redis] Error:', err.message),
        );
        client.on('connect', () => console.log('[Redis] Connected'));
        return client;
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService, DistributedLockModule],
})
export class RedisModule {}
