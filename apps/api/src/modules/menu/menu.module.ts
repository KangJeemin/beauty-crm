import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCategory, ServiceMenu } from './entities/menu.entity';
import { MenuController } from './menu.controller';
import { CategoryRepository, MenuRepository, MenuService } from './menu.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCategory, ServiceMenu])],
  controllers: [MenuController],
  providers: [CategoryRepository, MenuRepository, MenuService],
  exports: [MenuService],
})
export class MenuModule {}
