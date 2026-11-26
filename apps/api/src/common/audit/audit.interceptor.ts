import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AdminAuth, ShopAuth } from '../auth/auth.types';
import { AuditStore, auditStorage } from './audit-context';
import { AUDIT_SKIP, ruleFor } from './audit-rules';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 성공한 변경 요청을 audit_log 에 남긴다 (전역 인터셉터).
 * - 누가: 토큰의 매장 사용자 / 운영자 (로그인·가입은 응답의 사용자)
 * - 무엇을: 경로 규칙(audit-rules.ts)으로 대상 테이블·동작
 * - 변경 후: 응답 데이터 (비밀번호·토큰·전화번호 제거). 변경 전 값은 서비스가 auditBefore() 로 넣는다.
 * 실패한 요청은 남기지 않는다.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { shopAuth?: ShopAuth; adminAuth?: AdminAuth }>();
    if (!MUTATING.has(req.method)) return next.handle();
    const route = String(req.route?.path ?? req.path).replace(/^\/api/, '') || '/';
    const key = `${req.method} ${route}`;
    if (AUDIT_SKIP.has(key)) return next.handle();

    const store: AuditStore = {};
    return new Observable((sub) =>
      auditStorage.run(store, () =>
        next
          .handle()
          .pipe(tap((data) => void this.record(req, route, data, store)))
          .subscribe(sub),
      ),
    );
  }

  private async record(req: Request & { shopAuth?: ShopAuth; adminAuth?: AdminAuth }, route: string, data: unknown, store: AuditStore) {
    if (store.skip) return;
    const rule = ruleFor(req.method, route);
    // 전역 ResponseInterceptor 가 먼저 { success, data } 로 감쌌을 수 있다
    let body = data instanceof StreamableFile ? null : (data as Record<string, any> | null | undefined);
    if (body && typeof body === 'object' && body.success === true && 'data' in body) body = body.data;

    let actorType: 'SHOP' | 'ADMIN' | 'SYSTEM' = 'SYSTEM';
    let actorId: number | null = null;
    let shopId: number | null = null;
    if (req.shopAuth) {
      actorType = 'SHOP';
      actorId = req.shopAuth.userId;
      shopId = req.shopAuth.shopId;
    } else if (req.adminAuth) {
      actorType = 'ADMIN';
      actorId = req.adminAuth.adminId;
      if (route.startsWith('/admin/shops/:id')) shopId = num(req.params.id);
    } else if (store.actor) {
      actorType = store.actor.type;
      actorId = store.actor.id;
    } else {
      // 로그인 · 가입 · 초대 가입: 응답의 사용자
      const user = body?.user ?? body?.login?.user;
      if (user) {
        actorType = 'SHOP';
        actorId = num(user.id);
        shopId = num(user.shopId);
      } else if (body?.shopId) {
        shopId = num(body.shopId);
      }
    }
    if (store.shopId !== undefined) shopId = store.shopId;

    let targetId = store.targetId ?? num(req.params?.id) ?? num(body?.id);
    if (rule.table === 'shop' && targetId == null) targetId = shopId;
    if (rule.action === 'LOGIN' || rule.action === 'JOIN') targetId = actorId;

    let after: unknown = store.after !== undefined ? store.after : body;
    if (rule.action === 'LOGIN') after = { loginId: req.body?.loginId ?? null };

    await this.audit.write({
      shopId,
      actorType,
      actorId,
      action: rule.action,
      targetTable: rule.table,
      targetId,
      before: store.before,
      after,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
