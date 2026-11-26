import { ErrorCode, PaymentSummary, TreatmentDetail, TreatmentListItem, UserStatus } from '@beauty-crm/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { AppException, Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { Customer } from '../customer/entities/customer.entity';
import { ServiceMenu } from '../menu/entities/menu.entity';
import { Payment, PaymentDetail } from '../payment/payment.entities';
import { ShopUser } from '../staff/entities/shop-user.entity';
import { VoiceRecord } from '../voice/voice-record.entity';
import { TreatmentSaveDto } from './dto/treatment.dto';
import { Treatment, TreatmentItemEntity, TreatmentRecipeEntity } from './entities/treatment.entity';

@Injectable()
export class TreatmentRepository extends TenantRepository<Treatment> {
  constructor(@InjectRepository(Treatment) repo: Repository<Treatment>) {
    super(repo);
  }
}

@Injectable()
export class TreatmentService {
  constructor(
    private readonly treatments: TreatmentRepository,
    private readonly ds: DataSource,
  ) {}

  /** 검토 화면에서 저장 → 시술 기록 확정 */
  async create(auth: ShopAuth, dto: TreatmentSaveDto): Promise<TreatmentDetail> {
    const id = await this.ds.transaction(async (em) => {
      const refs = await this.validateRefs(em, auth, dto);
      const vr = dto.voiceRecordId ? await this.lockVoice(em, auth.shopId, dto.voiceRecordId) : null;

      const t = await em.getRepository(Treatment).save(
        em.getRepository(Treatment).create({
          shopId: auth.shopId,
          customerId: dto.customerId,
          designerId: refs.designerId,
          copiedFromId: dto.copiedFromId ?? null,
          treatedAt: dto.treatedAt ? new Date(dto.treatedAt) : new Date(),
          inputType: vr ? (vr.sttProvider === 'NONE' ? 'TEXT' : 'VOICE') : 'MANUAL',
          status: 'CONFIRMED',
          summary: dto.summary ?? autoSummary(dto),
          note: dto.note ?? null,
          totalAmount: sum(dto),
        }),
      );
      await this.insertItems(em, auth.shopId, t.id, dto);
      if (vr) await em.getRepository(VoiceRecord).update(vr.id, { treatmentId: t.id, customerId: dto.customerId });
      await this.recomputeCustomer(em, auth.shopId, dto.customerId);
      return t.id;
    });
    return this.get(auth, id);
  }

  /** 수정 — 시술 항목·레시피는 통째로 교체 (이전 것은 소프트 삭제) */
  async update(auth: ShopAuth, id: number, dto: TreatmentSaveDto): Promise<TreatmentDetail> {
    await this.ds.transaction(async (em) => {
      const t = await em.getRepository(Treatment).findOneBy({ id, shopId: auth.shopId, delState: 0 });
      if (!t) throw Errors.notFound('시술 기록');
      const refs = await this.validateRefs(em, auth, dto, t.designerId);
      const oldCustomer = t.customerId;

      // 결제가 끝난 시술은 금액·고객을 바꾸면 결제 기록과 어긋난다 → 결제 취소 후 수정
      const paid = await em.getRepository(Payment).findOneBy({ shopId: auth.shopId, treatmentId: id, status: 'PAID', delState: 0 });
      if (paid && (sum(dto) !== paid.listAmount || dto.customerId !== t.customerId)) {
        throw new AppException(
          ErrorCode.VALIDATION,
          '결제가 끝난 시술은 금액이나 고객을 바꿀 수 없습니다. 정산 화면에서 결제를 취소한 뒤 수정해 주세요.',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.softDeleteItems(em, auth.shopId, [id]);
      Object.assign(t, {
        customerId: dto.customerId,
        designerId: refs.designerId,
        treatedAt: dto.treatedAt ? new Date(dto.treatedAt) : t.treatedAt,
        summary: dto.summary ?? autoSummary(dto),
        note: dto.note ?? null,
        totalAmount: sum(dto),
      });
      await em.getRepository(Treatment).save(t);
      await this.insertItems(em, auth.shopId, id, dto);
      await this.recomputeCustomer(em, auth.shopId, dto.customerId);
      if (oldCustomer !== dto.customerId) await this.recomputeCustomer(em, auth.shopId, oldCustomer);
    });
    return this.get(auth, id);
  }

  async remove(auth: ShopAuth, id: number): Promise<void> {
    await this.ds.transaction(async (em) => {
      const t = await em.getRepository(Treatment).findOneBy({ id, shopId: auth.shopId, delState: 0 });
      if (!t) throw Errors.notFound('시술 기록');
      if (await em.getRepository(Payment).count({ where: { shopId: auth.shopId, treatmentId: id, status: 'PAID', delState: 0 } })) {
        throw new AppException(ErrorCode.VALIDATION, '결제가 끝난 시술입니다. 결제를 먼저 취소해 주세요.', HttpStatus.BAD_REQUEST);
      }
      await em.getRepository(Treatment).update(id, { delState: 1 });
      await this.softDeleteItems(em, auth.shopId, [id]);
      await this.recomputeCustomer(em, auth.shopId, t.customerId);
    });
  }

  async get(auth: ShopAuth, id: number): Promise<TreatmentDetail> {
    const t = await this.treatments.findOneForShop(auth.shopId, id);
    if (!t) throw Errors.notFound('시술 기록');
    return (await this.hydrate(auth.shopId, [t]))[0];
  }

  /** 고객 상세의 시술 이력 (최근 순, 레시피 포함) */
  async listForCustomer(auth: ShopAuth, customerId: number, page = 1, size = 20): Promise<{ items: TreatmentDetail[]; total: number }> {
    const [rows, total] = await this.treatments
      .qbForShop(auth.shopId, 't')
      .andWhere('t.customerId = :customerId', { customerId })
      .orderBy('t.treatedAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { items: await this.hydrate(auth.shopId, rows), total };
  }

  /** 홈 화면 최근 기록 */
  async recent(auth: ShopAuth, size = 10): Promise<TreatmentListItem[]> {
    const rows = await this.treatments.findForShop(auth.shopId, { order: { treatedAt: 'DESC', id: 'DESC' }, take: size });
    const details = await this.hydrate(auth.shopId, rows);
    return details.map((d) => ({
      id: d.id,
      customerId: d.customerId,
      customerName: d.customerName,
      designerName: d.designerName,
      treatedAt: d.treatedAt,
      summary: d.summary,
      totalAmount: d.totalAmount,
      itemNames: d.items.map((i) => i.menuName),
      paid: !!d.payment,
    }));
  }

  // ── 내부 ─────────────────────────────────────────────

  /** body 로 들어온 모든 id 가 내 매장 것인지 확인 (고객·디자이너·메뉴·원본 기록) */
  private async validateRefs(em: EntityManager, auth: ShopAuth, dto: TreatmentSaveDto, fallbackDesigner?: number) {
    const customer = await em.getRepository(Customer).findOneBy({ id: dto.customerId, shopId: auth.shopId, delState: 0 });
    if (!customer) throw Errors.notFound('고객');

    const designerId = dto.designerId ?? fallbackDesigner ?? auth.userId;
    const designer = await em.getRepository(ShopUser).findOneBy({ id: designerId, shopId: auth.shopId, delState: 0 });
    if (!designer || designer.status !== UserStatus.ACTIVE) throw Errors.notFound('담당 디자이너');

    const menuIds = [...new Set(dto.items.map((i) => i.serviceMenuId).filter((v): v is number => !!v))];
    if (menuIds.length) {
      const n = await em.getRepository(ServiceMenu).count({ where: { id: In(menuIds), shopId: auth.shopId } });
      if (n !== menuIds.length) throw Errors.notFound('시술 메뉴');
    }
    if (dto.copiedFromId) {
      const src = await em.getRepository(Treatment).findOneBy({ id: dto.copiedFromId, shopId: auth.shopId });
      if (!src) throw Errors.notFound('원본 시술 기록');
    }
    return { designerId };
  }

  private async lockVoice(em: EntityManager, shopId: number, id: number): Promise<VoiceRecord> {
    const vr = await em
      .getRepository(VoiceRecord)
      .createQueryBuilder('v')
      .setLock('pessimistic_write')
      .where('v.id = :id AND v.shopId = :shopId AND v.delState = 0', { id, shopId })
      .getOne();
    if (!vr) throw Errors.notFound('음성 기록');
    if (vr.treatmentId) throw Errors.forbidden('이미 저장된 기록입니다.');
    return vr;
  }

  private async insertItems(em: EntityManager, shopId: number, treatmentId: number, dto: TreatmentSaveDto) {
    for (const [i, it] of dto.items.entries()) {
      const item = await em.getRepository(TreatmentItemEntity).save(
        em.getRepository(TreatmentItemEntity).create({
          shopId, treatmentId, serviceMenuId: it.serviceMenuId ?? null, menuName: it.menuName, price: it.price, sortOrder: i,
        }),
      );
      const recipes = it.recipes
        .map((r, j) => ({
          shopId, treatmentItemId: item.id, sortOrder: j,
          area: r.area ?? null, productName: r.productName ?? null, colorCode: r.colorCode ?? null, mixRatio: r.mixRatio ?? null,
          developerPct: r.developerPct ?? null, amountGram: r.amountGram ?? null, processingMin: r.processingMin ?? null,
          rodSize: r.rodSize ?? null, heatTemp: r.heatTemp ?? null, memo: r.memo ?? null,
        }))
        .filter((r) => [r.area, r.productName, r.colorCode, r.mixRatio, r.developerPct, r.amountGram, r.processingMin, r.rodSize, r.heatTemp, r.memo].some((v) => v !== null));
      if (recipes.length) await em.getRepository(TreatmentRecipeEntity).insert(recipes);
    }
  }

  private async softDeleteItems(em: EntityManager, shopId: number, treatmentIds: number[]) {
    const items = await em.getRepository(TreatmentItemEntity).find({ where: { treatmentId: In(treatmentIds), shopId, delState: 0 } });
    if (!items.length) return;
    await em.getRepository(TreatmentItemEntity).update({ id: In(items.map((i) => i.id)) }, { delState: 1 });
    await em.getRepository(TreatmentRecipeEntity).update({ treatmentItemId: In(items.map((i) => i.id)), delState: 0 }, { delState: 1 });
  }

  /** 고객 방문 횟수·첫/최근 방문일을 시술 기록에서 다시 계산 */
  async recomputeCustomer(em: EntityManager, shopId: number, customerId: number) {
    await em.query(
      `UPDATE customer c
          LEFT JOIN (
            SELECT customerId, COUNT(*) cnt, MIN(treatedAt) firstAt, MAX(treatedAt) lastAt
              FROM treatment
             WHERE shopId = ? AND customerId = ? AND delState = 0 AND status = 'CONFIRMED'
          ) s ON s.customerId = c.id
          SET c.visitCount = COALESCE(s.cnt, 0), c.firstVisitAt = s.firstAt, c.lastVisitAt = s.lastAt
        WHERE c.id = ? AND c.shopId = ?`,
      [shopId, customerId, customerId, shopId],
    );
  }

  private async hydrate(shopId: number, rows: Treatment[]): Promise<TreatmentDetail[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const items = await this.ds.getRepository(TreatmentItemEntity).find({
      where: { treatmentId: In(ids), shopId, delState: 0 },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const recipes = items.length
      ? await this.ds.getRepository(TreatmentRecipeEntity).find({
          where: { treatmentItemId: In(items.map((i) => i.id)), shopId, delState: 0 },
          order: { sortOrder: 'ASC', id: 'ASC' },
        })
      : [];
    const customers = await this.ds.getRepository(Customer).find({ where: { id: In([...new Set(rows.map((r) => r.customerId))]), shopId } });
    const designers = await this.ds.getRepository(ShopUser).find({ where: { id: In([...new Set(rows.map((r) => r.designerId))]), shopId } });
    const voices = await this.ds.getRepository(VoiceRecord).find({ where: { treatmentId: In(ids), shopId } });
    const pays = await this.ds.getRepository(Payment).find({ where: { treatmentId: In(ids), shopId, status: 'PAID', delState: 0 } });
    const payDetails = pays.length
      ? await this.ds.getRepository(PaymentDetail).find({ where: { paymentId: In(pays.map((p) => p.id)), shopId, delState: 0 } })
      : [];
    const paymentOf = (tid: number): PaymentSummary | null => {
      const p = pays.find((x) => x.treatmentId === tid);
      if (!p) return null;
      return {
        id: p.id, finalAmount: p.finalAmount, discountAmount: p.discountAmount, paidAt: p.paidAt.toISOString(),
        methods: payDetails.filter((d) => d.paymentId === p.id).map((d) => ({ method: d.method, amount: d.amount })),
      };
    };

    return rows.map((t) => ({
      id: t.id,
      customerId: t.customerId,
      customerName: customers.find((c) => c.id === t.customerId)?.name ?? '(삭제된 고객)',
      designerId: t.designerId,
      designerName: designers.find((d) => d.id === t.designerId)?.name ?? '(삭제된 직원)',
      treatedAt: t.treatedAt.toISOString(),
      inputType: t.inputType,
      summary: t.summary,
      note: t.note,
      totalAmount: t.totalAmount,
      copiedFromId: t.copiedFromId,
      transcript: voices.find((v) => v.treatmentId === t.id)?.transcript ?? null,
      payment: paymentOf(t.id),
      createdAt: t.createdAt.toISOString(),
      items: items
        .filter((i) => i.treatmentId === t.id)
        .map((i) => ({
          id: i.id,
          serviceMenuId: i.serviceMenuId,
          menuName: i.menuName,
          price: i.price,
          recipes: recipes
            .filter((r) => r.treatmentItemId === i.id)
            .map((r) => ({
              id: r.id, area: r.area, productName: r.productName, colorCode: r.colorCode, mixRatio: r.mixRatio,
              developerPct: r.developerPct, amountGram: r.amountGram, processingMin: r.processingMin,
              rodSize: r.rodSize, heatTemp: r.heatTemp, memo: r.memo,
            })),
        })),
    }));
  }
}

function sum(dto: TreatmentSaveDto) {
  return dto.items.reduce((a, i) => a + (i.price || 0), 0);
}

function autoSummary(dto: TreatmentSaveDto) {
  return dto.items.map((i) => i.menuName).join(' + ').slice(0, 500) || null;
}
