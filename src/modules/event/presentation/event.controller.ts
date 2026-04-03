import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { CreateEventUseCase } from '../application/use-cases/create-event.use-case';
import { GetEventUseCase } from '../application/use-cases/get-event.use-case';
import { CreateEventDto } from '../application/dto/create-event.dto';

@Controller('events')
export class EventController {
  constructor(
    private readonly createEvent: CreateEventUseCase,
    private readonly getEvent: GetEventUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ValidationPipe) dto: CreateEventDto) {
    return this.createEvent.execute(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.getEvent.execute(id);
  }
}
