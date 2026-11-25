import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/entities/base.entity';

const decimal = { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) };

/** 외부 AI API 사용량 — 로그 테이블 (delState 없음) */
@Entity('ai_usage_log')
export class AiUsageLog {
  @PrimaryColumn({ type: 'bigint', unsigned: true, generated: 'increment', transformer: bigintTransformer })
  id: number;

  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  shopId: number;

  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  voiceRecordId: number | null;

  @Column({ type: 'varchar', length: 10 })
  usageType: 'STT' | 'LLM';

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  model: string | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  inputUnits: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  outputUnits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimal })
  costKrw: number;

  @Column({ type: 'tinyint', default: 1 })
  isSuccess: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  latencyMs: number | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
