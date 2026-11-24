import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 초기 스키마 — database/schema.sql(ERD 기준 DDL)을 그대로 실행한다.
 * 이후 변경은 `npm run migration:create -w @beauty-crm/api -- src/database/migrations/<Name>`
 * 로 새 마이그레이션을 만들고, 컬럼 순서 규칙(PK → FK → UK → 일반 → 공통)에 맞게
 * ALTER TABLE ... AFTER <컬럼> 을 직접 작성한다.
 */
export class InitSchema1764000000000 implements MigrationInterface {
  name = 'InitSchema1764000000000';

  private static readonly TABLES_IN_DROP_ORDER = [
    'audit_log', 'feedback', 'daily_closing', 'prepaid_transaction', 'payment_detail', 'payment',
    'prepaid_pass', 'ai_usage_log', 'voice_record', 'treatment_photo', 'treatment_recipe',
    'treatment_item', 'treatment', 'service_menu', 'service_category', 'customer_tag', 'tag',
    'customer', 'refresh_token', 'shop_invite', 'shop_user', 'shop', 'admin_user',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await queryRunner.query(stmt);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of InitSchema1764000000000.TABLES_IN_DROP_ORDER) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
