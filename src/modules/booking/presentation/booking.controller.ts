import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CreateBookingUseCase } from '../application/use-cases/create-booking.use-case';
import { CancelBookingUseCase } from '../application/use-cases/cancel-booking.use-case';
import { GetBookingStatusUseCase } from '../application/use-cases/get-booking-status.use-case';
import { CreateBookingDto } from '../application/dto/create-booking.dto';
import { CancelBookingDto } from '../application/dto/cancel-booking.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly getStatus: GetBookingStatusUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'จองที่นั่ง Event' })
  @ApiResponse({ status: 201, description: 'confirmed หรือ waitlisted' })
  @ApiResponse({ status: 400, description: 'Event ไม่ได้เปิดรับจอง' })
  @ApiResponse({ status: 404, description: 'Event ไม่พบ' })
  @ApiResponse({ status: 409, description: 'จองซ้ำ หรืออยู่ใน Waitlist แล้ว' })
  book(@Body(ValidationPipe) dto: CreateBookingDto) {
    return this.createBooking.execute(dto);
  }

  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ยกเลิกการจอง (auto-promote waitlist)' })
  @ApiResponse({ status: 200, description: 'ยกเลิกสำเร็จ' })
  @ApiResponse({ status: 403, description: 'ไม่ใช่ booking ของ user นี้' })
  @ApiResponse({ status: 404, description: 'Booking ไม่พบ' })
  cancel(@Body(ValidationPipe) dto: CancelBookingDto) {
    return this.cancelBooking.execute(dto);
  }

  @Get('status/:userId/:eventId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'เช็คสถานะการจอง / ลำดับ waitlist' })
  @ApiParam({ name: 'userId', description: 'UUID ของ user' })
  @ApiParam({ name: 'eventId', description: 'UUID ของ event' })
  @ApiResponse({
    status: 200,
    description:
      'confirmed | promoted | waitlisted (+ currentPosition) | cancelled | not_found',
  })
  status(@Param('userId') userId: string, @Param('eventId') eventId: string) {
    return this.getStatus.execute({ userId, eventId });
  }
}
