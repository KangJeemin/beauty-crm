import { ServiceCategoryItem, ServiceMenuItem, UserRole } from '@beauty-crm/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { CategoryInputDto, MenuCreateDto, MenuUpdateDto, OrderDto } from './dto/menu.dto';
import { MenuService } from './menu.service';

/** 시술 메뉴 · 가격표. 조회는 모두, 수정은 원장만 */
@Controller('menus')
export class MenuController {
  constructor(private readonly menus: MenuService) {}

  @Get()
  tree(@CurrentUser() u: ShopAuth): Promise<ServiceCategoryItem[]> {
    return this.menus.tree(u);
  }

  /** 메뉴가 하나도 없을 때 기본 메뉴 넣기 (이미 있으면 그대로) */
  @Roles(UserRole.OWNER)
  @HttpCode(200)
  @Post('seed-defaults')
  seed(@CurrentUser() u: ShopAuth): Promise<ServiceCategoryItem[]> {
    return this.menus.seedIfEmpty(u);
  }

  @Roles(UserRole.OWNER)
  @Post('categories')
  createCategory(@CurrentUser() u: ShopAuth, @Body() dto: CategoryInputDto): Promise<ServiceCategoryItem> {
    return this.menus.createCategory(u, dto);
  }

  @Roles(UserRole.OWNER)
  @Put('categories/order')
  async reorderCategories(@CurrentUser() u: ShopAuth, @Body() dto: OrderDto): Promise<{ ok: true }> {
    await this.menus.reorderCategories(u, dto.ids);
    return { ok: true };
  }

  @Roles(UserRole.OWNER)
  @Patch('categories/:id')
  async renameCategory(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: CategoryInputDto): Promise<{ ok: true }> {
    await this.menus.renameCategory(u, id, dto);
    return { ok: true };
  }

  @Roles(UserRole.OWNER)
  @Delete('categories/:id')
  async removeCategory(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.menus.removeCategory(u, id);
    return { ok: true };
  }

  @Roles(UserRole.OWNER)
  @Put('categories/:id/order')
  async reorderMenus(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderDto): Promise<{ ok: true }> {
    await this.menus.reorderMenus(u, id, dto.ids);
    return { ok: true };
  }

  @Roles(UserRole.OWNER)
  @Post('items')
  createMenu(@CurrentUser() u: ShopAuth, @Body() dto: MenuCreateDto): Promise<ServiceMenuItem> {
    return this.menus.createMenu(u, dto);
  }

  @Roles(UserRole.OWNER)
  @Patch('items/:id')
  updateMenu(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: MenuUpdateDto): Promise<ServiceMenuItem> {
    return this.menus.updateMenu(u, id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete('items/:id')
  async removeMenu(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.menus.removeMenu(u, id);
    return { ok: true };
  }
}
