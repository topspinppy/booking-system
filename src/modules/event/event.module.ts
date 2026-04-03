import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './domain/entities/event.entity';
import { EventRepository } from './infrastructure/repositories/event.repository';
import { EVENT_REPOSITORY } from './domain/repositories/event.repository.interface';
import { CreateEventUseCase } from './application/use-cases/create-event.use-case';
import { GetEventUseCase } from './application/use-cases/get-event.use-case';
import { EventController } from './presentation/event.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity])],
  providers: [
    { provide: EVENT_REPOSITORY, useClass: EventRepository },
    CreateEventUseCase,
    GetEventUseCase,
  ],
  controllers: [EventController],
  exports: [EVENT_REPOSITORY],
})
export class EventModule {}
