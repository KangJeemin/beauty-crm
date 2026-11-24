import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

// TypeORM CLI(마이그레이션) 전용 DataSource. src/·dist/ 어디서 실행해도 루트 .env를 찾는다.
config({ path: resolve(__dirname, '../../../../.env') });
config({ path: resolve(__dirname, '../../.env') });

export default new DataSource(buildDataSourceOptions());
