import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenModule } from '../auth/token.module';
import { ShopUser } from './entities/shop-user.entity';
import { ShopUserRepository } from './shop-user.repository';
import { MeController, StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([ShopUser]), TokenModule],
  controllers: [MeController, StaffController],
  providers: [ShopUserRepository, StaffService],
  exports: [ShopUserRepository],
})
export class StaffModule {}
