import { TagItem, TAG_COLORS } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Length } from 'class-validator';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { AppException, Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { CustomerTag, Tag } from './tag.entity';
import { ErrorCode } from '@beauty-crm/shared';
import { HttpStatus } from '@nestjs/common';

export class TagInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 30, { message: '태그 이름은 1~30자로 입력해 주세요.' })
  name: string;

  @IsOptional()
  @IsIn([...TAG_COLORS, null])
  color?: string | null;
}

export class TagUpdateDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 30, { message: '태그 이름은 1~30자로 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @IsIn([...TAG_COLORS, null])
  color?: string | null;
}

@Injectable()
export class TagRepository extends TenantRepository<Tag> {
  constructor(@InjectRepository(Tag) repo: Repository<Tag>) {
    super(repo);
  }
}

@Injectable()
export class TagService {
  constructor(
    private readonly tags: TagRepository,
    private readonly ds: DataSource,
  ) {}

  async list(auth: ShopAuth): Promise<TagItem[]> {
    const rows = await this.tags
      .qbForShop(auth.shopId, 't')
      .leftJoin('customer_tag', 'ct', 'ct.tagId = t.id AND ct.delState = 0')
      .leftJoin('customer', 'c', 'c.id = ct.customerId AND c.delState = 0')
      .select(['t.id AS id', 't.name AS name', 't.color AS color', 'COUNT(c.id) AS customerCount'])
      .groupBy('t.id')
      .orderBy('t.sortOrder', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getRawMany();
    return rows.map((r) => ({ id: Number(r.id), name: r.name, color: r.color, customerCount: Number(r.customerCount) }));
  }

  async create(auth: ShopAuth, dto: TagInputDto): Promise<TagItem> {
    await this.assertNameFree(auth.shopId, dto.name);
    const count = await this.tags.count({ where: { shopId: auth.shopId } });
    const t = await this.tags.save(
      this.tags.create({
        shopId: auth.shopId,
        name: dto.name,
        color: dto.color ?? TAG_COLORS[count % TAG_COLORS.length],
        sortOrder: count,
      }),
    );
    return { id: t.id, name: t.name, color: t.color };
  }

  async update(auth: ShopAuth, id: number, dto: TagUpdateDto): Promise<TagItem> {
    const t = await this.tags.findOneForShop(auth.shopId, id);
    if (!t) throw Errors.notFound('태그');
    if (dto.name && dto.name !== t.name) await this.assertNameFree(auth.shopId, dto.name);
    Object.assign(t, dto);
    await this.tags.save(t);
    return { id: t.id, name: t.name, color: t.color };
  }

  /** 태그 삭제 — 고객에게 붙은 연결도 함께 소프트 삭제 */
  async remove(auth: ShopAuth, id: number): Promise<void> {
    await this.ds.transaction(async (em) => {
      const res = await em.getRepository(Tag).update({ id, shopId: auth.shopId, delState: 0 }, { delState: 1 });
      if (!res.affected) throw Errors.notFound('태그');
      await em.getRepository(CustomerTag).update({ tagId: id, shopId: auth.shopId, delState: 0 }, { delState: 1 });
    });
  }

  /** 고객의 태그를 tagIds 로 맞춘다 (추가/제거). 다른 매장 태그 id 가 섞이면 거부 */
  async setCustomerTags(em: EntityManager, shopId: number, customerId: number, tagIds: number[]): Promise<void> {
    const wanted = [...new Set(tagIds)];
    if (wanted.length) {
      const owned = await em.getRepository(Tag).count({ where: { id: In(wanted), shopId, delState: 0 } });
      if (owned !== wanted.length) throw Errors.notFound('태그');
    }
    const repo = em.getRepository(CustomerTag);
    const current = await repo.find({ where: { customerId, shopId, delState: 0 } });
    const currentIds = new Set(current.map((c) => c.tagId));
    const toRemove = current.filter((c) => !wanted.includes(c.tagId)).map((c) => c.id);
    const toAdd = wanted.filter((id) => !currentIds.has(id));
    if (toRemove.length) await repo.update({ id: In(toRemove) }, { delState: 1 });
    if (toAdd.length) await repo.insert(toAdd.map((tagId) => ({ shopId, customerId, tagId })));
  }

  /** 여러 고객의 태그를 한 번에 조회 (목록 화면용) */
  async tagsOf(shopId: number, customerIds: number[]): Promise<Map<number, { id: number; name: string; color: string | null }[]>> {
    const map = new Map<number, { id: number; name: string; color: string | null }[]>();
    if (!customerIds.length) return map;
    const rows = await this.ds
      .createQueryBuilder()
      .select(['ct.customerId AS customerId', 't.id AS id', 't.name AS name', 't.color AS color'])
      .from(CustomerTag, 'ct')
      .innerJoin(Tag, 't', 't.id = ct.tagId AND t.delState = 0')
      .where('ct.shopId = :shopId AND ct.delState = 0 AND ct.customerId IN (:...ids)', { shopId, ids: customerIds })
      .orderBy('t.sortOrder', 'ASC')
      .getRawMany();
    for (const r of rows) {
      const cid = Number(r.customerId);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push({ id: Number(r.id), name: r.name, color: r.color });
    }
    return map;
  }

  private async assertNameFree(shopId: number, name: string) {
    if (await this.tags.count({ where: { shopId, name } })) {
      throw new AppException(ErrorCode.DUPLICATE, '같은 이름의 태그가 이미 있습니다.', HttpStatus.CONFLICT);
    }
  }
}
