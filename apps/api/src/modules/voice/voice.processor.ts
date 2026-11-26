import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { StorageService } from '../../common/storage/storage.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { AudioTranscoder } from '../ai/audio-transcoder';
import { MenuRef, normalizeDraft } from '../ai/draft-normalizer';
import { PROMPT_VERSION } from '../ai/prompt';
import { LLM_PROVIDER, LlmProvider, ProviderError, STT_PROVIDER, SttProvider } from '../ai/providers/provider.types';
import { ServiceCategory, ServiceMenu } from '../menu/entities/menu.entity';
import { VoiceRecord } from './voice-record.entity';

/** 미용 용어 — STT 키워드 부스팅 (메뉴명·별칭과 함께 보냄) */
const BEAUTY_WORDS = [
  '뿌리염색', '뿌염', '전체염색', '새치염색', '탈색', '블리치', '산화제', '매직', '볼륨매직', '셋팅펌', '디지털펌', '다운펌',
  '클리닉', '두피', '스케일링', '커트', '앞머리', '레이어드', '단발', '기장', '로드', '중화', '연화', '방치', '애쉬', '브라운', '매트',
];

/**
 * 음성 처리 파이프라인 (서버 안의 간단한 큐, 동시 2건)
 *   1) 저장소에서 음성 읽기 → WAV 변환 → STT
 *   2) 메뉴 목록과 함께 LLM 정리 → 검증 → aiResult 저장
 * 서버가 재시작되면 끝나지 않은 작업을 다시 넣는다.
 * 사용자가 늘면 BullMQ(Redis) 로 바꾸면 된다 — process() 는 그대로 재사용.
 */
@Injectable()
export class VoiceProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VoiceProcessor.name);
  private readonly queue: number[] = [];
  private readonly inFlight = new Set<number>();
  private readonly concurrency = 2;
  private readonly retentionDays: number;
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(VoiceRecord) private readonly voices: Repository<VoiceRecord>,
    @InjectRepository(ServiceMenu) private readonly menus: Repository<ServiceMenu>,
    @InjectRepository(ServiceCategory) private readonly cats: Repository<ServiceCategory>,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly transcoder: AudioTranscoder,
    private readonly storage: StorageService,
    private readonly usage: AiUsageService,
    config: ConfigService,
  ) {
    this.retentionDays = Number(config.get('VOICE_FILE_RETENTION_DAYS', 30));
  }

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    // 재시작 전에 끝나지 않은 작업 (최근 하루)
    const stuck = await this.voices.find({
      select: ['id'],
      where: [
        { delState: 0, sttStatus: In(['PENDING', 'PROCESSING']), createdAt: MoreThan(new Date(Date.now() - 86400_000)) },
        { delState: 0, sttStatus: In(['DONE', 'SKIPPED']), aiStatus: In(['PENDING', 'PROCESSING']), createdAt: MoreThan(new Date(Date.now() - 86400_000)) },
      ],
    });
    stuck.forEach((v) => this.enqueue(v.id));
    if (stuck.length) this.logger.log(`미완료 음성 작업 ${stuck.length}건 재개`);

    // 원본 음성 자동 삭제 (6시간마다)
    this.expiryTimer = setInterval(() => this.deleteExpiredFiles().catch((e) => this.logger.warn(e.message)), 6 * 3600_000);
    this.expiryTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  enqueue(id: number) {
    if (this.inFlight.has(id) || this.queue.includes(id)) return;
    this.queue.push(id);
    this.pump();
  }

  /** 테스트·관리용: 큐가 빌 때까지 기다림 */
  async drain(timeoutMs = 20_000) {
    const end = Date.now() + timeoutMs;
    while ((this.queue.length || this.inFlight.size) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  }

  private pump() {
    while (this.inFlight.size < this.concurrency && this.queue.length) {
      const id = this.queue.shift()!;
      this.inFlight.add(id);
      this.process(id)
        .catch((e) => this.logger.error(`음성 #${id} 처리 오류: ${e?.stack ?? e}`))
        .finally(() => {
          this.inFlight.delete(id);
          this.pump();
        });
    }
  }

  async process(id: number): Promise<void> {
    let vr = await this.voices.findOneBy({ id, delState: 0 });
    if (!vr) return;

    // ── 1) STT ──
    if ((vr.sttStatus === 'PENDING' || vr.sttStatus === 'PROCESSING') && vr.storageKey) {
      await this.voices.update(id, { sttStatus: 'PROCESSING', sttErrorMsg: null });
      const started = Date.now();
      let seconds = Number(vr.durationSec ?? 0);
      try {
        const original = await this.storage.getBuffer(vr.storageKey);
        const audio = await this.transcoder.toWav(original, vr.mimeType ?? 'application/octet-stream');
        if (audio.durationSec != null) seconds = audio.durationSec;
        if (seconds > 600) throw new ProviderError('녹음이 너무 깁니다. 10분 이내로 나눠서 녹음해 주세요.');

        const words = await this.boostWords(vr.shopId);
        const r = await this.stt.transcribe({ audio: audio.audio, mimeType: audio.mimeType, fileName: `voice-${id}.${audio.ext}`, boostWords: words });
        if (!r.text) throw new ProviderError('말소리를 알아듣지 못했어요. 조용한 곳에서 다시 녹음하거나 글로 입력해 주세요.');

        await this.voices.update(id, {
          sttStatus: 'DONE', transcript: r.text.slice(0, 20000), sttRequestId: r.requestId ?? null,
          durationSec: seconds || null, sttProvider: this.stt.code,
        });
        await this.usage.stt({ shopId: vr.shopId, voiceRecordId: id, provider: this.stt.code, seconds, ok: true, latencyMs: Date.now() - started });
      } catch (e) {
        await this.voices.update(id, { sttStatus: 'FAILED', sttErrorMsg: userMessage(e, '음성 인식에 실패했습니다.') });
        await this.usage.stt({ shopId: vr.shopId, voiceRecordId: id, provider: this.stt.code, seconds, ok: false, latencyMs: Date.now() - started });
        this.logger.warn(`음성 #${id} STT 실패: ${(e as Error).message} ${(e as ProviderError).detail ?? ''}`);
        return;
      }
      vr = (await this.voices.findOneBy({ id }))!;
    }

    // ── 2) LLM 정리 ──
    if ((vr.sttStatus === 'DONE' || vr.sttStatus === 'SKIPPED') && (vr.aiStatus === 'PENDING' || vr.aiStatus === 'PROCESSING') && vr.transcript) {
      await this.voices.update(id, { aiStatus: 'PROCESSING', aiErrorMsg: null });
      const started = Date.now();
      try {
        const menus = await this.menuRefs(vr.shopId);
        const r = await this.llm.structure({
          transcript: vr.transcript,
          menus: menus.map((m) => ({ name: m.name, aliases: m.aliases, price: m.basePrice, category: m.category })),
        });
        const draft = normalizeDraft(r.raw, menus);
        await this.voices.update(id, {
          aiStatus: 'DONE', aiResult: draft as any, aiProvider: this.llm.code, aiModel: r.model, promptVersion: PROMPT_VERSION,
        });
        await this.usage.llm({
          shopId: vr.shopId, voiceRecordId: id, provider: this.llm.code, model: r.model,
          promptTokens: r.promptTokens, completionTokens: r.completionTokens, ok: true, latencyMs: Date.now() - started,
        });
      } catch (e) {
        await this.voices.update(id, { aiStatus: 'FAILED', aiErrorMsg: userMessage(e, 'AI 정리에 실패했습니다.'), aiProvider: this.llm.code });
        await this.usage.llm({
          shopId: vr.shopId, voiceRecordId: id, provider: this.llm.code, model: this.llm.model,
          promptTokens: 0, completionTokens: 0, ok: false, latencyMs: Date.now() - started,
        });
        this.logger.warn(`음성 #${id} AI 실패: ${(e as Error).message} ${(e as ProviderError).detail ?? ''}`);
      }
    }
  }

  /** 보관 기간이 지난 원본 음성 파일 삭제 (DB 행·받아 적은 글은 유지) */
  async deleteExpiredFiles(): Promise<number> {
    const rows = await this.voices.find({
      where: { fileExpireAt: LessThan(new Date()), fileDeletedAt: IsNull(), storageKey: Not(IsNull()) },
      take: 200,
    });
    for (const r of rows) {
      try {
        await this.storage.remove(r.storageKey!);
        await this.voices.update(r.id, { fileDeletedAt: new Date() });
      } catch (e) {
        this.logger.warn(`음성 파일 삭제 실패 #${r.id}: ${(e as Error).message}`);
      }
    }
    if (rows.length) this.logger.log(`만료된 음성 파일 ${rows.length}건 삭제`);
    return rows.length;
  }

  get fileRetentionDays() {
    return this.retentionDays;
  }

  private async menuRefs(shopId: number): Promise<(MenuRef & { category: string })[]> {
    const [menus, cats] = await Promise.all([
      this.menus.find({ where: { shopId, delState: 0, isActive: 1 }, order: { sortOrder: 'ASC' } }),
      this.cats.find({ where: { shopId, delState: 0 } }),
    ]);
    return menus.map((m) => ({
      id: m.id,
      name: m.name,
      aliases: (m.aliases ?? '').split(',').map((a) => a.trim()).filter(Boolean),
      basePrice: m.basePrice,
      category: cats.find((c) => c.id === m.categoryId)?.name ?? '',
    }));
  }

  private async boostWords(shopId: number): Promise<string[]> {
    const menus = await this.menuRefs(shopId);
    return [...BEAUTY_WORDS, ...menus.flatMap((m) => [m.name, ...m.aliases])];
  }
}

function userMessage(e: unknown, fallback: string): string {
  return (e instanceof ProviderError ? e.message : fallback).slice(0, 500);
}

