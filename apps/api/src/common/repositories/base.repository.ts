import { DelState } from '@beauty-crm/shared';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { BaseEntity, TenantBaseEntity } from '../entities/base.entity';

type Where<T> = FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined;

/**
 * delState 기반 소프트 삭제를 강제하는 저장소 래퍼.
 *
 *  - 모든 조회에 delState = 0 조건을 자동으로 붙인다.
 *  - 물리 삭제(delete/remove) 메서드는 노출하지 않는다.
 *  - 삭제는 softDeleteById() → delState = 1 로 UPDATE.
 *
 * 주의: relations 로 함께 불러오는 하위 엔티티에는 조건이 자동으로 붙지 않는다.
 *       하위 목록이 필요하면 해당 저장소에서 따로 조회하거나 where 에 delState 를 명시한다.
 */
export class BaseRepository<T extends BaseEntity> {
  constructor(protected readonly repo: Repository<T>) {}

  protected active(where: Where<T>): Where<T> {
    const cond = { delState: DelState.ACTIVE } as FindOptionsWhere<T>;
    if (!where) return cond;
    if (Array.isArray(where)) return where.map((w) => ({ ...w, ...cond }));
    return { ...where, ...cond };
  }

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repo.find({ ...options, where: this.active(options.where as Where<T>) });
  }

  findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repo.findAndCount({ ...options, where: this.active(options.where as Where<T>) });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({ ...options, where: this.active(options.where as Where<T>) });
  }

  findOneById(id: number): Promise<T | null> {
    return this.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    return this.repo.count({ ...options, where: this.active(options.where as Where<T>) });
  }

  /** 복잡한 조회용. delState = 0 조건이 이미 걸린 QueryBuilder 를 돌려준다. */
  qb(alias: string): SelectQueryBuilder<T> {
    return this.repo.createQueryBuilder(alias).where(`${alias}.delState = :__del`, { __del: DelState.ACTIVE });
  }

  create(data: DeepPartial<T>): T {
    return this.repo.create(data);
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save(entity);
  }

  /** 소프트 삭제. 이미 삭제된 행이면 false. */
  async softDeleteById(id: number): Promise<boolean> {
    const res = await this.repo.update(
      { id, delState: DelState.ACTIVE } as FindOptionsWhere<T>,
      { delState: DelState.DELETED } as any,
    );
    return (res.affected ?? 0) > 0;
  }

  /** 삭제 취소. UNIQUE(activeKey) 충돌 시 DB 에러(ER_DUP_ENTRY)가 난다. */
  async restoreById(id: number): Promise<boolean> {
    const res = await this.repo.update(
      { id, delState: DelState.DELETED } as FindOptionsWhere<T>,
      { delState: DelState.ACTIVE } as any,
    );
    return (res.affected ?? 0) > 0;
  }
}

/**
 * 매장 소속 테이블용. 모든 메서드가 shopId 를 첫 인자로 받아
 * 다른 매장 데이터에 접근할 수 없게 한다. (1단계에서 요청 컨텍스트의 shopId 를 넘긴다)
 */
export class TenantRepository<T extends TenantBaseEntity> extends BaseRepository<T> {
  private scoped(shopId: number, where: Where<T>): Where<T> {
    const cond = { shopId } as FindOptionsWhere<T>;
    if (!where) return cond;
    if (Array.isArray(where)) return where.map((w) => ({ ...w, ...cond }));
    return { ...where, ...cond };
  }

  findForShop(shopId: number, options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.find({ ...options, where: this.scoped(shopId, options.where as Where<T>) });
  }

  findOneForShop(shopId: number, id: number): Promise<T | null> {
    return this.findOne({ where: { id, shopId } as FindOptionsWhere<T> });
  }

  qbForShop(shopId: number, alias: string): SelectQueryBuilder<T> {
    return this.qb(alias).andWhere(`${alias}.shopId = :__shopId`, { __shopId: shopId });
  }

  async softDeleteForShop(shopId: number, id: number): Promise<boolean> {
    const res = await this.repo.update(
      { id, shopId, delState: DelState.ACTIVE } as FindOptionsWhere<T>,
      { delState: DelState.DELETED } as any,
    );
    return (res.affected ?? 0) > 0;
  }
}
