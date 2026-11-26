import { FeedbackItem, FeedbackStatus } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { auditBefore, auditMeta } from '../../common/audit/audit-context';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { FeedbackCreateDto, FeedbackReplyDto } from './feedback.dto';
import { Feedback } from './feedback.entity';

@Injectable()
export class FeedbackRepository extends TenantRepository<Feedback> {
  constructor(@InjectRepository(Feedback) repo: Repository<Feedback>) {
    super(repo);
  }
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedback: FeedbackRepository,
    private readonly ds: DataSource,
  ) {}

  // ── 매장 사용자 ─────────────────────────────────────

  async create(auth: ShopAuth, dto: FeedbackCreateDto): Promise<FeedbackItem> {
    const f = await this.feedback.save(
      this.feedback.create({ shopId: auth.shopId, userId: auth.userId, category: dto.category, content: dto.content, pageUrl: dto.pageUrl ?? null }),
    );
    return (await this.query({ id: f.id }))[0];
  }

  /** 내가 보낸 의견 (원장은 매장 전체) */
  mine(auth: ShopAuth): Promise<FeedbackItem[]> {
    return this.query(auth.role === 'OWNER' ? { shopId: auth.shopId } : { shopId: auth.shopId, userId: auth.userId });
  }

  // ── 운영자 ──────────────────────────────────────────

  listAll(status?: FeedbackStatus | 'UNDONE'): Promise<FeedbackItem[]> {
    return this.query({ status });
  }

  forShop(shopId: number, limit = 10): Promise<FeedbackItem[]> {
    return this.query({ shopId, limit });
  }

  async openCount(): Promise<number> {
    const r = await this.ds.query(`SELECT COUNT(*) n FROM feedback WHERE delState = 0 AND status <> 'DONE'`);
    return Number(r[0].n);
  }

  async reply(adminId: number, id: number, dto: FeedbackReplyDto): Promise<FeedbackItem> {
    const f = await this.feedback.findOneById(id);
    if (!f) throw Errors.notFound('의견');
    auditBefore({ status: f.status, reply: f.reply });
    auditMeta({ shopId: f.shopId });
    if (dto.reply !== undefined) {
      f.reply = dto.reply || null;
      if (f.reply) {
        f.repliedAt = new Date();
        f.repliedBy = adminId;
        if (!dto.status) f.status = 'DONE';
      }
    }
    if (dto.status) f.status = dto.status;
    await this.feedback.save(f);
    return (await this.query({ id }))[0];
  }

  private async query(p: { id?: number; shopId?: number; userId?: number; status?: FeedbackStatus | 'UNDONE'; limit?: number }): Promise<FeedbackItem[]> {
    const where = ['f.delState = 0'];
    const args: unknown[] = [];
    if (p.id) (where.push('f.id = ?'), args.push(p.id));
    if (p.shopId) (where.push('f.shopId = ?'), args.push(p.shopId));
    if (p.userId) (where.push('f.userId = ?'), args.push(p.userId));
    if (p.status === 'UNDONE') where.push(`f.status <> 'DONE'`);
    else if (p.status) (where.push('f.status = ?'), args.push(p.status));
    const rows = await this.ds.query(
      `SELECT f.*, s.name shopName, u.name userName
         FROM feedback f JOIN shop s ON s.id = f.shopId LEFT JOIN shop_user u ON u.id = f.userId
        WHERE ${where.join(' AND ')}
        ORDER BY (f.status = 'DONE'), f.createdAt DESC, f.id DESC
        LIMIT ${Math.min(p.limit ?? 200, 500)}`,
      args,
    );
    return rows.map((r: any) => ({
      id: Number(r.id),
      shopId: Number(r.shopId),
      shopName: r.shopName,
      userName: r.userName ?? '(삭제된 직원)',
      category: r.category,
      content: r.content,
      pageUrl: r.pageUrl,
      status: r.status,
      reply: r.reply,
      repliedAt: iso(r.repliedAt),
      createdAt: iso(r.createdAt)!,
    }));
  }
}
