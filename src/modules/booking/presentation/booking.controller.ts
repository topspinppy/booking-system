import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { CreateBookingUseCase } from '../application/use-cases/create-booking.use-case';
import { CancelBookingUseCase } from '../application/use-cases/cancel-booking.use-case';
import { CreateBookingDto } from '../application/dto/create-booking.dto';
import { CancelBookingDto } from '../application/dto/cancel-booking.dto';

@Controller('bookings')
export class BookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
  ) {}

  /**
   * POST /bookings
   * Book an event. Returns { status: 'confirmed' } or { status: 'waitlisted' }.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  book(@Body(ValidationPipe) dto: CreateBookingDto) {
    return this.createBooking.execute(dto);
  }

  /**
   * DELETE /bookings/cancel
   * Cancel a confirmed booking. Automatically promotes next person on waitlist.
   */
  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Body(ValidationPipe) dto: CancelBookingDto) {
    return this.cancelBooking.execute(dto);
  }
}
