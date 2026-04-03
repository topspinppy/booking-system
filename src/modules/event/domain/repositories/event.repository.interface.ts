import { DeepPartial } from 'typeorm';
import { EventEntity } from '../entities/event.entity';

export interface IEventRepository {
  findById(id: string): Promise<EventEntity | null>;
  findAll(): Promise<EventEntity[]>;
  create(data: DeepPartial<EventEntity>): Promise<EventEntity>;
  update(id: string, data: DeepPartial<EventEntity>): Promise<EventEntity>;
  decrementAvailableSeats(id: string): Promise<void>;
  incrementAvailableSeats(id: string): Promise<void>;
}

export const EVENT_REPOSITORY = Symbol('IEventRepository');
