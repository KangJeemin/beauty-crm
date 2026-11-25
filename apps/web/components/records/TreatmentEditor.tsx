'use client';

import type {
  CustomerCandidate, RecipeInput, ServiceCategoryItem, StaffItem, TreatmentDetail, TreatmentItemInput, TreatmentSaveInput,
} from '@beauty-crm/shared';
import { formatWon } from '@beauty-crm/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { parsePrice, priceText } from '../../lib/format';
import { Alert, Button, Field } from '../ui';
import { CustomerPicker, PickedCustomer } from './CustomerPicker';

export interface EditorInitial {
  customer: PickedCustomer | null;
  items: TreatmentItemInput[];
  note: string | null;
  designerId?: number;
  treatedAt?: string;
  /** AI 가 들은 총액 (항목 합계와 다르면 알려줌) */
  heardTotal?: number | null;
  suggestedName?: string | null;
}

type RecipeDraft = Record<keyof RecipeInput, string>;
type ItemDraft = { serviceMenuId: number | null; menuName: string; price: string; recipes: RecipeDraft[]; more: boolean };

const RECIPE_KEYS: (keyof RecipeInput)[] = ['area', 'productName', 'colorCode', 'developerPct', 'mixRatio', 'processingMin', 'amountGram', 'rodSize', 'heatTemp', 'memo'];
const MAIN_FIELDS: { k: keyof RecipeInput; label: string; ph: string; num?: boolean }[] = [
  { k: 'area', label: '부위', ph: '뿌리' },
  { k: 'colorCode', label: '컬러', ph: '7N' },
  { k: 'developerPct', label: '산화제 %', ph: '6', num: true },
  { k: 'mixRatio', label: '비율', ph: '1:1' },
  { k: 'processingMin', label: '방치(분)', ph: '30', num: true },
  { k: 'productName', label: '약제', ph: '제품명' },
];
const MORE_FIELDS: { k: keyof RecipeInput; label: string; ph: string; num?: boolean }[] = [
  { k: 'amountGram', label: '사용량(g)', ph: '60', num: true },
  { k: 'rodSize', label: '로드', ph: '7호' },
  { k: 'heatTemp', label: '온도(℃)', ph: '80', num: true },
  { k: 'memo', label: '메모', ph: '' },
];

const emptyRecipe = (): RecipeDraft => Object.fromEntries(RECIPE_KEYS.map((k) => [k, ''])) as RecipeDraft;
const toRecipeDraft = (r: RecipeInput): RecipeDraft =>
  Object.fromEntries(RECIPE_KEYS.map((k) => [k, r[k] == null ? '' : String(r[k])])) as RecipeDraft;
const toItemDraft = (i: TreatmentItemInput): ItemDraft => ({
  serviceMenuId: i.serviceMenuId ?? null,
  menuName: i.menuName,
  price: priceText(i.price),
  recipes: i.recipes.map(toRecipeDraft),
  more: i.recipes.some((r) => r.amountGram != null || r.rodSize || r.heatTemp != null || r.memo),
});

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const n = (v: string, int = false) => {
  const x = Number(v.replace(/[^\d.]/g, ''));
  return v.trim() === '' || !Number.isFinite(x) ? null : int ? Math.round(x) : Math.round(x * 10) / 10;
};

/**
 * 시술 기록 입력·검토 화면 (AI 정리 결과 검토 / 지난번 복사 / 직접 입력 / 수정 공용)
 */
export function TreatmentEditor({
  initial,
  candidates = [],
  voiceRecordId,
  copiedFromId,
  treatmentId,
  onDeleted,
}: {
  initial: EditorInitial;
  candidates?: CustomerCandidate[];
  voiceRecordId?: number;
  copiedFromId?: number;
  treatmentId?: number;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initial.customer);
  const [items, setItems] = useState<ItemDraft[]>(initial.items.length ? initial.items.map(toItemDraft) : []);
  const [note, setNote] = useState(initial.note ?? '');
  const [designerId, setDesignerId] = useState<number>(initial.designerId ?? user?.id ?? 0);
  const [treatedAt, setTreatedAt] = useState(toLocalInput(initial.treatedAt));
  const [menus, setMenus] = useState<ServiceCategoryItem[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ServiceCategoryItem[]>('/menus').then(setMenus).catch(() => undefined);
    api<StaffItem[]>('/staff').then((s) => setStaff(s.filter((x) => x.status === 'ACTIVE'))).catch(() => undefined);
  }, []);

  const allMenus = useMemo(() => menus.flatMap((c) => c.menus.filter((m) => m.isActive).map((m) => ({ ...m, category: c.name }))), [menus]);
  const total = items.reduce((a, i) => a + (parsePrice(i.price) ?? 0), 0);

  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const setRecipe = (i: number, r: number, k: keyof RecipeInput, v: string) =>
    setItem(i, { recipes: items[i].recipes.map((rc, j) => (j === r ? { ...rc, [k]: v } : rc)) });

  function pickMenu(i: number, value: string) {
    if (value === '') return setItem(i, { serviceMenuId: null });
    const m = allMenus.find((x) => String(x.id) === value);
    if (m) setItem(i, { serviceMenuId: m.id, menuName: m.name, price: items[i].price || priceText(m.basePrice) });
  }

  async function save() {
    setError(null);
    if (!customer) return setError('고객을 선택해 주세요.');
    if (!items.length) return setError('시술을 하나 이상 입력해 주세요.');
    if (items.some((i) => !i.menuName.trim())) return setError('시술 이름이 비어 있는 항목이 있어요.');
    const body: TreatmentSaveInput = {
      customerId: customer.id,
      designerId: designerId || undefined,
      treatedAt: new Date(treatedAt).toISOString(),
      voiceRecordId: voiceRecordId ?? null,
      copiedFromId: copiedFromId ?? null,
      note: note.trim() || null,
      items: items.map((it) => ({
        serviceMenuId: it.serviceMenuId,
        menuName: it.menuName.trim(),
        price: parsePrice(it.price) ?? 0,
        recipes: it.recipes.map((r) => ({
          area: r.area.trim() || null,
          productName: r.productName.trim() || null,
          colorCode: r.colorCode.trim() || null,
          mixRatio: r.mixRatio.trim() || null,
          developerPct: n(r.developerPct),
          amountGram: n(r.amountGram),
          processingMin: n(r.processingMin, true),
          rodSize: r.rodSize.trim() || null,
          heatTemp: n(r.heatTemp, true),
          memo: r.memo.trim() || null,
        })),
      })),
    };
    setBusy(true);
    try {
      const t = treatmentId
        ? await api<TreatmentDetail>(`/treatments/${treatmentId}`, { method: 'PUT', body })
        : await api<TreatmentDetail>('/treatments', { method: 'POST', body });
      router.replace(`/customers/${t.customerId}?saved=${t.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!treatmentId || !window.confirm('이 시술 기록을 삭제할까요?')) return;
    try {
      await api(`/treatments/${treatmentId}`, { method: 'DELETE' });
      onDeleted?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="stack editor">
      <section className="card">
        <h2 className="sec-title">고객</h2>
        <CustomerPicker value={customer} onChange={setCustomer} candidates={candidates} suggestedName={initial.suggestedName} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>시술 내용</h2>
          <span className="total">{formatWon(total)}</span>
        </div>
        {initial.heardTotal && initial.heardTotal !== total && items.length > 0 && (
          <Alert kind="info">
            말씀하신 총액은 <b>{formatWon(initial.heardTotal)}</b>이에요. 항목 금액을 확인해 주세요.
          </Alert>
        )}

        {items.map((it, i) => (
          <div key={i} className="item-card">
            <div className="item-top">
              <div className="field grow">
                <label htmlFor={`menu-${i}`}>시술</label>
                <select id={`menu-${i}`} value={it.serviceMenuId ?? ''} onChange={(e) => pickMenu(i, e.target.value)} className="select-lg">
                  <option value="">{it.serviceMenuId ? '직접 입력' : it.menuName ? `직접 입력: ${it.menuName}` : '메뉴 고르기'}</option>
                  {menus.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {c.menus
                        .filter((m) => m.isActive || m.id === it.serviceMenuId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {formatWon(m.basePrice)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <Button variant="ghost" className="btn-sm btn-icon" aria-label={`${it.menuName || '시술'} 빼기`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
            <div className="grid-2 tight">
              {!it.serviceMenuId && <Field label="시술 이름" value={it.menuName} onChange={(e) => setItem(i, { menuName: e.target.value })} maxLength={100} />}
              <Field label="금액 (원)" value={it.price} onChange={(e) => setItem(i, { price: priceText(parsePrice(e.target.value)) })} inputMode="numeric" />
            </div>

            {it.recipes.map((r, ri) => (
              <div key={ri} className="recipe">
                <div className="recipe-head">
                  <span className="label">레시피 {it.recipes.length > 1 ? ri + 1 : ''}</span>
                  <button type="button" className="link-btn" onClick={() => setItem(i, { recipes: it.recipes.filter((_, j) => j !== ri) })}>
                    빼기
                  </button>
                </div>
                <div className="recipe-grid">
                  {[...MAIN_FIELDS, ...(it.more ? MORE_FIELDS : [])].map((f) => (
                    <Field
                      key={f.k}
                      label={f.label}
                      value={r[f.k]}
                      placeholder={f.ph}
                      inputMode={f.num ? 'decimal' : undefined}
                      onChange={(e) => setRecipe(i, ri, f.k, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="item-actions">
              <button type="button" className="link-btn" onClick={() => setItem(i, { recipes: [...it.recipes, emptyRecipe()] })}>
                + 레시피 추가
              </button>
              {it.recipes.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setItem(i, { more: !it.more })}>
                  {it.more ? '간단히' : '사용량·로드·온도'}
                </button>
              )}
            </div>
          </div>
        ))}
        <Button variant="ghost" className="btn-block" onClick={() => setItems([...items, { serviceMenuId: null, menuName: '', price: '', recipes: [], more: false }])}>
          + 시술 추가
        </Button>
      </section>

      <section className="card">
        <div className="field">
          <label htmlFor="note">메모 (두피 상태, 고객 요청, 다음 방문 참고)</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
        </div>
        <div className="grid-2 tight">
          <div className="field">
            <label htmlFor="designer">담당</label>
            <select id="designer" className="select-lg" value={designerId} onChange={(e) => setDesignerId(Number(e.target.value))}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="시술 일시" type="datetime-local" value={treatedAt} onChange={(e) => setTreatedAt(e.target.value)} />
        </div>
      </section>

      {error && <Alert>{error}</Alert>}
      <div className="save-bar">
        {treatmentId && (
          <Button variant="danger" onClick={remove}>
            삭제
          </Button>
        )}
        <Button className="grow" onClick={save} loading={busy}>
          {treatmentId ? '수정 내용 저장' : `${formatWon(total)} · 시술 기록 저장`}
        </Button>
      </div>
    </div>
  );
}
