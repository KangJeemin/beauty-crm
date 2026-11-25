import { ShopStatus } from '@beauty-crm/shared';
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AdminAuth } from '../../common/auth/auth.types';
import { AdminOnly, CurrentAdmin, Public } from '../../common/auth/decorators';
import { AdminLoginDto } from '../auth/dto/auth.dto';
import { AdminService } from './admin.service';

class ListShopsQuery {
  @IsOptional()
  @IsIn(Object.values(ShopStatus))
  status?: ShopStatus;
}

class ApproveDto {
  @IsOptional()
  @IsBoolean()
  founder?: boolean;
}

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() dto: AdminLoginDto) {
    return this.admin.login(dto.loginId, dto.password);
  }

  @Get('shops')
  listShops(@Query() q: ListShopsQuery) {
    return this.admin.listShops(q.status);
  }

  /** 승인. body {"founder": true} 면 창립 테스터(평생 무료)로 표시 */
  @HttpCode(200)
  @Post('shops/:id/approve')
  approve(@CurrentAdmin() a: AdminAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: ApproveDto) {
    return this.admin.setShopStatus(a.adminId, id, ShopStatus.ACTIVE, { founder: dto.founder });
  }

  @HttpCode(200)
  @Post('shops/:id/suspend')
  suspend(@CurrentAdmin() a: AdminAuth, @Param('id', ParseIntPipe) id: number) {
    return this.admin.setShopStatus(a.adminId, id, ShopStatus.SUSPENDED);
  }

  @HttpCode(200)
  @Post('shops/:id/reset-owner-password')
  resetOwnerPassword(@Param('id', ParseIntPipe) id: number) {
    return this.admin.resetOwnerPassword(id);
  }
}
