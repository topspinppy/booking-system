import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IUseCase } from '../../../../domain/use-cases/base.use-case';
import { BookingStatus } from '../../domain/entities/booking.entity';
import { WaitlistStatus } from '../../domain/entities/waitlist.entity';
import type { IBookingRepository } from '../../domain/repositories/booking.repository.interface';
import { BOOKING_REPOSITORY } from '../../domain/repositories/booking.repository.interface';
import type { IWaitlistRepository } from '../../domain/repositories/waitlist.repository.interface';
import { WAITLIST_REPOSITORY } from '../../domain/repositories/waitlist.repository.interface';
import { RedisService } from '../../../../infrastructure/redis/redis.service';

export interface GetBookingStatusInput {
  userId: string;
  eventId: string;
}

export type BookingStatusResult =
  | { type: 'confirmed'; bookingId: string; confirmedAt: Date }
  | { type: 'promoted'; bookingId: string; confirmedAt: Date }
  | {
      type: 'waitlisted';
      waitlistId: string;
      position: number; // ลำดับตอนเข้าคิว
      currentPosition: number; // ลำดับปัจจุบัน (real-time จาก Redis)
    }
  | { type: 'cancelled' }
  | { type: 'not_found' };

/**
 * Get Booking Status Use Case
 *
 * User ที่รออยู่ใน WAITING ใช้ endpoint นี้เช็คว่า:
 *  - ยังรืออยู่ไหม? อยู่ลำดับเท่าไหร่?
 *  - ได้รับการ promote แล้วหรือยัง?
 */
@Injectable()
export class GetBookingStatusUseCase implements IUseCase<
  GetBookingStatusInput,
  BookingStatusResult
> {
  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo: IBookingRepository,
    @Inject(WAITLIST_REPOSITORY)
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly redisService: RedisService,
  ) {}

  async execute(input: GetBookingStatusInput): Promise<BookingStatusResult> {
    const { userId, eventId } = input;

    // ── ตรวจ booking ก่อน ────────────────────────────────────────────────────
    const booking = await this.bookingRepo.findByUserAndEvent(userId, eventId);

    if (booking) {
      if (
        booking.status === BookingStatus.CONFIRMED ||
        booking.status === BookingStatus.PROMOTED
      ) {
        return {
          type:
            booking.status === BookingStatus.PROMOTED
              ? 'promoted'
              : 'confirmed',
          bookingId: booking.id,
          confirmedAt: booking.confirmedAt ?? new Date(),
        };
      }
      if (booking.status === BookingStatus.CANCELLED) {
        return { type: 'cancelled' };
      }
    }

    // ── ตรวจ waitlist ────────────────────────────────────────────────────────
    const waitlist = await this.waitlistRepo.findByUserAndEvent(
      userId,
      eventId,
    );

    if (!waitlist) return { type: 'not_found' };

    if (waitlist.status === WaitlistStatus.PROMOTED) {
      // Promoted แล้วแต่ booking record อาจยังไม่ sync — คืน promoted
      const promotedBooking = await this.bookingRepo.findByUserAndEvent(
        userId,
        eventId,
      );
      return {
        type: 'promoted',
        bookingId: promotedBooking?.id ?? '',
        confirmedAt: waitlist.promotedAt ?? new Date(),
      };
    }

    if (waitlist.status === WaitlistStatus.WAITING) {
      // ดึง current position จาก Redis (real-time)
      const currentPosition = await this.redisService.getWaitlistPosition(
        eventId,
        userId,
      );

      return {
        type: 'waitlisted',
        waitlistId: waitlist.id,
        position: waitlist.position, // ลำดับตอนเข้าคิว
        currentPosition: currentPosition + 1, // ลำดับปัจจุบัน (0-indexed → 1-indexed)
      };
    }

    throw new NotFoundException('Booking or waitlist record not found');
  }
}
