import { ShopInfo } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { UpdateShopDto } from './dto/shop.dto';
import { Shop } from './entities/shop.entity';
import { ShopRepository } from './shop.repository';

@Injectable()
export class ShopService {
  constructor(private readonly shops: ShopRepository) {}

  async getMine(auth: ShopAuth): Promise<ShopInfo> {
    return toInfo(await this.mustGet(auth.shopId));
  }

  async updateMine(auth: ShopAuth, dto: UpdateShopDto): Promise<ShopInfo> {
    const shop = await this.mustGet(auth.shopId);
    Object.assign(shop, dto);
    return toInfo(await this.shops.save(shop));
  }

  private async mustGet(id: number): Promise<Shop> {
    const s = await this.shops.findOneById(id);
    if (!s) throw Errors.notFound('매장');
    return s;
  }
}

export function toInfo(s: Shop): ShopInfo {
  return {
    id: s.id,
    name: s.name,
    ownerName: s.ownerName,
    phone: s.phone,
    address: s.address,
    status: s.status,
    planType: s.planType,
    businessHours: s.businessHours,
  };
}
