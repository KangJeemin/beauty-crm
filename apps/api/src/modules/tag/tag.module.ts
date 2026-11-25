import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagController } from './tag.controller';
import { CustomerTag, Tag } from './tag.entity';
import { TagRepository, TagService } from './tag.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, CustomerTag])],
  controllers: [TagController],
  providers: [TagRepository, TagService],
  exports: [TagService],
})
export class TagModule {}
