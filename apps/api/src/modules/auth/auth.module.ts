import { Module } from '@nestjs/common';
import { ShopModule } from '../shop/shop.module';
import { StaffModule } from '../staff/staff.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenModule } from './token.module';

@Module({
  imports: [TokenModule, ShopModule, StaffModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
