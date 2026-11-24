import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Shop } from './entities/shop.entity';

@Injectable()
export class ShopRepository extends BaseRepository<Shop> {
  constructor(@InjectRepository(Shop) repo: Repository<Shop>) {
    super(repo);
  }
}
