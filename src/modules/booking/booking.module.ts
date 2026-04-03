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
import { GetBookingStatusUseCase } from './application/use-cases/get-booking-status.use-case';
import { BookingListener } from './application/listeners/booking.listener';
import { BookingController } from './presentation/booking.controller';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, WaitlistEntity]),
    EventModule,
  ],
  providers: [
    { provide: BOOKING_REPOSITORY, useClass: BookingRepository },
    { provide: WAITLIST_REPOSITORY, useClass: WaitlistRepository },
    CreateBookingUseCase,
    CancelBookingUseCase,
    GetBookingStatusUseCase,
    BookingListener,
  ],
  controllers: [BookingController],
})
export class BookingModule {}
