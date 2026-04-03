import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WaitlistEntity,
  WaitlistStatus,
} from '../../domain/entities/waitlist.entity';
import { IWaitlistRepository } from '../../domain/repositories/waitlist.repository.interface';
import { BaseRepository } from '../../../../infrastructure/repositories/base.repository';

@Injectable()
export class WaitlistRepository
  extends BaseRepository<WaitlistEntity>
  implements IWaitlistRepository
{
  constructor(
    @InjectRepository(WaitlistEntity)
    private readonly waitlistRepo: Repository<WaitlistEntity>,
  ) {
    super(waitlistRepo);
  }

  async findByUserAndEvent(
    userId: string,
    eventId: string,
  ): Promise<WaitlistEntity | null> {
    return this.waitlistRepo.findOne({ where: { userId, eventId } });
  }

  async findActiveByEvent(eventId: string): Promise<WaitlistEntity[]> {
    return this.waitlistRepo.find({
      where: { eventId, status: WaitlistStatus.WAITING },
      order: { createdAt: 'ASC' },
    });
  }

  async updateStatus(
    id: string,
    status: WaitlistStatus,
    extra: Partial<WaitlistEntity> = {},
  ): Promise<WaitlistEntity> {
    await this.waitlistRepo.update(id, { status, ...extra });
    return this.findById(id) as Promise<WaitlistEntity>;
  }
}
