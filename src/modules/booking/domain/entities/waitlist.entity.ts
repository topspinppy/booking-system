import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../domain/entities/base.entity';
import { EventEntity } from '../../../event/domain/entities/event.entity';

export enum WaitlistStatus {
  WAITING = 'waiting',
  PROMOTED = 'promoted',
  EXPIRED = 'expired',
}

@Entity('waitlists')
@Index(['userId', 'eventId'], { unique: true, where: `"status" = 'waiting'` })
export class WaitlistEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    default: WaitlistStatus.WAITING,
  })
  status: WaitlistStatus;

  /** Position in the waitlist at the time of joining (1-indexed). */
  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'timestamp', nullable: true })
  promotedAt?: Date;
}
