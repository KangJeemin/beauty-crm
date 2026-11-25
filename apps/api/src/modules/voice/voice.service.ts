import { AiDraft, CustomerCandidate, ErrorCode, PendingVoiceItem, VoiceRecordStatus } from '@beauty-crm/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { PhoneCipher } from '../../common/crypto/phone-cipher.service';
import { AppException, Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { StorageService } from '../../common/storage/storage.service';
import { extOf } from '../ai/audio-transcoder';
import { Customer } from '../customer/entities/customer.entity';
import { VoiceRecord } from './voice-record.entity';
import { VoiceProcessor } from './voice.processor';

const MAX_BYTES = 20 * 1024 * 1024;
const AUDIO_MIME = /^(audio\/|video\/(webm|mp4|quicktime))/;

@Injectable()
export class VoiceRepository extends TenantRepository<VoiceRecord> {
  constructor(@InjectRepository(VoiceRecord) repo: Repository<VoiceRecord>) {
    super(repo);
  }
}

@Injectable()
export class VoiceService {
  constructor(
    private readonly voices: VoiceRepository,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly storage: StorageService,
    private readonly processor: VoiceProcessor,
  ) {}

  /** 녹음 업로드 → 저장소 보관 → 백그라운드 처리 시작 (바로 응답) */
  async upload(auth: ShopAuth, file: Express.Multer.File | undefined, customerId?: number): Promise<VoiceRecordStatus> {
    if (!file?.buffer?.length) throw new AppException(ErrorCode.VALIDATION, '녹음 파일이 없습니다.', HttpStatus.BAD_REQUEST);
    if (file.size > MAX_BYTES) throw new AppException(ErrorCode.VALIDATION, '녹음 파일이 너무 큽니다. (최대 20MB)', HttpStatus.BAD_REQUEST);
    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!AUDIO_MIME.test(mime)) throw new AppException(ErrorCode.VALIDATION, '음성 파일만 올릴 수 있습니다.', HttpStatus.BAD_REQUEST);
    if (customerId) await this.assertCustomer(auth.shopId, customerId);

    const now = new Date();
    const key = `shops/${auth.shopId}/voices/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${extOf(mime)}`;
    await this.storage.put(key, file.buffer, mime);

    const vr = await this.voices.save(
      this.voices.create({
        shopId: auth.shopId,
        userId: auth.userId,
        customerId: customerId ?? null,
        storageKey: key,
        mimeType: mime.slice(0, 50),
        fileSize: file.size,
        sttProvider: 'PENDING',
        sttStatus: 'PENDING',
        aiStatus: 'PENDING',
        fileExpireAt: new Date(now.getTime() + this.processor.fileRetentionDays * 86400_000),
      }),
    );
    this.processor.enqueue(vr.id);
    return this.status(auth, vr.id);
  }

  /** 글로 입력 (시끄러워서 말하기 어려울 때) — STT 를 건너뛰고 바로 AI 정리 */
  async fromText(auth: ShopAuth, text: string, customerId?: number): Promise<VoiceRecordStatus> {
    if (customerId) await this.assertCustomer(auth.shopId, customerId);
    const vr = await this.voices.save(
      this.voices.create({
        shopId: auth.shopId,
        userId: auth.userId,
        customerId: customerId ?? null,
        sttProvider: 'NONE',
        sttStatus: 'SKIPPED',
        transcript: text,
        aiStatus: 'PENDING',
      }),
    );
    this.processor.enqueue(vr.id);
    return this.status(auth, vr.id);
  }

  async status(auth: ShopAuth, id: number): Promise<VoiceRecordStatus> {
    const vr = await this.mustGet(auth.shopId, id);
    const draft = (vr.aiResult ?? null) as AiDraft | null;
    return {
      id: vr.id,
      inputType: vr.sttProvider === 'NONE' ? 'TEXT' : 'VOICE',
      customerId: vr.customerId,
      sttStatus: vr.sttStatus,
      aiStatus: vr.aiStatus,
      transcript: vr.transcript,
      draft,
      error: vr.sttStatus === 'FAILED' ? vr.sttErrorMsg : vr.aiStatus === 'FAILED' ? vr.aiErrorMsg : null,
      treatmentId: vr.treatmentId,
      candidates: await this.candidates(auth.shopId, vr, draft),
      durationSec: vr.durationSec,
      createdAt: vr.createdAt.toISOString(),
    };
  }

  /** 검토 대기 (저장하지 않은 최근 7일 기록) */
  async pending(auth: ShopAuth): Promise<PendingVoiceItem[]> {
    const rows = await this.voices.findForShop(auth.shopId, {
      where: { treatmentId: IsNull(), createdAt: MoreThan(new Date(Date.now() - 7 * 86400_000)) },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    const custIds = [...new Set(rows.map((r) => r.customerId).filter((v): v is number => !!v))];
    const custs = custIds.length ? await this.customers.findBy(custIds.map((id) => ({ id, shopId: auth.shopId }))) : [];
    return rows.map((r) => {
      const d = r.aiResult as AiDraft | null;
      return {
        id: r.id,
        inputType: r.sttProvider === 'NONE' ? 'TEXT' : 'VOICE',
        customerName: custs.find((c) => c.id === r.customerId)?.name ?? d?.customerName ?? null,
        summary: d?.summary ?? null,
        aiStatus: r.aiStatus,
        sttStatus: r.sttStatus,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** 실패한 단계부터 다시 시도 */
  async retry(auth: ShopAuth, id: number): Promise<VoiceRecordStatus> {
    const vr = await this.mustGet(auth.shopId, id);
    if (vr.treatmentId) throw Errors.forbidden('이미 저장된 기록입니다.');
    if (vr.sttStatus === 'FAILED') {
      if (!vr.storageKey || vr.fileDeletedAt) throw Errors.notFound('원본 녹음 파일');
      await this.voices.save({ id, sttStatus: 'PENDING', aiStatus: 'PENDING' });
    } else if (vr.aiStatus === 'FAILED') {
      await this.voices.save({ id, aiStatus: 'PENDING' });
    }
    this.processor.enqueue(id);
    return this.status(auth, id);
  }

  async discard(auth: ShopAuth, id: number): Promise<void> {
    const vr = await this.mustGet(auth.shopId, id);
    if (vr.treatmentId) throw Errors.forbidden('저장된 기록은 시술 기록에서 삭제해 주세요.');
    await this.voices.softDeleteForShop(auth.shopId, id);
  }

  /** 원본 녹음 다시 듣기 */
  async audio(auth: ShopAuth, id: number): Promise<{ stream: Readable; contentType: string; length?: number }> {
    const vr = await this.mustGet(auth.shopId, id);
    if (!vr.storageKey || vr.fileDeletedAt) throw Errors.notFound('녹음 파일');
    const r = await this.storage.getStream(vr.storageKey);
    return { stream: r.stream, contentType: vr.mimeType ?? r.contentType ?? 'application/octet-stream', length: r.length };
  }

  // ── 내부 ─────────────────────────────────────────────

  private async candidates(shopId: number, vr: VoiceRecord, draft: AiDraft | null): Promise<CustomerCandidate[]> {
    const toC = (c: Customer): CustomerCandidate => ({
      id: c.id, name: c.name, phoneMasked: PhoneCipher.mask(c.phoneLast4), lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
    });
    if (vr.customerId) {
      const c = await this.customers.findOneBy({ id: vr.customerId, shopId, delState: 0 });
      return c ? [toC(c)] : [];
    }
    if (!draft || (!draft.customerName && !draft.phoneLast4)) return [];
    const qb = this.customers.createQueryBuilder('c').where('c.shopId = :shopId AND c.delState = 0', { shopId });
    if (draft.phoneLast4 && draft.customerName) {
      qb.andWhere('(c.phoneLast4 = :l4 OR c.name LIKE :name)', { l4: draft.phoneLast4, name: `%${draft.customerName}%` });
    } else if (draft.phoneLast4) qb.andWhere('c.phoneLast4 = :l4', { l4: draft.phoneLast4 });
    else qb.andWhere('c.name LIKE :name', { name: `%${draft.customerName}%` });
    const rows = await qb.orderBy('c.lastVisitAt', 'DESC').take(5).getMany();
    // 이름과 뒷자리가 모두 맞는 고객을 맨 앞으로
    rows.sort((a, b) => score(b, draft) - score(a, draft));
    return rows.map(toC);
  }

  private async assertCustomer(shopId: number, id: number) {
    if (!(await this.customers.count({ where: { id, shopId, delState: 0 } }))) throw Errors.notFound('고객');
  }

  private async mustGet(shopId: number, id: number): Promise<VoiceRecord> {
    const vr = await this.voices.findOneForShop(shopId, id);
    if (!vr) throw Errors.notFound('음성 기록');
    return vr;
  }
}

function score(c: Customer, d: AiDraft) {
  return (d.customerName && c.name === d.customerName ? 2 : 0) + (d.phoneLast4 && c.phoneLast4 === d.phoneLast4 ? 1 : 0);
}
