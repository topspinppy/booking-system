import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUseCase } from '../../../../domain/use-cases/base.use-case';
import {
  BookingEntity,
  BookingStatus,
} from '../../domain/entities/booking.entity';
import { WaitlistStatus } from '../../domain/entities/waitlist.entity';
import type { IBookingRepository } from '../../domain/repositories/booking.repository.interface';
import { BOOKING_REPOSITORY } from '../../domain/repositories/booking.repository.interface';
import type { IWaitlistRepository } from '../../domain/repositories/waitlist.repository.interface';
import { WAITLIST_REPOSITORY } from '../../domain/repositories/waitlist.repository.interface';
import type { IEventRepository } from '../../../event/domain/repositories/event.repository.interface';
import { EVENT_REPOSITORY } from '../../../event/domain/repositories/event.repository.interface';
import { RedisService } from '../../../../infrastructure/redis/redis.service';
import { CancelBookingDto } from '../dto/cancel-booking.dto';
import {
  BOOKING_EVENTS,
  BookingCancelledEvent,
  BookingPromotedEvent,
} from '../../domain/events/booking.events';

@Injectable()
export class CancelBookingUseCase implements IUseCase<
  CancelBookingDto,
  BookingEntity
> {
  private readonly logger = new Logger(CancelBookingUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo: IBookingRepository,
    @Inject(WAITLIST_REPOSITORY)
    private readonly waitlistRepo: IWaitlistRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: CancelBookingDto): Promise<BookingEntity> {
    const { bookingId, userId } = input;

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking)
      throw new NotFoundException(`Booking "${bookingId}" not found`);
    if (booking.userId !== userId)
      throw new ForbiddenException('You do not own this booking');
    if (booking.status === BookingStatus.CANCELLED)
      throw new BadRequestException('Booking is already cancelled');
    if (booking.status === BookingStatus.WAITLISTED)
      throw new BadRequestException(
        'Use remove-from-waitlist for waitlisted entries',
      );

    const event = await this.eventRepo.findById(booking.eventId);
    const capacity = event?.capacity ?? Number.MAX_SAFE_INTEGER;

    const cancelled = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.CANCELLED,
      { cancelledAt: new Date() },
    );

    this.eventEmitter.emit(
      BOOKING_EVENTS.CANCELLED,
      new BookingCancelledEvent(bookingId, userId, booking.eventId),
    );

    await this.redisService.releaseSeat(booking.eventId, capacity);

    const promotedUserId = await this.redisService.popNextFromWaitlist(
      booking.eventId,
    );

    if (promotedUserId) {
      const waitlistEntry = await this.waitlistRepo.findByUserAndEvent(
        promotedUserId,
        booking.eventId,
      );

      if (waitlistEntry) {
        await this.waitlistRepo.updateStatus(
          waitlistEntry.id,
          WaitlistStatus.PROMOTED,
          { promotedAt: new Date() },
        );

        const promoted = await this.bookingRepo.create({
          userId: promotedUserId,
          eventId: booking.eventId,
          status: BookingStatus.PROMOTED,
          confirmedAt: new Date(),
        });

        await this.redisService.tryClaimSeat(booking.eventId);

        this.eventEmitter.emit(
          BOOKING_EVENTS.PROMOTED,
          new BookingPromotedEvent(
            promotedUserId,
            booking.eventId,
            event?.name ?? '',
            promoted.id,
          ),
        );

        this.logger.log(
          `Waitlist PROMOTED: user=${promotedUserId} event=${booking.eventId}`,
        );
      }
    } else {
      await this.eventRepo.incrementAvailableSeats(booking.eventId);
    }

    this.logger.log(
      `Booking CANCELLED: id=${bookingId} event=${booking.eventId}`,
    );
    return cancelled;
  }
}
