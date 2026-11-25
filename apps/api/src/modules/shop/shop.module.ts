import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from './entities/shop.entity';
import { ShopController } from './shop.controller';
import { ShopRepository } from './shop.repository';
import { ShopService } from './shop.service';

@Module({
  imports: [TypeOrmModule.forFeature([Shop])],
  controllers: [ShopController],
  providers: [ShopRepository, ShopService],
  exports: [ShopRepository],
})
export class ShopModule {}
