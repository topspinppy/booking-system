import { DeepPartial } from 'typeorm';
import { WaitlistEntity, WaitlistStatus } from '../entities/waitlist.entity';

export interface IWaitlistRepository {
  findById(id: string): Promise<WaitlistEntity | null>;
  findByUserAndEvent(
    userId: string,
    eventId: string,
  ): Promise<WaitlistEntity | null>;
  findActiveByEvent(eventId: string): Promise<WaitlistEntity[]>;
  create(data: DeepPartial<WaitlistEntity>): Promise<WaitlistEntity>;
  updateStatus(
    id: string,
    status: WaitlistStatus,
    extra?: Partial<WaitlistEntity>,
  ): Promise<WaitlistEntity>;
}

export const WAITLIST_REPOSITORY = Symbol('IWaitlistRepository');
