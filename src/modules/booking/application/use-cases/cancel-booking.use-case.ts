import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { IUseCase } from '../../../../domain/use-cases/base.use-case';
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
import { DistributedLockService } from '../../../../infrastructure/lock/distributed-lock.service';
import { CancelBookingDto } from '../dto/cancel-booking.dto';

/**
 * Cancel Booking Use Case — also handles waitlist promotion:
 *
 *  1. Acquire lock for the event
 *  2. Validate: booking exists, belongs to user, is cancellable
 *  3. Mark booking as CANCELLED
 *  4. INCR Redis seat counter
 *  5. Check waitlist → if someone is waiting, promote them:
 *       a. Pop first user from Redis waitlist
 *       b. Update WaitlistEntity status → PROMOTED
 *       c. Create a new CONFIRMED BookingEntity for the promoted user
 *       d. DECR seat counter back (seat is now taken by promoted user)
 *  6. If no waitlist, increment DB availableSeats
 *  7. Release lock
 */
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
    @Inject(EVENT_REPOSITORY) private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
    private readonly lockService: DistributedLockService,
  ) {}

  async execute(input: CancelBookingDto): Promise<BookingEntity> {
    const { bookingId, userId } = input;

    // Fetch booking first (outside lock) for validation
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking)
      throw new NotFoundException(`Booking "${bookingId}" not found`);
    if (booking.userId !== userId)
      throw new ForbiddenException('You do not own this booking');
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }
    if (booking.status === BookingStatus.WAITLISTED) {
      throw new BadRequestException(
        'Use remove-from-waitlist for waitlisted entries',
      );
    }

    return this.lockService.withLock(
      `event:${booking.eventId}:booking`,
      async () => {
        // ── Cancel the booking ───────────────────────────────────────────────
        const cancelled = await this.bookingRepo.updateStatus(
          bookingId,
          BookingStatus.CANCELLED,
          {
            cancelledAt: new Date(),
          },
        );

        // ── Restore seat in Redis ────────────────────────────────────────────
        await this.redisService.incrementSeats(booking.eventId);

        // ── Promote from waitlist (if any) ───────────────────────────────────
        const promotedUserId = await this.redisService.popNextFromWaitlist(
          booking.eventId,
        );

        if (promotedUserId) {
          // Find the DB waitlist record
          const waitlistEntry = await this.waitlistRepo.findByUserAndEvent(
            promotedUserId,
            booking.eventId,
          );

          if (waitlistEntry) {
            // Mark waitlist record as promoted
            await this.waitlistRepo.updateStatus(
              waitlistEntry.id,
              WaitlistStatus.PROMOTED,
              {
                promotedAt: new Date(),
              },
            );

            // Create a confirmed booking for the promoted user
            await this.bookingRepo.create({
              userId: promotedUserId,
              eventId: booking.eventId,
              status: BookingStatus.PROMOTED,
              confirmedAt: new Date(),
            });

            // Seat is taken by promoted user — decrement back
            await this.redisService.decrementSeats(booking.eventId);

            this.logger.log(
              `Waitlist PROMOTED: user=${promotedUserId} event=${booking.eventId}`,
            );
          }
        } else {
          // No one on waitlist — reflect seat in DB
          await this.eventRepo.incrementAvailableSeats(booking.eventId);
        }

        this.logger.log(
          `Booking CANCELLED: id=${bookingId} event=${booking.eventId}`,
        );
        return cancelled;
      },
    );
  }
}
