import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../domain/entities/base.entity';
import { EventEntity } from '../../../event/domain/entities/event.entity';

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  WAITLISTED = 'waitlisted',
  PROMOTED = 'promoted', // was waitlisted → got a seat
}

/**
 * Unique index on (userId, eventId) is the DB-level safety net
 * against double-booking (in addition to the Redis distributed lock).
 */
@Entity('bookings')
@Index(['userId', 'eventId'], {
  unique: true,
  where: `"status" NOT IN ('cancelled')`,
})
export class BookingEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status: BookingStatus;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date;
}
