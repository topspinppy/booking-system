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
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CreateEventUseCase } from '../application/use-cases/create-event.use-case';
import { GetEventUseCase } from '../application/use-cases/get-event.use-case';
import { CreateEventDto } from '../application/dto/create-event.dto';

@ApiTags('Events')
@Controller('events')
export class EventController {
  constructor(
    private readonly createEvent: CreateEventUseCase,
    private readonly getEvent: GetEventUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'สร้าง Event พร้อม capacity' })
  @ApiResponse({
    status: 201,
    description: 'Event ถูกสร้างและ seed Redis seat counter',
  })
  create(@Body(ValidationPipe) dto: CreateEventDto) {
    return this.createEvent.execute(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดู Event + จำนวนที่นั่งคงเหลือ + ขนาด Waitlist' })
  @ApiParam({ name: 'id', description: 'UUID ของ event' })
  @ApiResponse({
    status: 200,
    description: '{ event, availableSeats, waitlistSize }',
  })
  @ApiResponse({ status: 404, description: 'Event ไม่พบ' })
  findOne(@Param('id') id: string) {
    return this.getEvent.execute(id);
  }
}
