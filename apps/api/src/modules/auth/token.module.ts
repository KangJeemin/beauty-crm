import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './refresh-token.entity';
import { TokenService } from './token.service';

/** 토큰 발급·폐기 — auth / staff / admin 이 함께 쓴다 */
@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken])],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
