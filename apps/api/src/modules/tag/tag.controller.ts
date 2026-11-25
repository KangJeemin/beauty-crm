import { TagItem } from '@beauty-crm/shared';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { TagInputDto, TagService, TagUpdateDto } from './tag.service';

/** 태그는 원장·디자이너 모두 관리 (고객 등록하면서 바로 만들 수 있게) */
@Controller('tags')
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Get()
  list(@CurrentUser() u: ShopAuth): Promise<TagItem[]> {
    return this.tags.list(u);
  }

  @Post()
  create(@CurrentUser() u: ShopAuth, @Body() dto: TagInputDto): Promise<TagItem> {
    return this.tags.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Body() dto: TagUpdateDto): Promise<TagItem> {
    return this.tags.update(u, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.tags.remove(u, id);
    return { ok: true };
  }
}
