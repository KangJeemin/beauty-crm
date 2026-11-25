import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteController } from './invite.controller';
import { InviteRepository, InviteService } from './invite.service';
import { ShopInvite } from './shop-invite.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShopInvite])],
  controllers: [InviteController],
  providers: [InviteRepository, InviteService],
})
export class InviteModule {}
