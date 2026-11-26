import { DailySettlement, MonthlySettlement, PaymentItem, PrepaidPassDetail, PrepaidPassItem, UserRole } from '@beauty-crm/shared';
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Matches } from 'class-validator';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ClosingDto, DateQuery, MonthQuery, PassAdjustDto, PassRefundDto, PaymentCreateDto, PrepaidPassCreateDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';
import { SettlementService } from './settlement.service';

class DateParam {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜 형식은 YYYY-MM-DD 입니다.' }) date: string;
}

@Controller()
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly settlement: SettlementService,
  ) {}

  // ── 결제 ──
  @Post('payments')
  create(@CurrentUser() u: ShopAuth, @Body() dto: PaymentCreateDto): Promise<PaymentItem> {
    return this.payments.create(u, dto);
  }

  @Get('payments/:id')
  get(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<PaymentItem> {
    return this.payments.get(u, id);
  }

  @HttpCode(200)
  @Post('payments/:id/cancel')
  cancel(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<PaymentItem> {
    return this.payments.cancel(u, id);
  }

  // ── 선불권 ──
  @Post('prepaid-passes')
  sellPass(@CurrentUser() u: ShopAuth, @Body() dto: PrepaidPassCreateDto): Promise<PrepaidPassDetail> {
    return this.payments.sellPass(u, dto);
  }

  @Get('customers/:id/prepaid-passes')
  listPasses(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<PrepaidPassItem[]> {
    return this.payments.listPasses(u, id);
  }

  @Get('prepaid-passes/:id')
  passDetail(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<PrepaidPassDetail> {
    return this.payments.passDetail(u, id);
  }

  @Roles(UserRole.OWNER)
  @HttpCode(200)
  @Post('prepaid-passes/:id/adjust')
  adjust(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: PassAdjustDto): Promise<PrepaidPassDetail> {
    return this.payments.adjustPass(u, id, dto);
  }

  @Roles(UserRole.OWNER)
  @HttpCode(200)
  @Post('prepaid-passes/:id/refund')
  refund(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: PassRefundDto): Promise<PrepaidPassDetail> {
    return this.payments.refundPass(u, id, dto);
  }

  // ── 정산 (원장님 전용) ──
  @Roles(UserRole.OWNER)
  @Get('settlements/daily')
  daily(@CurrentUser() u: ShopAuth, @Query() q: DateQuery): Promise<DailySettlement> {
    return this.settlement.daily(u, q.date);
  }

  @Roles(UserRole.OWNER)
  @Get('settlements/monthly')
  monthly(@CurrentUser() u: ShopAuth, @Query() q: MonthQuery): Promise<MonthlySettlement> {
    return this.settlement.monthly(u, q.month);
  }

  @Roles(UserRole.OWNER)
  @Put('settlements/daily/:date/closing')
  close(@CurrentUser() u: ShopAuth, @Param() p: DateParam, @Body() dto: ClosingDto): Promise<DailySettlement> {
    return this.settlement.close(u, p.date, dto);
  }
}
