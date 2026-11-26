import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenModule } from '../auth/token.module';
import { ShopModule } from '../shop/shop.module';
import { StaffModule } from '../staff/staff.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { AdminOpsService } from './admin-ops.service';
import { AdminController } from './admin.controller';
import { AdminService, AdminUserRepository } from './admin.service';
import { AdminUser } from './entities/admin-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser]), TokenModule, ShopModule, StaffModule, FeedbackModule],
  controllers: [AdminController],
  providers: [AdminUserRepository, AdminService, AdminOpsService],
  exports: [AdminService],
})
export class AdminModule {}
