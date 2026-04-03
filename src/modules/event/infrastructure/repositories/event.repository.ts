import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../../domain/entities/event.entity';
import { IEventRepository } from '../../domain/repositories/event.repository.interface';
import { BaseRepository } from '../../../../infrastructure/repositories/base.repository';

@Injectable()
export class EventRepository
  extends BaseRepository<EventEntity>
  implements IEventRepository
{
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
  ) {
    super(eventRepo);
  }

  async decrementAvailableSeats(id: string): Promise<void> {
    await this.eventRepo
      .createQueryBuilder()
      .update(EventEntity)
      .set({ availableSeats: () => '"availableSeats" - 1' })
      .where('id = :id AND "availableSeats" > 0', { id })
      .execute();
  }

  async incrementAvailableSeats(id: string): Promise<void> {
    await this.eventRepo
      .createQueryBuilder()
      .update(EventEntity)
      .set({ availableSeats: () => '"availableSeats" + 1' })
      .where('id = :id', { id })
      .execute();
  }
}
