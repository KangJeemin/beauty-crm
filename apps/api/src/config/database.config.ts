import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { PreventHardDeleteSubscriber } from '../common/subscribers/prevent-hard-delete.subscriber';

/**
 * 앱(Nest)과 마이그레이션 CLI(data-source.ts)가 같은 설정을 쓰도록 한 곳에 둔다.
 *
 * 네이밍: TypeORM 기본 전략은 "프로퍼티명 = 컬럼명" 이므로
 *        camelCase 프로퍼티가 그대로 camelCase 컬럼에 매핑된다.
 *        테이블명은 각 @Entity('snake_case') 에 명시한다.
 */
export function buildDataSourceOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  return {
    type: 'mariadb',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4_unicode_ci',
    timezone: '+09:00',
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migration',
    subscribers: [PreventHardDeleteSubscriber],
    synchronize: false, // 스키마 변경은 반드시 마이그레이션으로
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
    supportBigNumbers: true,
  };
}

export const typeOrmConfigFactory = () => ({
  ...buildDataSourceOptions(),
  autoLoadEntities: true,
});
