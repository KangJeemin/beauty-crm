import { ServiceCategoryItem, ServiceMenuItem } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { DEFAULT_MENUS } from './default-menus';
import { CategoryInputDto, MenuCreateDto, MenuUpdateDto } from './dto/menu.dto';
import { ServiceCategory, ServiceMenu } from './entities/menu.entity';

@Injectable()
export class CategoryRepository extends TenantRepository<ServiceCategory> {
  constructor(@InjectRepository(ServiceCategory) repo: Repository<ServiceCategory>) {
    super(repo);
  }
}

@Injectable()
export class MenuRepository extends TenantRepository<ServiceMenu> {
  constructor(@InjectRepository(ServiceMenu) repo: Repository<ServiceMenu>) {
    super(repo);
  }
}

@Injectable()
export class MenuService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly menus: MenuRepository,
    private readonly ds: DataSource,
  ) {}

  /** 분류별 메뉴 전체 (판매 중지 포함, 화면에서 구분) */
  async tree(auth: ShopAuth): Promise<ServiceCategoryItem[]> {
    const [cats, items] = await Promise.all([
      this.categories.findForShop(auth.shopId, { order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.menus.findForShop(auth.shopId, { order: { sortOrder: 'ASC', id: 'ASC' } }),
    ]);
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      menus: items.filter((m) => m.categoryId === c.id).map(toMenuItem),
    }));
  }

  /** 가입 시 또는 메뉴가 하나도 없을 때 기본 메뉴 넣기 */
  async seedDefaults(em: EntityManager, shopId: number): Promise<void> {
    const catRepo = em.getRepository(ServiceCategory);
    const menuRepo = em.getRepository(ServiceMenu);
    for (const [ci, group] of DEFAULT_MENUS.entries()) {
      const cat = await catRepo.save(catRepo.create({ shopId, name: group.category, sortOrder: ci }));
      await menuRepo.insert(
        group.menus.map(([name, basePrice, durationMin, aliases], mi) => ({
          shopId,
          categoryId: cat.id,
          name,
          basePrice,
          durationMin,
          aliases: aliases ?? null,
          sortOrder: mi,
        })),
      );
    }
  }

  async seedIfEmpty(auth: ShopAuth): Promise<ServiceCategoryItem[]> {
    if ((await this.categories.count({ where: { shopId: auth.shopId } })) === 0) {
      await this.ds.transaction((em) => this.seedDefaults(em, auth.shopId));
    }
    return this.tree(auth);
  }

  // ── 분류 ────────────────────────────────────────────

  async createCategory(auth: ShopAuth, dto: CategoryInputDto): Promise<ServiceCategoryItem> {
    const n = await this.categories.count({ where: { shopId: auth.shopId } });
    const c = await this.categories.save(this.categories.create({ shopId: auth.shopId, name: dto.name, sortOrder: n }));
    return { id: c.id, name: c.name, sortOrder: c.sortOrder, menus: [] };
  }

  async renameCategory(auth: ShopAuth, id: number, dto: CategoryInputDto): Promise<void> {
    const c = await this.mustCategory(auth.shopId, id);
    c.name = dto.name;
    await this.categories.save(c);
  }

  /** 분류 삭제 — 안의 메뉴도 함께 소프트 삭제 (과거 시술 기록은 메뉴명 스냅샷이라 영향 없음) */
  async removeCategory(auth: ShopAuth, id: number): Promise<void> {
    await this.mustCategory(auth.shopId, id);
    await this.ds.transaction(async (em) => {
      await em.getRepository(ServiceMenu).update({ categoryId: id, shopId: auth.shopId, delState: 0 }, { delState: 1 });
      await em.getRepository(ServiceCategory).update({ id, shopId: auth.shopId }, { delState: 1 });
    });
  }

  async reorderCategories(auth: ShopAuth, ids: number[]): Promise<void> {
    await this.reorder(this.categories, ServiceCategory, auth.shopId, ids);
  }

  // ── 메뉴 ────────────────────────────────────────────

  async createMenu(auth: ShopAuth, dto: MenuCreateDto): Promise<ServiceMenuItem> {
    await this.mustCategory(auth.shopId, dto.categoryId); // 다른 매장 분류 id 차단
    const n = await this.menus.count({ where: { shopId: auth.shopId, categoryId: dto.categoryId } });
    const m = await this.menus.save(
      this.menus.create({
        shopId: auth.shopId,
        categoryId: dto.categoryId,
        name: dto.name,
        basePrice: dto.basePrice,
        durationMin: dto.durationMin ?? null,
        aliases: dto.aliases ?? null,
        sortOrder: n,
      }),
    );
    return toMenuItem(m);
  }

  async updateMenu(auth: ShopAuth, id: number, dto: MenuUpdateDto): Promise<ServiceMenuItem> {
    const m = await this.menus.findOneForShop(auth.shopId, id);
    if (!m) throw Errors.notFound('시술 메뉴');
    if (dto.categoryId !== undefined && dto.categoryId !== m.categoryId) {
      await this.mustCategory(auth.shopId, dto.categoryId);
      m.categoryId = dto.categoryId;
      m.sortOrder = await this.menus.count({ where: { shopId: auth.shopId, categoryId: dto.categoryId } });
    }
    if (dto.name !== undefined) m.name = dto.name;
    if (dto.basePrice !== undefined) m.basePrice = dto.basePrice;
    if (dto.durationMin !== undefined) m.durationMin = dto.durationMin;
    if (dto.aliases !== undefined) m.aliases = dto.aliases;
    if (dto.isActive !== undefined) m.isActive = dto.isActive ? 1 : 0;
    return toMenuItem(await this.menus.save(m));
  }

  async removeMenu(auth: ShopAuth, id: number): Promise<void> {
    if (!(await this.menus.softDeleteForShop(auth.shopId, id))) throw Errors.notFound('시술 메뉴');
  }

  async reorderMenus(auth: ShopAuth, categoryId: number, ids: number[]): Promise<void> {
    await this.mustCategory(auth.shopId, categoryId);
    const n = await this.menus.count({ where: { shopId: auth.shopId, categoryId, id: In(ids) } });
    if (n !== new Set(ids).size) throw Errors.notFound('시술 메뉴');
    await this.reorder(this.menus, ServiceMenu, auth.shopId, ids);
  }

  // ── 내부 ────────────────────────────────────────────

  private async mustCategory(shopId: number, id: number): Promise<ServiceCategory> {
    const c = await this.categories.findOneForShop(shopId, id);
    if (!c) throw Errors.notFound('분류');
    return c;
  }

  /** 받은 id 순서대로 sortOrder 0,1,2... 저장. 남의 매장 id 가 섞이면 거부 */
  private async reorder<T extends ServiceCategory | ServiceMenu>(
    repo: TenantRepository<T>,
    entity: typeof ServiceCategory | typeof ServiceMenu,
    shopId: number,
    ids: number[],
  ) {
    const unique = [...new Set(ids)];
    const owned = await repo.count({ where: { shopId, id: In(unique) } as any });
    if (owned !== unique.length) throw Errors.notFound('항목');
    await this.ds.transaction(async (em) => {
      for (const [i, id] of unique.entries()) {
        await em.getRepository(entity).update({ id, shopId }, { sortOrder: i });
      }
    });
  }
}

function toMenuItem(m: ServiceMenu): ServiceMenuItem {
  return {
    id: m.id,
    categoryId: m.categoryId,
    name: m.name,
    basePrice: m.basePrice,
    durationMin: m.durationMin,
    aliases: m.aliases,
    isActive: m.isActive === 1,
    sortOrder: m.sortOrder,
  };
}
