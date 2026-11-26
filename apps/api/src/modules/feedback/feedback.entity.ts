import { FeedbackCategory, FeedbackStatus } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../common/entities/base.entity';

@Entity('feedback')
export class Feedback extends TenantBaseEntity {
  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  userId: number;

  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  repliedBy: number | null;

  @Column({ type: 'varchar', length: 20, default: 'ETC' })
  category: FeedbackCategory;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pageUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: FeedbackStatus;

  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ type: 'datetime', nullable: true })
  repliedAt: Date | null;
}
