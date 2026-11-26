/**
 * 어떤 요청을 어떤 이름으로 남길지.
 * key: "METHOD 경로(/api 뒤, Nest 라우트 그대로)"  → 대상 테이블 · 동작
 * 여기 없는 변경 요청(POST/PUT/PATCH/DELETE)도 기본 규칙으로 남는다.
 */
export interface AuditRule {
  table: string;
  action: string;
}

export const AUDIT_SKIP = new Set([
  'POST /auth/refresh',
  'POST /auth/logout',
  'PATCH /me/settings', // 글자 크기 등 개인 화면 설정
]);

export const AUDIT_RULES: Record<string, AuditRule> = {
  'POST /auth/signup': { table: 'shop', action: 'SIGNUP' },
  'POST /auth/join': { table: 'shop_user', action: 'JOIN' },
  'POST /auth/login': { table: 'shop_user', action: 'LOGIN' },
  'POST /auth/password': { table: 'shop_user', action: 'CHANGE_PASSWORD' },
  'POST /admin/auth/login': { table: 'admin_user', action: 'LOGIN' },
  'POST /admin/shops/:id/approve': { table: 'shop', action: 'APPROVE' },
  'POST /admin/shops/:id/suspend': { table: 'shop', action: 'SUSPEND' },
  'POST /admin/shops/:id/reset-owner-password': { table: 'shop_user', action: 'RESET_PASSWORD' },
  'PATCH /admin/shops/:id': { table: 'shop', action: 'UPDATE' },
  'PATCH /admin/feedback/:id': { table: 'feedback', action: 'REPLY' },
  'POST /invites': { table: 'shop_invite', action: 'CREATE' },
  'DELETE /invites/:id': { table: 'shop_invite', action: 'DELETE' },
  'PATCH /shop': { table: 'shop', action: 'UPDATE' },
  'PATCH /staff/:id': { table: 'shop_user', action: 'UPDATE' },
  'DELETE /staff/:id': { table: 'shop_user', action: 'DELETE' },
  'POST /staff/:id/reset-password': { table: 'shop_user', action: 'RESET_PASSWORD' },
  'POST /customers': { table: 'customer', action: 'CREATE' },
  'PATCH /customers/:id': { table: 'customer', action: 'UPDATE' },
  'DELETE /customers/:id': { table: 'customer', action: 'DELETE' },
  'POST /treatments': { table: 'treatment', action: 'CREATE' },
  'PUT /treatments/:id': { table: 'treatment', action: 'UPDATE' },
  'DELETE /treatments/:id': { table: 'treatment', action: 'DELETE' },
  'POST /payments': { table: 'payment', action: 'CREATE' },
  'POST /payments/:id/cancel': { table: 'payment', action: 'CANCEL' },
  'POST /prepaid-passes': { table: 'prepaid_pass', action: 'CREATE' },
  'POST /prepaid-passes/:id/adjust': { table: 'prepaid_pass', action: 'ADJUST' },
  'POST /prepaid-passes/:id/refund': { table: 'prepaid_pass', action: 'REFUND' },
  'PUT /settlements/daily/:date/closing': { table: 'daily_closing', action: 'CLOSE' },
  'POST /voice-records': { table: 'voice_record', action: 'CREATE' },
  'POST /voice-records/text': { table: 'voice_record', action: 'CREATE' },
  'DELETE /voice-records/:id': { table: 'voice_record', action: 'DELETE' },
  'POST /feedback': { table: 'feedback', action: 'CREATE' },
};

const RESOURCE_TABLE: Record<string, string> = {
  customers: 'customer',
  treatments: 'treatment',
  payments: 'payment',
  'prepaid-passes': 'prepaid_pass',
  settlements: 'daily_closing',
  staff: 'shop_user',
  shop: 'shop',
  shops: 'shop',
  menus: 'service_menu',
  tags: 'tag',
  invites: 'shop_invite',
  'voice-records': 'voice_record',
  feedback: 'feedback',
};

const METHOD_ACTION: Record<string, string> = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

/** 규칙에 없는 변경 요청 → 경로에서 짐작 (예: POST /voice-records/:id/retry → voice_record RETRY) */
export function ruleFor(method: string, route: string): AuditRule {
  const hit = AUDIT_RULES[`${method} ${route}`];
  if (hit) return hit;
  const segs = route.split('/').filter(Boolean);
  const base = segs[0] === 'admin' ? segs.slice(1) : segs;
  const resource = base[0] ?? 'unknown';
  let table = RESOURCE_TABLE[resource] ?? resource.replace(/-/g, '_');
  if (resource === 'menus' && base[1] === 'categories') table = 'service_category';
  const last = base[base.length - 1];
  const verb = base.length > 1 && last && !last.startsWith(':') && last !== base[0] && method === 'POST' ? last : null;
  const action = (verb ? verb.replace(/-/g, '_').toUpperCase() : METHOD_ACTION[method]) ?? method;
  return { table: table.slice(0, 50), action: action.slice(0, 20) };
}
