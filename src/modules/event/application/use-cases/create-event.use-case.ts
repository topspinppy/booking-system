import { Injectable, Inject } from '@nestjs/common';
import type { IUseCase } from '../../../../domain/use-cases/base.use-case';
import { EventEntity, EventStatus } from '../../domain/entities/event.entity';
import type { IEventRepository } from '../../domain/repositories/event.repository.interface';
import { EVENT_REPOSITORY } from '../../domain/repositories/event.repository.interface';
import { RedisService } from '../../../../infrastructure/redis/redis.service';
import { CreateEventDto } from '../dto/create-event.dto';

@Injectable()
export class CreateEventUseCase implements IUseCase<
  CreateEventDto,
  EventEntity
> {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly eventRepo: IEventRepository,
    private readonly redisService: RedisService,
  ) {}

  async execute(input: CreateEventDto): Promise<EventEntity> {
    const event = await this.eventRepo.create({
      name: input.name,
      description: input.description,
      location: input.location,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      capacity: input.capacity,
      availableSeats: input.capacity,
      status: EventStatus.PUBLISHED,
    });

    // Seed the Redis seat counter — this is the fast path for booking checks
    await this.redisService.initSeats(event.id, event.capacity);

    return event;
  }
}
