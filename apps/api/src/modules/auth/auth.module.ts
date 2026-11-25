import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { ShopModule } from '../shop/shop.module';
import { StaffModule } from '../staff/staff.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenModule } from './token.module';

@Module({
  imports: [TokenModule, ShopModule, StaffModule, MenuModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
