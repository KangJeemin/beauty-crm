import { JobStatus } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../common/entities/base.entity';

const decimal = { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) };
const bigint = { type: 'bigint' as const, unsigned: true, transformer: bigintTransformer };

/** 녹음(또는 글 입력) 1건 → STT → LLM 정리 → 검토 → treatment 저장 */
@Entity('voice_record')
export class VoiceRecord extends TenantBaseEntity {
  @Column(bigint) userId: number;
  @Column({ ...bigint, nullable: true }) customerId: number | null;
  @Column({ ...bigint, nullable: true }) treatmentId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true }) storageKey: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) mimeType: string | null;
  @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true, transformer: decimal }) durationSec: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) fileSize: number | null;

  /** CLOVA / MOCK / NONE(글 입력) */
  @Column({ type: 'varchar', length: 20, default: 'CLOVA' }) sttProvider: string;
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) sttStatus: JobStatus;
  @Column({ type: 'varchar', length: 100, nullable: true }) sttRequestId: string | null;
  @Column({ type: 'text', nullable: true }) transcript: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) sttErrorMsg: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true }) aiProvider: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) aiModel: string | null;
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) aiStatus: JobStatus;
  @Column({ type: 'json', nullable: true }) aiResult: any;
  @Column({ type: 'varchar', length: 500, nullable: true }) aiErrorMsg: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) promptVersion: string | null;

  @Column({ type: 'datetime', nullable: true }) fileExpireAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) fileDeletedAt: Date | null;
}
