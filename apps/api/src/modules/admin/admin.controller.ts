import { ShopStatus } from '@beauty-crm/shared';
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FeedbackListQuery, FeedbackReplyDto } from '../feedback/feedback.dto';
import { FeedbackService } from '../feedback/feedback.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminAuth } from '../../common/auth/auth.types';
import { AdminOnly, CurrentAdmin, Public } from '../../common/auth/decorators';
import { AdminLoginDto } from '../auth/dto/auth.dto';
import { AdminService } from './admin.service';

class ListShopsQuery {
  @IsOptional()
  @IsIn(Object.values(ShopStatus))
  status?: ShopStatus;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}

class ShopUpdateDto {
  @IsOptional()
  @IsBoolean()
  isFounder?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(102400)
  storageQuotaMb?: number;
}

class MonthQuery {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

class AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shopId?: number;
  @IsOptional() @IsString() @MaxLength(50) targetTable?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) targetId?: number;
  @IsOptional() @IsString() @MaxLength(20) action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) size?: number;
}

class ApproveDto {
  @IsOptional()
  @IsBoolean()
  founder?: boolean;
}

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ops: AdminOpsService,
    private readonly feedback: FeedbackService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() dto: AdminLoginDto) {
    return this.admin.login(dto.loginId, dto.password);
  }

  @Get('dashboard')
  dashboard() {
    return this.ops.dashboard();
  }

  @Get('shops')
  listShops(@Query() q: ListShopsQuery) {
    return this.ops.listShops({ status: q.status, q: q.q?.trim() || undefined });
  }

  @Get('shops/:id')
  shop(@Param('id', ParseIntPipe) id: number) {
    return this.ops.shopDetail(id);
  }

  @Patch('shops/:id')
  updateShop(@Param('id', ParseIntPipe) id: number, @Body() dto: ShopUpdateDto) {
    return this.ops.updateShop(id, dto);
  }

  @Get('ai-usage')
  aiUsage(@Query() q: MonthQuery) {
    return this.ops.aiUsage(q.month);
  }

  @Get('feedback')
  listFeedback(@Query() q: FeedbackListQuery) {
    return this.feedback.listAll(q.status);
  }

  @Patch('feedback/:id')
  replyFeedback(@CurrentAdmin() a: AdminAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: FeedbackReplyDto) {
    return this.feedback.reply(a.adminId, id, dto);
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQuery) {
    return this.ops.auditLogs(q);
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
