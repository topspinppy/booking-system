import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity } from './domain/entities/booking.entity';
import { WaitlistEntity } from './domain/entities/waitlist.entity';
import { BookingRepository } from './infrastructure/repositories/booking.repository';
import { WaitlistRepository } from './infrastructure/repositories/waitlist.repository';
import { BOOKING_REPOSITORY } from './domain/repositories/booking.repository.interface';
import { WAITLIST_REPOSITORY } from './domain/repositories/waitlist.repository.interface';
import { CreateBookingUseCase } from './application/use-cases/create-booking.use-case';
import { CancelBookingUseCase } from './application/use-cases/cancel-booking.use-case';
import { BookingController } from './presentation/booking.controller';
import { EventModule } from '../event/event.module';
import { DistributedLockModule } from '../../infrastructure/lock/distributed-lock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, WaitlistEntity]),
    EventModule,
    DistributedLockModule,
  ],
  providers: [
    { provide: BOOKING_REPOSITORY, useClass: BookingRepository },
    { provide: WAITLIST_REPOSITORY, useClass: WaitlistRepository },
    CreateBookingUseCase,
    CancelBookingUseCase,
  ],
  controllers: [BookingController],
})
export class BookingModule {}
