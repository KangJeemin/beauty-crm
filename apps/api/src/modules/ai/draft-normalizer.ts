import { AiDraft, RecipeInput, TreatmentItemInput } from '@beauty-crm/shared';

export interface MenuRef {
  id: number;
  name: string;
  aliases: string[];
  basePrice: number;
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown, min: number, max: number, int = false): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null; // 0 = "없음"
  const c = Math.min(Math.max(n, min), max);
  return int ? Math.round(c) : Math.round(c * 10) / 10;
};
const key = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 메뉴 이름·별칭으로 매장 메뉴 찾기 (공백 무시) */
export function matchMenu(name: string, menus: MenuRef[]): MenuRef | null {
  const k = key(name);
  return (
    menus.find((m) => key(m.name) === k) ??
    menus.find((m) => m.aliases.some((a) => key(a) === k)) ??
    menus.find((m) => k.length >= 2 && (key(m.name).includes(k) || k.includes(key(m.name)))) ??
    null
  );
}

/**
 * LLM 이 돌려준 JSON 을 믿지 않고 한 번 더 검증·정리한다.
 *  - 타입·길이·범위 보정 (DB 컬럼 크기에 맞춤)
 *  - ""/0 → null
 *  - 메뉴 매칭 → serviceMenuId, 금액이 없으면 메뉴 기본가
 */
export function normalizeDraft(raw: unknown, menus: MenuRef[]): AiDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 10)
    .map((it: any): TreatmentItemInput | null => {
      const menuName = str(it?.menuName, 100);
      if (!menuName) return null;
      const menu = matchMenu(menuName, menus);
      const recipes: RecipeInput[] = (Array.isArray(it?.recipes) ? it.recipes : []).slice(0, 10).map((rc: any) => ({
        area: str(rc?.area, 50),
        productName: str(rc?.productName, 100),
        colorCode: str(rc?.colorCode, 50),
        mixRatio: str(rc?.mixRatio, 50),
        developerPct: num(rc?.developerPct, 0, 99.9),
        amountGram: num(rc?.amountGram, 0, 99999.9),
        processingMin: num(rc?.processingMin, 0, 1440, true),
        rodSize: str(rc?.rodSize, 50),
        heatTemp: num(rc?.heatTemp, 0, 300, true),
        memo: str(rc?.memo, 500),
      }));
      const price = num(it?.price, 0, 10_000_000, true);
      return {
        serviceMenuId: menu?.id ?? null,
        menuName: menu?.name ?? menuName,
        price: price ?? menu?.basePrice ?? 0,
        recipes: recipes.filter((x) => Object.values(x).some((v) => v !== null)),
      };
    })
    .filter((x: TreatmentItemInput | null): x is TreatmentItemInput => !!x);

  const l4 = typeof r.phoneLast4 === 'string' ? r.phoneLast4.replace(/\D/g, '') : '';
  return {
    customerName: str(r.customerName, 50)?.replace(/\s*(고객님|고객|님)$/, '') || null,
    phoneLast4: l4.length === 4 ? l4 : null,
    items,
    totalPrice: num(r.totalPrice, 0, 100_000_000, true),
    note: str(r.note, 2000),
    summary: str(r.summary, 500),
  };
}
