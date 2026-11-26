import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { FeedbackCreateDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

/** 매장 사용자 → 운영자 의견 보내기 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() u: ShopAuth, @Body() dto: FeedbackCreateDto) {
    return this.feedback.create(u, dto);
  }

  @Get()
  mine(@CurrentUser() u: ShopAuth) {
    return this.feedback.mine(u);
  }
}
