export const BOOKING_EVENTS = {
  CONFIRMED: 'booking.confirmed',
  CANCELLED: 'booking.cancelled',
  PROMOTED: 'booking.promoted',
  WAITLISTED: 'booking.waitlisted',
} as const;

export class BookingConfirmedEvent {
  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly eventId: string,
    public readonly eventName: string,
  ) {}
}

export class BookingCancelledEvent {
  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly eventId: string,
  ) {}
}

export class BookingPromotedEvent {
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
    public readonly eventName: string,
    public readonly bookingId: string,
  ) {}
}

export class BookingWaitlistedEvent {
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
    public readonly position: number,
  ) {}
}
