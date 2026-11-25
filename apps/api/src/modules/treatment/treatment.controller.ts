import { TreatmentDetail, TreatmentListItem } from '@beauty-crm/shared';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { TreatmentListQuery, TreatmentSaveDto } from './dto/treatment.dto';
import { TreatmentService } from './treatment.service';

@Controller()
export class TreatmentController {
  constructor(private readonly treatments: TreatmentService) {}

  @Get('treatments/recent')
  recent(@CurrentUser() u: ShopAuth): Promise<TreatmentListItem[]> {
    return this.treatments.recent(u);
  }

  @Get('treatments/:id')
  get(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<TreatmentDetail> {
    return this.treatments.get(u, id);
  }

  @Post('treatments')
  create(@CurrentUser() u: ShopAuth, @Body() dto: TreatmentSaveDto): Promise<TreatmentDetail> {
    return this.treatments.create(u, dto);
  }

  @Put('treatments/:id')
  update(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: TreatmentSaveDto): Promise<TreatmentDetail> {
    return this.treatments.update(u, id, dto);
  }

  @Delete('treatments/:id')
  async remove(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.treatments.remove(u, id);
    return { ok: true };
  }

  @Get('customers/:id/treatments')
  forCustomer(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Query() q: TreatmentListQuery) {
    return this.treatments.listForCustomer(u, id, q.page, q.size);
  }
}
