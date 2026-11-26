import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { AuditModule } from './common/audit/audit.module';
import { AuthGuard } from './common/auth/auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CryptoModule } from './common/crypto/crypto.module';
import { StorageModule } from './common/storage/storage.module';
import { typeOrmConfigFactory } from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { CustomerModule } from './modules/customer/customer.module';
import { InviteModule } from './modules/invite/invite.module';
import { MenuModule } from './modules/menu/menu.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ShopModule } from './modules/shop/shop.module';
import { StaffModule } from './modules/staff/staff.module';
import { TagModule } from './modules/tag/tag.module';
import { TreatmentModule } from './modules/treatment/treatment.module';
import { VoiceModule } from './modules/voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 모노레포 루트 .env → apps/api/.env 순서로 탐색
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfigFactory, inject: [] }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') }),
    }),
    // 기본: IP당 1분 300회. 로그인·가입은 컨트롤러에서 10회로 더 낮춤
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true', // e2e 테스트용
    }),
    StorageModule,
    AuditModule,
    CryptoModule,
    HealthModule,
    ShopModule,
    StaffModule,
    AuthModule,
    InviteModule,
    AdminModule,
    MenuModule,
    TagModule,
    CustomerModule,
    TreatmentModule,
    VoiceModule,
    PaymentModule,
    FeedbackModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard }, // 기본은 "로그인 필수", 예외는 @Public()
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
