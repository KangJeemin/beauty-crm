import {
  AdminDashboard,
  AdminShopDetail,
  AdminShopRow,
  AiUsageReport,
  AiUsageTotals,
  AuditItem,
  PlanType,
  ShopStatus,
} from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { auditBefore } from '../../common/audit/audit-context';
import { Errors } from '../../common/errors/app.exception';
import { FeedbackService } from '../feedback/feedback.service';
import { ShopRepository } from '../shop/shop.repository';

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const n = (v: unknown) => Number(v ?? 0) || 0;

/** 이번 달 'YYYY-MM' (한국 시간) */
export function thisMonth(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
}
function monthBounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01 00:00:00`, `${next}-01 00:00:00`];
}

const SHOP_ROW_SQL = (where: string, month: string) => `
  SELECT s.id, s.name, s.ownerName, s.phone, s.status, s.planType, s.isFounder, s.createdAt, s.approvedAt,
         s.bizNo, s.address, s.storageQuotaMb, s.storageUsedBytes, s.termsAgreedAt, s.privacyAgreedAt,
         (SELECT MIN(o.loginId) FROM shop_user o WHERE o.shopId = s.id AND o.role = 'OWNER' AND o.delState = 0) ownerLoginId,
         (SELECT COUNT(*) FROM shop_user u WHERE u.shopId = s.id AND u.delState = 0) userCount,
         (SELECT COUNT(*) FROM customer c WHERE c.shopId = s.id AND c.delState = 0) customerCount,
         (SELECT COUNT(*) FROM treatment t WHERE t.shopId = s.id AND t.delState = 0) treatmentCount,
         (SELECT COUNT(*) FROM treatment t WHERE t.shopId = s.id AND t.delState = 0 AND t.createdAt >= NOW() - INTERVAL 7 DAY) treatments7d,
         GREATEST(
           COALESCE((SELECT MAX(t.createdAt) FROM treatment t WHERE t.shopId = s.id), '1970-01-01'),
           COALESCE((SELECT MAX(u.lastLoginAt) FROM shop_user u WHERE u.shopId = s.id AND u.delState = 0), '1970-01-01'),
           COALESCE((SELECT MAX(l.createdAt) FROM audit_log l WHERE l.shopId = s.id AND l.actorType = 'SHOP'), '1970-01-01')
         ) lastActivityAt,
         (SELECT COALESCE(SUM(a.costKrw), 0) FROM ai_usage_log a WHERE a.shopId = s.id AND a.createdAt >= '${monthBounds(month)[0]}' AND a.createdAt < '${monthBounds(month)[1]}') aiCostMonth
    FROM shop s
   WHERE s.delState = 0 ${where}`;

function toShopRow(r: any): AdminShopRow {
  const last = iso(r.lastActivityAt);
  return {
    id: n(r.id),
    name: r.name,
    ownerName: r.ownerName,
    phone: r.phone,
    status: r.status,
    planType: r.planType,
    isFounder: n(r.isFounder),
    ownerLoginId: r.ownerLoginId ?? null,
    userCount: n(r.userCount),
    customerCount: n(r.customerCount),
    treatmentCount: n(r.treatmentCount),
    treatments7d: n(r.treatments7d),
    lastActivityAt: last && !last.startsWith('1970') ? last : null,
    aiCostMonth: Math.round(n(r.aiCostMonth)),
    createdAt: iso(r.createdAt)!,
    approvedAt: iso(r.approvedAt),
  };
}

function toUsage(r: any): AiUsageTotals {
  return {
    calls: n(r.calls),
    failures: n(r.failures),
    sttSeconds: n(r.sttSeconds),
    llmInput: n(r.llmInput),
    llmOutput: n(r.llmOutput),
    costKrw: Math.round(n(r.costKrw)),
  };
}
const USAGE_COLS = `COUNT(*) calls, SUM(a.isSuccess = 0) failures,
  SUM(IF(a.usageType = 'STT', a.inputUnits, 0)) sttSeconds,
  SUM(IF(a.usageType = 'LLM', a.inputUnits, 0)) llmInput,
  SUM(IF(a.usageType = 'LLM', a.outputUnits, 0)) llmOutput,
  COALESCE(SUM(a.costKrw), 0) costKrw`;

/** 운영자 화면용 조회 (매장 현황·AI 사용량·변경 이력) */
@Injectable()
export class AdminOpsService {
  constructor(
    private readonly ds: DataSource,
    private readonly shops: ShopRepository,
    private readonly feedback: FeedbackService,
  ) {}

  async listShops(p: { status?: ShopStatus; q?: string } = {}): Promise<AdminShopRow[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (p.status) (where.push('AND s.status = ?'), args.push(p.status));
    if (p.q) {
      where.push('AND (s.name LIKE ? OR s.ownerName LIKE ? OR s.phone LIKE ? OR EXISTS (SELECT 1 FROM shop_user x WHERE x.shopId = s.id AND x.loginId LIKE ?))');
      const like = `%${p.q.replace(/[%_\\]/g, '\\$&')}%`;
      args.push(like, like, like, like);
    }
    const rows = await this.ds.query(`${SHOP_ROW_SQL(where.join(' '), thisMonth())} ORDER BY (s.status = 'PENDING') DESC, s.createdAt DESC`, args);
    return rows.map(toShopRow);
  }

  async dashboard(): Promise<AdminDashboard> {
    const month = thisMonth();
    const [from, to] = monthBounds(month);
    const [counts, act, voice, ai, pending, openFeedback] = await Promise.all([
      this.ds.query(`SELECT status, COUNT(*) n FROM shop WHERE delState = 0 GROUP BY status`),
      this.ds.query(`SELECT COUNT(*) treatments, COUNT(DISTINCT shopId) shops FROM treatment WHERE delState = 0 AND createdAt >= NOW() - INTERVAL 7 DAY`),
      this.ds.query(
        `SELECT COUNT(*) total, SUM(sttStatus = 'FAILED' OR aiStatus = 'FAILED') failed FROM voice_record WHERE createdAt >= NOW() - INTERVAL 7 DAY`,
      ),
      this.ds.query(`SELECT ${USAGE_COLS} FROM ai_usage_log a WHERE a.createdAt >= ? AND a.createdAt < ?`, [from, to]),
      this.listShops({ status: ShopStatus.PENDING }),
      this.feedback.openCount(),
    ]);
    const shopCounts = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0, CLOSED: 0, total: 0 } as AdminDashboard['shopCounts'];
    for (const r of counts) {
      (shopCounts as Record<string, number>)[r.status] = n(r.n);
      shopCounts.total += n(r.n);
    }
    return {
      shopCounts,
      pendingShops: pending.slice(0, 10),
      openFeedback,
      activeShops7d: n(act[0].shops),
      treatments7d: n(act[0].treatments),
      voice7d: n(voice[0].total),
      voiceFailed7d: n(voice[0].failed),
      aiMonth: { month, ...toUsage(ai[0]) },
    };
  }

  async shopDetail(id: number): Promise<AdminShopDetail> {
    const rows = await this.ds.query(SHOP_ROW_SQL('AND s.id = ?', thisMonth()), [id]);
    if (!rows.length) throw Errors.notFound('매장');
    const r = rows[0];
    const [users, usage, feedback, audit] = await Promise.all([
      this.ds.query(
        `SELECT id, loginId, name, role, status, lastLoginAt, createdAt FROM shop_user WHERE shopId = ? AND delState = 0 ORDER BY (role = 'OWNER') DESC, id`,
        [id],
      ),
      this.ds.query(
        `SELECT DATE_FORMAT(a.createdAt, '%Y-%m') month, ${USAGE_COLS}
           FROM ai_usage_log a WHERE a.shopId = ? AND a.createdAt >= DATE_FORMAT(NOW() - INTERVAL 5 MONTH, '%Y-%m-01')
          GROUP BY month ORDER BY month DESC`,
        [id],
      ),
      this.feedback.forShop(id),
      this.auditLogs({ shopId: id, size: 30 }),
    ]);
    return {
      shop: {
        ...toShopRow(r),
        bizNo: r.bizNo,
        address: r.address,
        storageQuotaMb: n(r.storageQuotaMb),
        storageUsedBytes: n(r.storageUsedBytes),
        termsAgreedAt: iso(r.termsAgreedAt),
        privacyAgreedAt: iso(r.privacyAgreedAt),
      },
      users: users.map((u: any) => ({
        id: n(u.id),
        loginId: u.loginId,
        name: u.name,
        role: u.role,
        status: u.status,
        lastLoginAt: iso(u.lastLoginAt),
        createdAt: iso(u.createdAt)!,
      })),
      usage: usage.map((u: any) => ({ month: u.month, ...toUsage(u) })),
      feedback,
      audit: audit.items,
    };
  }

  /** 창립 테스터 표시 · 사진 용량 상한 변경 */
  async updateShop(id: number, dto: { isFounder?: boolean; storageQuotaMb?: number }): Promise<AdminShopDetail> {
    const shop = await this.shops.findOneById(id);
    if (!shop) throw Errors.notFound('매장');
    auditBefore({ isFounder: shop.isFounder, planType: shop.planType, storageQuotaMb: shop.storageQuotaMb });
    if (dto.isFounder !== undefined) {
      shop.isFounder = dto.isFounder ? 1 : 0;
      if (dto.isFounder) shop.planType = PlanType.FOUNDER;
      else if (shop.planType === PlanType.FOUNDER) shop.planType = PlanType.FREE;
    }
    if (dto.storageQuotaMb !== undefined) shop.storageQuotaMb = dto.storageQuotaMb;
    await this.shops.save(shop);
    return this.shopDetail(id);
  }

  async aiUsage(month = thisMonth()): Promise<AiUsageReport> {
    const [from, to] = monthBounds(month);
    const [tot, shops, days] = await Promise.all([
      this.ds.query(`SELECT ${USAGE_COLS} FROM ai_usage_log a WHERE a.createdAt >= ? AND a.createdAt < ?`, [from, to]),
      this.ds.query(
        `SELECT a.shopId, s.name shopName, COUNT(DISTINCT a.voiceRecordId) voiceCount, ${USAGE_COLS}
           FROM ai_usage_log a JOIN shop s ON s.id = a.shopId
          WHERE a.createdAt >= ? AND a.createdAt < ?
          GROUP BY a.shopId, s.name ORDER BY costKrw DESC, calls DESC`,
        [from, to],
      ),
      this.ds.query(
        `SELECT DATE_FORMAT(a.createdAt, '%Y-%m-%d') date, COUNT(*) calls, SUM(a.isSuccess = 0) failures, COALESCE(SUM(a.costKrw), 0) costKrw
           FROM ai_usage_log a WHERE a.createdAt >= ? AND a.createdAt < ? GROUP BY date ORDER BY date`,
        [from, to],
      ),
    ]);
    return {
      month,
      totals: toUsage(tot[0]),
      shops: shops.map((s: any) => ({ shopId: n(s.shopId), shopName: s.shopName, voiceCount: n(s.voiceCount), ...toUsage(s) })),
      days: days.map((d: any) => ({ date: d.date, calls: n(d.calls), failures: n(d.failures), costKrw: Math.round(n(d.costKrw)) })),
    };
  }

  async auditLogs(p: { shopId?: number; targetTable?: string; targetId?: number; action?: string; page?: number; size?: number }): Promise<{ items: AuditItem[]; total: number }> {
    const where: string[] = ['1 = 1'];
    const args: unknown[] = [];
    if (p.shopId) (where.push('l.shopId = ?'), args.push(p.shopId));
    if (p.targetTable) (where.push('l.targetTable = ?'), args.push(p.targetTable));
    if (p.targetId) (where.push('l.targetId = ?'), args.push(p.targetId));
    if (p.action) (where.push('l.action = ?'), args.push(p.action));
    const size = Math.min(Math.max(p.size ?? 50, 1), 200);
    const page = Math.max(p.page ?? 1, 1);
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT l.*, s.name shopName,
                CASE l.actorType WHEN 'SHOP' THEN su.name WHEN 'ADMIN' THEN au.name ELSE NULL END actorName
           FROM audit_log l
           LEFT JOIN shop s ON s.id = l.shopId
           LEFT JOIN shop_user su ON l.actorType = 'SHOP' AND su.id = l.actorId
           LEFT JOIN admin_user au ON l.actorType = 'ADMIN' AND au.id = l.actorId
          WHERE ${where.join(' AND ')}
          ORDER BY l.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
        args,
      ),
      this.ds.query(`SELECT COUNT(*) n FROM audit_log l WHERE ${where.join(' AND ')}`, args),
    ]);
    const json = (v: unknown) => {
      if (v == null) return null;
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    };
    return {
      total: n(cnt[0].n),
      items: rows.map((r: any) => ({
        id: n(r.id),
        shopId: r.shopId == null ? null : n(r.shopId),
        shopName: r.shopName ?? null,
        actorType: r.actorType,
        actorId: r.actorId == null ? null : n(r.actorId),
        actorName: r.actorName ?? null,
        action: r.action,
        targetTable: r.targetTable,
        targetId: r.targetId == null ? null : n(r.targetId),
        beforeData: json(r.beforeData),
        afterData: json(r.afterData),
        ip: r.ip,
        createdAt: iso(r.createdAt)!,
      })),
    };
  }
}
