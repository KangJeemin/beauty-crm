import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from './entities/shop.entity';
import { ShopRepository } from './shop.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Shop])],
  providers: [ShopRepository],
  exports: [ShopRepository],
})
export class ShopModule {}
