'use client';

import { TAG_COLORS, type TagItem } from '@beauty-crm/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TagChip } from '../../../../components/customers/TagChip';
import { Alert, Button, Empty, Field } from '../../../../components/ui';
import { api } from '../../../../lib/api';

export default function TagSettingsPage() {
  const [tags, setTags] = useState<TagItem[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => api<TagItem[]>('/tags').then(setTags), []);
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

  return (
    <div className="page">
      <header className="page-head">
        <Link href="/settings" className="back">
          ← 설정
        </Link>
        <h1>고객 태그</h1>
        <p className="muted">"두피 민감", "탈색 이력"처럼 고객에게 붙이는 표시예요. 고객 목록에서 태그로 골라 볼 수 있어요.</p>
      </header>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className="card">
        <div className="row-end">
          <Field label="새 태그" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예) 알레르기 주의" maxLength={30} />
          <Button
            variant="ghost"
            disabled={!newName.trim()}
            onClick={() =>
              run(async () => {
                await api('/tags', { method: 'POST', body: { name: newName.trim() } });
                setNewName('');
              }, '태그를 만들었습니다.')
            }
          >
            추가
          </Button>
        </div>

        {tags && tags.length === 0 && <Empty title="아직 태그가 없어요" />}
        <ul className="list">
          {tags?.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="list-row editing">
                <div className="menu-editor">
                  <Field label="태그 이름" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={30} />
                  <p className="label">색상</p>
                  <div className="swatches" role="radiogroup" aria-label="태그 색상">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={color === c}
                        aria-label={c}
                        className={`swatch ${color === c ? 'on' : ''}`}
                        style={{ background: c }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                  <div className="form-actions">
                    <Button
                      variant="danger"
                      className="btn-sm push-left"
                      onClick={() =>
                        window.confirm(`"${t.name}" 태그를 삭제할까요?\n고객 ${t.customerCount ?? 0}명에게서도 빠집니다.`) &&
                        run(() => api(`/tags/${t.id}`, { method: 'DELETE' }), `"${t.name}" 태그를 삭제했습니다.`)
                      }
                    >
                      삭제
                    </Button>
                    <Button variant="ghost" className="btn-sm" onClick={() => setEditing(null)}>
                      취소
                    </Button>
                    <Button className="btn-sm" disabled={!name.trim()} onClick={() => run(() => api(`/tags/${t.id}`, { method: 'PATCH', body: { name: name.trim(), color } }))}>
                      저장
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={t.id} className="list-row">
                <span className="list-main">
                  <TagChip tag={t} />
                  <span className="muted small">고객 {t.customerCount ?? 0}명</span>
                </span>
                <Button
                  variant="ghost"
                  className="btn-sm"
                  onClick={() => {
                    setName(t.name);
                    setColor(t.color);
                    setEditing(t.id);
                  }}
                >
                  수정
                </Button>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
