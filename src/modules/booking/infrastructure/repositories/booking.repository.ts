import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingEntity,
  BookingStatus,
} from '../../domain/entities/booking.entity';
import { IBookingRepository } from '../../domain/repositories/booking.repository.interface';
import { BaseRepository } from '../../../../infrastructure/repositories/base.repository';

@Injectable()
export class BookingRepository
  extends BaseRepository<BookingEntity>
  implements IBookingRepository
{
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
  ) {
    super(bookingRepo);
  }

  async findByUserAndEvent(
    userId: string,
    eventId: string,
  ): Promise<BookingEntity | null> {
    return this.bookingRepo.findOne({ where: { userId, eventId } });
  }

  async findByUser(userId: string): Promise<BookingEntity[]> {
    return this.bookingRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByEvent(eventId: string): Promise<BookingEntity[]> {
    return this.bookingRepo.find({
      where: { eventId },
      order: { createdAt: 'ASC' },
    });
  }

  async updateStatus(
    id: string,
    status: BookingStatus,
    extra: Partial<BookingEntity> = {},
  ): Promise<BookingEntity> {
    await this.bookingRepo.update(id, { status, ...extra });
    return this.findById(id) as Promise<BookingEntity>;
  }
}
