import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BOOKING_EVENTS,
  BookingPromotedEvent,
  BookingConfirmedEvent,
  BookingCancelledEvent,
  BookingWaitlistedEvent,
} from '../../domain/events/booking.events';

@Injectable()
export class BookingListener {
  private readonly logger = new Logger(BookingListener.name);

  @OnEvent(BOOKING_EVENTS.CONFIRMED)
  handleConfirmed(event: BookingConfirmedEvent): void {
    this.logger.log(
      `[EVENT] booking.confirmed → user=${event.userId} event=${event.eventId}`,
    );
  }

  @OnEvent(BOOKING_EVENTS.CANCELLED)
  handleCancelled(event: BookingCancelledEvent): void {
    this.logger.log(
      `[EVENT] booking.cancelled → user=${event.userId} booking=${event.bookingId}`,
    );
  }

  @OnEvent(BOOKING_EVENTS.PROMOTED)
  handlePromoted(event: BookingPromotedEvent): void {
    this.logger.log(
      `[EVENT] booking.promoted → user=${event.userId} event="${event.eventName}" booking=${event.bookingId}`,
    );
  }

  @OnEvent(BOOKING_EVENTS.WAITLISTED)
  handleWaitlisted(event: BookingWaitlistedEvent): void {
    this.logger.log(
      `[EVENT] booking.waitlisted → user=${event.userId} position=${event.position}`,
    );
  }
}
