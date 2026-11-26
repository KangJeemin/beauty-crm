import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

/** 비밀번호·토큰·전화번호 원문은 이력에 남기지 않는다 */
const SECRET_KEYS = new Set([
  'password', 'passwordHash', 'newPassword', 'currentPassword', 'tempPassword',
  'accessToken', 'refreshToken', 'token', 'inviteCode',
  'phone', 'phoneEnc', 'phoneHash',
]);
const MAX_JSON = 16_000;

export function sanitize(v: unknown, depth = 0): unknown {
  if (v == null || typeof v !== 'object') return v;
  if (v instanceof Date) return v.toISOString();
  if (depth > 5) return '…';
  if (Array.isArray(v)) {
    const out = v.slice(0, 50).map((x) => sanitize(x, depth + 1));
    if (v.length > 50) out.push(`… 외 ${v.length - 50}개`);
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) continue;
    if (typeof x === 'function') continue;
    out[k] = sanitize(x, depth + 1);
  }
  return out;
}

function clip(v: unknown): unknown {
  if (v === undefined) return null;
  const s = sanitize(v);
  const json = JSON.stringify(s);
  if (json === undefined) return null;
  return json.length > MAX_JSON ? { truncated: true, preview: json.slice(0, 2000) } : s;
}

export interface AuditEntry {
  shopId: number | null;
  actorType: 'SHOP' | 'ADMIN' | 'SYSTEM';
  actorId: number | null;
  action: string;
  targetTable: string;
  targetId: number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  /** 실패해도 본 요청에는 영향 없음 */
  async write(e: AuditEntry): Promise<void> {
    try {
      await this.logs.insert({
        shopId: e.shopId,
        actorType: e.actorType,
        actorId: e.actorId,
        action: e.action,
        targetTable: e.targetTable,
        targetId: e.targetId,
        beforeData: clip(e.before) as any,
        afterData: clip(e.after) as any,
        ip: e.ip?.slice(0, 45) ?? null,
        userAgent: e.userAgent?.slice(0, 255) ?? null,
      });
    } catch (err) {
      this.logger.warn(`변경 이력 기록 실패: ${(err as Error).message}`);
    }
  }
}
