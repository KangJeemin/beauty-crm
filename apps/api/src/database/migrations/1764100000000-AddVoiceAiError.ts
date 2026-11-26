import { MigrationInterface, QueryRunner } from 'typeorm';

/** 3단계: AI 정리 실패 사유를 STT 실패 사유와 따로 저장 (컬럼 순서 규칙에 따라 aiResult 뒤) */
export class AddVoiceAiError1764100000000 implements MigrationInterface {
  name = 'AddVoiceAiError1764100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `voice_record` ADD COLUMN IF NOT EXISTS `aiErrorMsg` VARCHAR(500) NULL COMMENT 'AI 정리 실패 사유' AFTER `aiResult`",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `voice_record` DROP COLUMN IF EXISTS `aiErrorMsg`');
  }
}
