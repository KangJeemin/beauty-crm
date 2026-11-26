import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLog } from './ai-usage-log.entity';

/**
 * 매장별 AI 사용량·추정 비용 기록 (무료 운영 원가 계산, 유료화 근거)
 * 단가는 .env 로 설정 — NAVER 요금표가 바뀌면 값만 수정
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private readonly sttPerMin: number;
  private readonly llmIn1k: number;
  private readonly llmOut1k: number;

  constructor(
    @InjectRepository(AiUsageLog) private readonly logs: Repository<AiUsageLog>,
    config: ConfigService,
  ) {
    this.sttPerMin = Number(config.get('STT_COST_KRW_PER_MIN', 0));
    this.llmIn1k = Number(config.get('LLM_COST_KRW_PER_1K_INPUT', 0));
    this.llmOut1k = Number(config.get('LLM_COST_KRW_PER_1K_OUTPUT', 0));
  }

  async stt(p: { shopId: number; voiceRecordId: number; provider: string; seconds: number; ok: boolean; latencyMs: number }) {
    await this.save({
      shopId: p.shopId, voiceRecordId: p.voiceRecordId, usageType: 'STT', provider: p.provider, model: null,
      inputUnits: Math.ceil(p.seconds), outputUnits: 0,
      costKrw: Math.round((p.seconds / 60) * this.sttPerMin * 100) / 100, isSuccess: p.ok ? 1 : 0, latencyMs: p.latencyMs,
    });
  }

  async llm(p: { shopId: number; voiceRecordId: number; provider: string; model: string; promptTokens: number; completionTokens: number; ok: boolean; latencyMs: number }) {
    await this.save({
      shopId: p.shopId, voiceRecordId: p.voiceRecordId, usageType: 'LLM', provider: p.provider, model: p.model,
      inputUnits: p.promptTokens, outputUnits: p.completionTokens,
      costKrw: Math.round(((p.promptTokens / 1000) * this.llmIn1k + (p.completionTokens / 1000) * this.llmOut1k) * 100) / 100,
      isSuccess: p.ok ? 1 : 0, latencyMs: p.latencyMs,
    });
  }

  private async save(row: Partial<AiUsageLog>) {
    try {
      await this.logs.insert(row);
    } catch (e) {
      // 사용량 기록 실패가 시술 기록을 막으면 안 된다
      this.logger.warn(`사용량 기록 실패: ${(e as Error).message}`);
    }
  }
}
