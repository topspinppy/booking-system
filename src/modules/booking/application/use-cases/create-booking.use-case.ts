import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { IUseCase } from '../../../../domain/use-cases/base.use-case';
import {
  BookingEntity,
  BookingStatus,
} from '../../domain/entities/booking.entity';
import {
  WaitlistEntity,
  WaitlistStatus,
} from '../../domain/entities/waitlist.entity';
import type { IBookingRepository } from '../../domain/repositories/booking.repository.interface';
import { BOOKING_REPOSITORY } from '../../domain/repositories/booking.repository.interface';
import type { IWaitlistRepository } from '../../domain/repositories/waitlist.repository.interface';
import { WAITLIST_REPOSITORY } from '../../domain/repositories/waitlist.repository.interface';
import type { IEventRepository } from '../../../event/domain/repositories/event.repository.interface';
import { EVENT_REPOSITORY } from '../../../event/domain/repositories/event.repository.interface';
import { EventStatus } from '../../../event/domain/entities/event.entity';
import { RedisService } from '../../../../infrastructure/redis/redis.service';
import { DistributedLockService } from '../../../../infrastructure/lock/distributed-lock.service';
import { CreateBookingDto } from '../dto/create-booking.dto';

export type BookingResult =
  | { status: 'confirmed'; booking: BookingEntity }
  | { status: 'waitlisted'; waitlist: WaitlistEntity; position: number };

/**
 * Create Booking Use Case — concurrency-safe booking flow:
 *
 *  1. Acquire distributed lock for the event  → serialises concurrent requests
 *  2. Guard: event exists and is published
 *  3. Guard: user hasn't already booked this event (double-booking check)
 *  4. Atomically DECR Redis seat counter
 *     a. seats >= 0  → create CONFIRMED booking + decrement DB availableSeats
 *     b. seats < 0   → restore counter, add user to WAITLIST (Redis + DB)
 *  5. Release lock (via finally)
 *
 * Defense layers against double-booking & race conditions:
 *  - Distributed lock   (Layer 1: serialises per-event requests)
 *  - Redis atomic DECR  (Layer 2: atomic seat reservation)
 *  - DB partial index   (Layer 3: unique (userId, eventId) where status != cancelled)
 */
@Injectable()
export class CreateBookingUseCase implements IUseCase<
  CreateBookingDto,
  BookingResult
> {
  private readonly logger = new Logger(CreateBookingUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo: IBookingRepository,
    @Inject(WAITLIST_REPOSITORY)
    private readonly waitlistRepo: IWaitlistRepository,
    @Inject(EVENT_REPOSITORY) private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
    private readonly lockService: DistributedLockService,
  ) {}

  async execute(input: CreateBookingDto): Promise<BookingResult> {
    const { userId, eventId } = input;

    return this.lockService.withLock(`event:${eventId}:booking`, async () => {
      // ── Guard 1: event must exist and be published ──────────────────────
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw new NotFoundException(`Event "${eventId}" not found`);
      if (event.status !== EventStatus.PUBLISHED) {
        throw new BadRequestException(
          `Event "${event.name}" is not accepting bookings`,
        );
      }

      // ── Guard 2: prevent double-booking ─────────────────────────────────
      const existing = await this.bookingRepo.findByUserAndEvent(
        userId,
        eventId,
      );
      if (existing) {
        if (existing.status === BookingStatus.CONFIRMED) {
          throw new ConflictException('You have already booked this event');
        }
        if (existing.status === BookingStatus.WAITLISTED) {
          throw new ConflictException(
            'You are already on the waitlist for this event',
          );
        }
      }

      // ── Guard 3: check if already on waitlist ───────────────────────────
      const existingWaitlist = await this.waitlistRepo.findByUserAndEvent(
        userId,
        eventId,
      );
      if (existingWaitlist?.status === WaitlistStatus.WAITING) {
        throw new ConflictException(
          'You are already on the waitlist for this event',
        );
      }

      // ── Seat reservation: atomic DECR in Redis ──────────────────────────
      const remainingAfterDecr =
        await this.redisService.decrementSeats(eventId);

      if (remainingAfterDecr >= 0) {
        // ✅ Seat secured — create confirmed booking
        const booking = await this.bookingRepo.create({
          userId,
          eventId,
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
        });

        // Update DB seat count (non-blocking, Redis is source of truth for speed)
        await this.eventRepo.decrementAvailableSeats(eventId);

        this.logger.log(
          `Booking CONFIRMED: user=${userId} event=${eventId} seats_left=${remainingAfterDecr}`,
        );
        return { status: 'confirmed', booking };
      } else {
        // ❌ No seats — restore counter and add to waitlist
        await this.redisService.incrementSeats(eventId);

        const position = (await this.redisService.getWaitlistSize(eventId)) + 1;

        // Add to Redis waitlist (sorted set, score = timestamp for FIFO)
        await this.redisService.addToWaitlist(eventId, userId);

        // Persist waitlist entry to DB
        const waitlist = await this.waitlistRepo.create({
          userId,
          eventId,
          status: WaitlistStatus.WAITING,
          position,
        });

        this.logger.log(
          `User WAITLISTED: user=${userId} event=${eventId} position=${position}`,
        );
        return { status: 'waitlisted', waitlist, position };
      }
    });
  }
}
