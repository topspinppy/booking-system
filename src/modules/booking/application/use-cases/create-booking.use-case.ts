import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { IUseCase } from '../../../../domain/use-cases/base.use-case';
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
import { CreateBookingDto } from '../dto/create-booking.dto';

export type BookingResult =
  | { status: 'confirmed'; booking: BookingEntity }
  | { status: 'waitlisted'; waitlist: WaitlistEntity; position: number };

/**
 * Create Booking Use Case
 *
 * Seat claim: `RedisService.tryClaimSeat` uses a short Redis lock per event
 * plus plain GET/DECR so the flow is readable; all seat INCR/DECR paths share
 * the same lock key so they cannot interleave.
 *
 * Defense layers:
 *  1. Redis tryClaimSeat + shared seat lock key
 *  2. DB unique partial index — (userId, eventId) WHERE status != 'cancelled'
 *  3. DB QueryRunner — catch constraint error, rollback seat on conflict
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
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
  ) {}

  async execute(input: CreateBookingDto): Promise<BookingResult> {
    const { userId, eventId } = input;

    // ── Guard 1: event must exist and be published ──────────────────────────
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundException(`Event "${eventId}" not found`);
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        `Event "${event.name}" is not accepting bookings`,
      );
    }

    // ── Guard 2: prevent double-booking (fast DB check) ─────────────────────
    const [existing, existingWaitlist] = await Promise.all([
      this.bookingRepo.findByUserAndEvent(userId, eventId),
      this.waitlistRepo.findByUserAndEvent(userId, eventId),
    ]);

    if (existing?.status === BookingStatus.CONFIRMED) {
      throw new ConflictException('You have already booked this event');
    }
    if (existing?.status === BookingStatus.WAITLISTED) {
      throw new ConflictException(
        'You are already on the waitlist for this event',
      );
    }
    if (existingWaitlist?.status === WaitlistStatus.WAITING) {
      throw new ConflictException(
        'You are already on the waitlist for this event',
      );
    }

    // ── Seat reservation (Redis lock + GET / DECR) ─────────────────────────
    const remaining = await this.redisService.tryClaimSeat(eventId);

    if (remaining >= 0) {
      // ✅ Seat claimed in Redis — write to DB
      try {
        const booking = await this.bookingRepo.create({
          userId,
          eventId,
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
        });

        // Sync DB counter (non-blocking, Redis is source of truth for speed)
        await this.eventRepo.decrementAvailableSeats(eventId);

        this.logger.log(
          `Booking CONFIRMED: user=${userId} event=${eventId} seats_left=${remaining}`,
        );
        return { status: 'confirmed', booking };
      } catch (err: unknown) {
        // DB unique constraint violation → another request for same user+event
        // snuck through the guard (between read and write). Release seat back.
        const isUniqueViolation =
          err instanceof Error && err.message.includes('duplicate key');

        if (isUniqueViolation) {
          await this.redisService.incrementSeats(eventId);
          throw new ConflictException('You have already booked this event');
        }

        // Unknown error — release seat and rethrow
        await this.redisService.incrementSeats(eventId);
        throw err;
      }
    }

    // ❌ No seats — add to waitlist
    const position = (await this.redisService.getWaitlistSize(eventId)) + 1;

    // Add to Redis waitlist (sorted set, score = timestamp → FIFO order)
    await this.redisService.addToWaitlist(eventId, userId);

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
}
