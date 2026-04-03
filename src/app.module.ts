import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { EventModule } from './modules/event/event.module';
import { BookingModule } from './modules/booking/booking.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    DatabaseModule,
    RedisModule,
    EventModule,
    BookingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
