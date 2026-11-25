'use client';

import type { ServiceCategoryItem, ServiceMenuItem } from '@beauty-crm/shared';
import { formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Field } from '../../../../components/ui';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { parsePrice, priceText } from '../../../../lib/format';

type Draft = { name: string; price: string; minutes: string; aliases: string; isActive: boolean };
const emptyDraft: Draft = { name: '', price: '', minutes: '', aliases: '', isActive: true };
const toDraft = (m: ServiceMenuItem): Draft => ({
  name: m.name,
  price: priceText(m.basePrice),
  minutes: m.durationMin ? String(m.durationMin) : '',
  aliases: m.aliases ?? '',
  isActive: m.isActive,
});

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 메뉴 1개 수정·추가 폼 */
function MenuEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew?: boolean;
}) {
  const price = parsePrice(draft.price);
  return (
    <div className="menu-editor">
      <Field label="시술 이름" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} autoFocus maxLength={100} />
      <div className="grid-2 tight">
        <Field
          label="가격 (원)"
          value={draft.price}
          onChange={(e) => onChange({ ...draft, price: priceText(parsePrice(e.target.value)) })}
          inputMode="numeric"
          placeholder="예) 40,000"
        />
        <Field
          label="소요 시간 (분, 선택)"
          value={draft.minutes}
          onChange={(e) => onChange({ ...draft, minutes: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          inputMode="numeric"
          placeholder="예) 60"
        />
      </div>
      <Field
        label="다르게 부르는 이름 (선택)"
        value={draft.aliases}
        onChange={(e) => onChange({ ...draft, aliases: e.target.value })}
        hint="쉼표로 구분. 음성으로 기록할 때 이 이름으로 말해도 이 메뉴로 알아들어요. (예: 뿌염, 뿌리 염색)"
        maxLength={255}
      />
      {!isNew && (
        <label className="check">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => onChange({ ...draft, isActive: e.target.checked })} />
          <span>판매 중 (끄면 기록할 때 목록에서 숨겨요)</span>
        </label>
      )}
      <div className="form-actions">
        {onDelete && (
          <Button type="button" variant="danger" className="btn-sm push-left" onClick={onDelete}>
            삭제
          </Button>
        )}
        <Button type="button" variant="ghost" className="btn-sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="button" className="btn-sm" onClick={onSave} disabled={!draft.name.trim() || price === null}>
          {isNew ? '추가' : '저장'}
        </Button>
      </div>
    </div>
  );
}

export default function MenuSettingsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [tree, setTree] = useState<ServiceCategoryItem[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 'm:12' | 'new:3' | 'cat:3'
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [catName, setCatName] = useState('');
  const [newCat, setNewCat] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => api<ServiceCategoryItem[]>('/menus').then(setTree), []);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      setEditing(null);
      await load();
      if (ok) setMsg({ kind: 'ok', text: ok });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const body = (d: Draft) => ({
    name: d.name.trim(),
    basePrice: parsePrice(d.price) ?? 0,
    durationMin: d.minutes ? Number(d.minutes) : null,
    aliases: d.aliases.trim() || null,
  });

  if (!tree) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  return (
    <div className="page">
      <header className="page-head">
        <Link href="/settings" className="back">
          ← 설정
        </Link>
        <h1>시술 메뉴 · 가격표</h1>
        <p className="muted">
          {isOwner
            ? '처음 들어 있는 메뉴는 예시 가격이에요. 우리 매장 가격으로 바꿔 주세요.'
            : '가격표는 원장님만 바꿀 수 있습니다.'}
        </p>
      </header>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {tree.length === 0 && (
        <section className="card">
          <Empty title="등록된 메뉴가 없어요" desc="기본 메뉴(커트·펌·염색·클리닉)를 넣고 가격만 고쳐서 쓰면 편해요." />
          {isOwner && (
            <Button className="btn-block" onClick={() => run(() => api('/menus/seed-defaults', { method: 'POST' }), '기본 메뉴를 넣었습니다.')}>
              기본 메뉴 넣기
            </Button>
          )}
        </section>
      )}

      <div className="stack">
        {tree.map((cat, ci) => (
          <section key={cat.id} className="card">
            <header className="card-head">
              {editing === `cat:${cat.id}` ? (
                <div className="row-end grow">
                  <Field label="분류 이름" value={catName} onChange={(e) => setCatName(e.target.value)} autoFocus maxLength={50} />
                  <Button variant="ghost" className="btn-sm" onClick={() => setEditing(null)}>
                    취소
                  </Button>
                  <Button
                    className="btn-sm"
                    disabled={!catName.trim()}
                    onClick={() => run(() => api(`/menus/categories/${cat.id}`, { method: 'PATCH', body: { name: catName.trim() } }))}
                  >
                    저장
                  </Button>
                </div>
              ) : (
                <>
                  <h2>{cat.name}</h2>
                  {isOwner && (
                    <div className="list-actions">
                      <Button
                        variant="ghost"
                        className="btn-sm btn-icon"
                        aria-label={`${cat.name} 위로`}
                        disabled={ci === 0}
                        onClick={() => run(() => api('/menus/categories/order', { method: 'PUT', body: { ids: move(tree, ci, -1).map((c) => c.id) } }))}
                      >
                        ▲
                      </Button>
                      <Button
                        variant="ghost"
                        className="btn-sm btn-icon"
                        aria-label={`${cat.name} 아래로`}
                        disabled={ci === tree.length - 1}
                        onClick={() => run(() => api('/menus/categories/order', { method: 'PUT', body: { ids: move(tree, ci, 1).map((c) => c.id) } }))}
                      >
                        ▼
                      </Button>
                      <Button
                        variant="ghost"
                        className="btn-sm"
                        onClick={() => {
                          setCatName(cat.name);
                          setEditing(`cat:${cat.id}`);
                        }}
                      >
                        이름
                      </Button>
                      <Button
                        variant="danger"
                        className="btn-sm"
                        onClick={() =>
                          window.confirm(`"${cat.name}" 분류와 안의 메뉴 ${cat.menus.length}개를 삭제할까요?\n이미 남긴 시술 기록은 그대로 보관됩니다.`) &&
                          run(() => api(`/menus/categories/${cat.id}`, { method: 'DELETE' }), `"${cat.name}" 분류를 삭제했습니다.`)
                        }
                      >
                        삭제
                      </Button>
                    </div>
                  )}
                </>
              )}
            </header>

            <ul className="list">
              {cat.menus.map((m, mi) =>
                editing === `m:${m.id}` ? (
                  <li key={m.id} className="list-row editing">
                    <MenuEditor
                      draft={draft}
                      onChange={setDraft}
                      onCancel={() => setEditing(null)}
                      onSave={() =>
                        run(() => api(`/menus/items/${m.id}`, { method: 'PATCH', body: { ...body(draft), isActive: draft.isActive } }), `"${draft.name.trim()}" 저장했습니다.`)
                      }
                      onDelete={() =>
                        window.confirm(`"${m.name}" 메뉴를 삭제할까요?`) && run(() => api(`/menus/items/${m.id}`, { method: 'DELETE' }), `"${m.name}" 삭제했습니다.`)
                      }
                    />
                  </li>
                ) : (
                  <li key={m.id} className={`list-row menu-row ${m.isActive ? '' : 'inactive'}`}>
                    <button
                      type="button"
                      className="menu-main"
                      disabled={!isOwner}
                      onClick={() => {
                        setDraft(toDraft(m));
                        setEditing(`m:${m.id}`);
                      }}
                    >
                      <b>
                        {m.name}
                        {!m.isActive && <span className="badge badge-warn">판매 중지</span>}
                      </b>
                      <span className="muted small">
                        {m.durationMin ? `${m.durationMin}분` : ''}
                        {m.aliases ? `${m.durationMin ? ' · ' : ''}${m.aliases.split(',').map((a) => a.trim()).join(', ')}` : ''}
                      </span>
                    </button>
                    <span className="menu-price">{formatWon(m.basePrice)}</span>
                    {isOwner && (
                      <span className="list-actions">
                        <Button
                          variant="ghost"
                          className="btn-sm btn-icon"
                          aria-label={`${m.name} 위로`}
                          disabled={mi === 0}
                          onClick={() => run(() => api(`/menus/categories/${cat.id}/order`, { method: 'PUT', body: { ids: move(cat.menus, mi, -1).map((x) => x.id) } }))}
                        >
                          ▲
                        </Button>
                        <Button
                          variant="ghost"
                          className="btn-sm btn-icon"
                          aria-label={`${m.name} 아래로`}
                          disabled={mi === cat.menus.length - 1}
                          onClick={() => run(() => api(`/menus/categories/${cat.id}/order`, { method: 'PUT', body: { ids: move(cat.menus, mi, 1).map((x) => x.id) } }))}
                        >
                          ▼
                        </Button>
                      </span>
                    )}
                  </li>
                ),
              )}
              {cat.menus.length === 0 && <li className="list-row muted">메뉴가 없어요</li>}
            </ul>

            {isOwner &&
              (editing === `new:${cat.id}` ? (
                <MenuEditor
                  isNew
                  draft={draft}
                  onChange={setDraft}
                  onCancel={() => setEditing(null)}
                  onSave={() => run(() => api('/menus/items', { method: 'POST', body: { categoryId: cat.id, ...body(draft) } }), `"${draft.name.trim()}" 추가했습니다.`)}
                />
              ) : (
                <Button
                  variant="ghost"
                  className="btn-block"
                  onClick={() => {
                    setDraft(emptyDraft);
                    setEditing(`new:${cat.id}`);
                  }}
                >
                  + {cat.name} 메뉴 추가
                </Button>
              ))}
          </section>
        ))}

        {isOwner && tree.length > 0 && (
          <section className="card">
            <div className="row-end">
              <Field label="새 분류" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="예) 남성 전용, 이벤트" maxLength={50} />
              <Button
                variant="ghost"
                disabled={!newCat.trim()}
                onClick={() =>
                  run(async () => {
                    await api('/menus/categories', { method: 'POST', body: { name: newCat.trim() } });
                    setNewCat('');
                  }, '분류를 추가했습니다.')
                }
              >
                추가
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
