import { StaffItem, UserRole } from '@beauty-crm/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { UpdateMySettingsDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

@Controller('me')
export class MeController {
  constructor(private readonly staff: StaffService) {}

  /** 내 이름·글자 크기 변경 */
  @Patch('settings')
  updateSettings(@CurrentUser() user: ShopAuth, @Body() dto: UpdateMySettingsDto): Promise<StaffItem> {
    return this.staff.updateMySettings(user, dto);
  }
}

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@CurrentUser() user: ShopAuth): Promise<StaffItem[]> {
    return this.staff.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<StaffItem> {
    return this.staff.get(user, id);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(@CurrentUser() user: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto): Promise<StaffItem> {
    return this.staff.update(user, id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  async remove(@CurrentUser() user: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.staff.remove(user, id);
    return { ok: true };
  }

  @Roles(UserRole.OWNER)
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ tempPassword: string }> {
    return this.staff.resetPassword(user, id);
  }
}
