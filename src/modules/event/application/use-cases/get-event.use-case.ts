import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IUseCase } from '../../../../domain/use-cases/base.use-case';
import { EventEntity } from '../../domain/entities/event.entity';
import type { IEventRepository } from '../../domain/repositories/event.repository.interface';
import { EVENT_REPOSITORY } from '../../domain/repositories/event.repository.interface';
import { RedisService } from '../../../../infrastructure/redis/redis.service';

export interface GetEventOutput {
  event: EventEntity;
  availableSeats: number;
  waitlistSize: number;
}

@Injectable()
export class GetEventUseCase implements IUseCase<string, GetEventOutput> {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
  ) {}

  async execute(eventId: string): Promise<GetEventOutput> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundException(`Event "${eventId}" not found`);

    const redisSeats = await this.redisService.getAvailableSeats(eventId);
    const availableSeats =
      redisSeats !== null ? Math.max(0, redisSeats) : event.availableSeats;
    const waitlistSize = await this.redisService.getWaitlistSize(eventId);

    return { event, availableSeats, waitlistSize };
  }
}
