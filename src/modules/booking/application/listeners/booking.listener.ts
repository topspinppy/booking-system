import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BOOKING_EVENTS,
  BookingPromotedEvent,
  BookingConfirmedEvent,
  BookingCancelledEvent,
  BookingWaitlistedEvent,
} from '../../domain/events/booking.events';

/**
 * Booking Event Listener
 *
 * รับ domain events จาก EventEmitter แล้วทำงานต่อ
 * เช่น ส่ง email, push notification, webhook, logging ฯลฯ
 *
 */
@Injectable()
export class BookingListener {
  private readonly logger = new Logger(BookingListener.name);

  /**
   * ยิงเมื่อมีคน CONFIRMED booking
   * → ส่ง email ยืนยันการจอง
   */
  @OnEvent(BOOKING_EVENTS.CONFIRMED)
  handleConfirmed(event: BookingConfirmedEvent): void {
    this.logger.log(
      `[EVENT] booking.confirmed → user=${event.userId} event=${event.eventId}`,
    );
    // TODO: mailService.sendBookingConfirmation(event.userId, event.eventName)
    // TODO: pushService.sendNotification(event.userId, 'จองสำเร็จ!')
  }

  /**
   * ยิงเมื่อมีคน CANCELLED booking
   * → ส่ง email แจ้งยกเลิก
   */
  @OnEvent(BOOKING_EVENTS.CANCELLED)
  handleCancelled(event: BookingCancelledEvent): void {
    this.logger.log(
      `[EVENT] booking.cancelled → user=${event.userId} booking=${event.bookingId}`,
    );
    // TODO: mailService.sendCancellationEmail(event.userId)
  }

  /**
   * ยิงเมื่อ user ใน WAITING list ได้รับการ PROMOTE
   * → แจ้ง user ว่าได้ที่นั่งแล้ว (สำคัญมาก!)
   *
   * user ที่รออยู่จะไม่รู้ว่าตัวเองได้ที่นั่งถ้าไม่มี notification ตรงนี้
   */
  @OnEvent(BOOKING_EVENTS.PROMOTED)
  handlePromoted(event: BookingPromotedEvent): void {
    this.logger.log(
      `[EVENT] booking.promoted → user=${event.userId} event="${event.eventName}" booking=${event.bookingId}`,
    );
    // TODO: mailService.sendPromotionEmail(event.userId, event.eventName)
    // TODO: pushService.sendNotification(event.userId,
    //   `🎉 คุณได้ที่นั่งใน "${event.eventName}" แล้ว!`)
  }

  /**
   * ยิงเมื่อ user เข้า WAITLIST
   * → แจ้ง user ว่าอยู่ที่ตำแหน่งเท่าไหร่ในคิว
   */
  @OnEvent(BOOKING_EVENTS.WAITLISTED)
  handleWaitlisted(event: BookingWaitlistedEvent): void {
    this.logger.log(
      `[EVENT] booking.waitlisted → user=${event.userId} position=${event.position}`,
    );
    // TODO: mailService.sendWaitlistEmail(event.userId, event.position)
    // TODO: pushService.sendNotification(event.userId,
    //   `คุณอยู่ลำดับที่ ${event.position} ในคิวสำรอง`)
  }
}
