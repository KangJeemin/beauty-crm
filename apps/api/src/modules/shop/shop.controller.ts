import { ShopInfo, UserRole } from '@beauty-crm/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { UpdateShopDto } from './dto/shop.dto';
import { ShopService } from './shop.service';

/** 로그인한 사용자의 "내 매장" — 다른 매장 id 를 받는 경로 자체가 없다 */
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  get(@CurrentUser() user: ShopAuth): Promise<ShopInfo> {
    return this.shop.getMine(user);
  }

  @Roles(UserRole.OWNER)
  @Patch()
  update(@CurrentUser() user: ShopAuth, @Body() dto: UpdateShopDto): Promise<ShopInfo> {
    return this.shop.updateMine(user, dto);
  }
}
