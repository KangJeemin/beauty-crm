import { CustomerDetail, CustomerListItem, Paged } from '@beauty-crm/shared';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { CustomerService } from './customer.service';
import { CustomerCreateDto, CustomerListQuery, CustomerUpdateDto, PhoneCheckQuery } from './dto/customer.dto';

/** 고객 — 원장·디자이너 모두 등록·수정 가능 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  list(@CurrentUser() u: ShopAuth, @Query() q: CustomerListQuery): Promise<Paged<CustomerListItem>> {
    return this.customers.list(u, q);
  }

  /** 등록 전 중복 확인: { existing: 고객 | null } */
  @Get('check-phone')
  async checkPhone(@CurrentUser() u: ShopAuth, @Query() q: PhoneCheckQuery): Promise<{ existing: CustomerListItem | null }> {
    return { existing: await this.customers.findByPhone(u, q.phone, q.excludeId) };
  }

  @Get(':id')
  get(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<CustomerDetail> {
    return this.customers.get(u, id);
  }

  @Post()
  create(@CurrentUser() u: ShopAuth, @Body() dto: CustomerCreateDto): Promise<CustomerDetail> {
    return this.customers.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: CustomerUpdateDto): Promise<CustomerDetail> {
    return this.customers.update(u, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.customers.remove(u, id);
    return { ok: true };
  }
}
