import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../entities/base.entity';

/** 변경 이력 — 로그 테이블 (delState 없음, 수정·삭제하지 않음) */
@Entity('audit_log')
export class AuditLog {
  @PrimaryColumn({ type: 'bigint', unsigned: true, generated: 'increment', transformer: bigintTransformer })
  id: number;

  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  shopId: number | null;

  @Column({ type: 'varchar', length: 10 })
  actorType: 'SHOP' | 'ADMIN' | 'SYSTEM';

  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  actorId: number | null;

  @Column({ type: 'varchar', length: 20 })
  action: string;

  @Column({ type: 'varchar', length: 50 })
  targetTable: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  targetId: number | null;

  @Column({ type: 'json', nullable: true })
  beforeData: unknown;

  @Column({ type: 'json', nullable: true })
  afterData: unknown;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
