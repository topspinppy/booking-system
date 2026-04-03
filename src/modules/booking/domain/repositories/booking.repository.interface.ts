import { DeepPartial } from 'typeorm';
import { BookingEntity, BookingStatus } from '../entities/booking.entity';

export interface IBookingRepository {
  findById(id: string): Promise<BookingEntity | null>;
  findByUserAndEvent(
    userId: string,
    eventId: string,
  ): Promise<BookingEntity | null>;
  findByUser(userId: string): Promise<BookingEntity[]>;
  findByEvent(eventId: string): Promise<BookingEntity[]>;
  create(data: DeepPartial<BookingEntity>): Promise<BookingEntity>;
  updateStatus(
    id: string,
    status: BookingStatus,
    extra?: Partial<BookingEntity>,
  ): Promise<BookingEntity>;
}

export const BOOKING_REPOSITORY = Symbol('IBookingRepository');
