import { DelState } from '@beauty-crm/shared';
import {
  Column,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';

/**
 * BIGINT 는 드라이버에서 문자열로 넘어오므로 number 로 변환한다.
 * (AUTO_INCREMENT 값이 2^53 을 넘을 일은 없다고 보고 number 사용)
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
};

/**
 * 모든 업무 테이블의 공통 컬럼.
 *  - id        : PK
 *  - createdAt / updatedAt
 *  - delState  : 0 정상 / 1 삭제 (소프트 삭제)
 *
 * activeKey(생성 컬럼)는 DB가 계산하므로 엔티티에 매핑하지 않는다.
 * 로그 테이블(refresh_token, ai_usage_log, audit_log)은 이 클래스를 상속하지 않는다.
 *
 * 컬럼 순서 규칙(PK → FK → UK → 일반 → 공통)은 DDL/마이그레이션에서 지킨다.
 * 엔티티의 프로퍼티 순서는 DB 컬럼 순서에 영향을 주지 않는다(synchronize=false).
 */
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'bigint', unsigned: true, generated: 'increment', transformer: bigintTransformer })
  id: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @Column({ type: 'tinyint', default: DelState.ACTIVE })
  delState: DelState;
}

/** 매장(테넌트) 소속 테이블 — shopId 를 반드시 가진다. */
export abstract class TenantBaseEntity extends BaseEntity {
  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  shopId: number;
}
