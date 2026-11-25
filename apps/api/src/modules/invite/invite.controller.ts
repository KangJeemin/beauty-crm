import { InviteItem, UserRole } from '@beauty-crm/shared';
import { Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { InviteService } from './invite.service';

@Roles(UserRole.OWNER)
@Controller('invites')
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  @Get()
  list(@CurrentUser() user: ShopAuth): Promise<InviteItem[]> {
    return this.invites.listActive(user);
  }

  @Post()
  create(@CurrentUser() user: ShopAuth): Promise<InviteItem> {
    return this.invites.create(user);
  }

  @Delete(':id')
  async cancel(@CurrentUser() user: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.invites.cancel(user, id);
    return { ok: true };
  }
}
