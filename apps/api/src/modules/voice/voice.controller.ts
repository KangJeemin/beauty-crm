import { PendingVoiceItem, VoiceRecordStatus } from '@beauty-crm/shared';
import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Length } from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { VoiceService } from './voice.service';

class UploadBody {
  @IsOptional() @Type(() => Number) @IsInt() customerId?: number;
}

class TextBody {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 5000, { message: '시술 내용을 2자 이상 입력해 주세요.' })
  text: string;

  @IsOptional() @IsInt() customerId?: number;
}

@Controller('voice-records')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** multipart/form-data: audio(파일), customerId(선택) */
  @Post()
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() u: ShopAuth, @UploadedFile() file: Express.Multer.File, @Body() body: UploadBody): Promise<VoiceRecordStatus> {
    return this.voice.upload(u, file, body.customerId);
  }

  @Post('text')
  fromText(@CurrentUser() u: ShopAuth, @Body() body: TextBody): Promise<VoiceRecordStatus> {
    return this.voice.fromText(u, body.text, body.customerId);
  }

  @Get('pending')
  pending(@CurrentUser() u: ShopAuth): Promise<PendingVoiceItem[]> {
    return this.voice.pending(u);
  }

  /** 처리 상태 — 화면에서 1~2초마다 조회 */
  @Get(':id')
  status(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<VoiceRecordStatus> {
    return this.voice.status(u, id);
  }

  @HttpCode(200)
  @Post(':id/retry')
  retry(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<VoiceRecordStatus> {
    return this.voice.retry(u, id);
  }

  @Delete(':id')
  async discard(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.voice.discard(u, id);
    return { ok: true };
  }

  @Get(':id/audio')
  async audio(@CurrentUser() u: ShopAuth, @Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const a = await this.voice.audio(u, id);
    res.setHeader('Content-Type', a.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    if (a.length) res.setHeader('Content-Length', String(a.length));
    return new StreamableFile(a.stream);
  }
}
