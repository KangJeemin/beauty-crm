import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { envValidationSchema } from './config/env.validation';
import { typeOrmConfigFactory } from './config/database.config';
import { StorageModule } from './common/storage/storage.module';
import { HealthModule } from './health/health.module';
import { ShopModule } from './modules/shop/shop.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 모노레포 루트 .env → apps/api/.env 순서로 탐색
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfigFactory, inject: [] }),
    StorageModule,
    HealthModule,
    ShopModule,
  ],
})
export class AppModule {}
