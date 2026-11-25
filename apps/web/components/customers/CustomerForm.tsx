'use client';

import type { CustomerDetail, CustomerInput, CustomerListItem, Gender, TagItem } from '@beauty-crm/shared';
import { formatPhone } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { typingPhone } from '../../lib/format';
import { Alert, Button, Field } from '../ui';
import { useCustomersReload } from './context';
import { TagChip } from './TagChip';

const GENDERS: { v: Gender | null; label: string }[] = [
  { v: 'F', label: '여성' },
  { v: 'M', label: '남성' },
  { v: null, label: '선택 안 함' },
];

export function CustomerForm({ initial }: { initial?: CustomerDetail }) {
  const router = useRouter();
  const { reload } = useCustomersReload();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ? formatPhone(initial.phone) : '');
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [birthYear, setBirthYear] = useState(initial?.birthYear ? String(initial.birthYear) : '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [consent, setConsent] = useState(!!initial?.consentAt);
  const [tagIds, setTagIds] = useState<number[]>(initial?.tags.map((t) => t.id) ?? []);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTag, setNewTag] = useState('');
  const [dup, setDup] = useState<CustomerListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<TagItem[]>('/tags').then(setTags).catch(() => undefined);
  }, []);

  // 번호를 다 입력하면 이미 등록된 고객인지 바로 알려준다
  useEffect(() => {
    setDup(null);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ phone: digits });
      if (initial) p.set('excludeId', String(initial.id));
      api<{ existing: CustomerListItem | null }>(`/customers/check-phone?${p}`)
        .then((r) => setDup(r.existing))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [phone, initial]);

  const digits = phone.replace(/\D/g, '');
  const phoneErr = digits && !/^0\d{8,10}$/.test(digits) ? '전화번호를 끝까지 입력해 주세요.' : null;
  const yearNum = birthYear ? Number(birthYear) : null;
  const yearErr = yearNum && (yearNum < 1900 || yearNum > new Date().getFullYear()) ? '출생연도를 확인해 주세요. (예: 1975)' : null;
  const nameErr = !name.trim() ? '고객 이름을 입력해 주세요.' : null;

  async function addTag() {
    const n = newTag.trim();
    if (!n) return;
    try {
      const t = await api<TagItem>('/tags', { method: 'POST', body: { name: n } });
      setTags([...tags, t]);
      setTagIds([...tagIds, t.id]);
      setNewTag('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameErr || phoneErr || yearErr || dup) return;
    setBusy(true);
    setError(null);
    const body: CustomerInput = {
      name: name.trim(),
      phone: digits || null,
      gender,
      birthYear: yearNum,
      memo: memo.trim() || null,
      consent,
      tagIds,
    };
    try {
      const saved = initial
        ? await api<CustomerDetail>(`/customers/${initial.id}`, { method: 'PATCH', body })
        : await api<CustomerDetail>('/customers', { method: 'POST', body });
      reload();
      router.replace(`/customers/${saved.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <div className="detail-head">
        <h1>{initial ? '고객 정보 수정' : '새 고객 등록'}</h1>
      </div>
      {error && <Alert>{error}</Alert>}

      <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} error={touched ? nameErr : null} autoComplete="off" autoFocus={!initial} />
      <Field
        label="전화번호"
        value={phone}
        onChange={(e) => setPhone(typingPhone(e.target.value))}
        error={touched ? phoneErr : null}
        inputMode="numeric"
        placeholder="010-1234-5678"
        autoComplete="off"
        hint="뒷자리 4자리로 바로 찾을 수 있어요. 번호는 암호화해서 저장합니다."
      />
      {dup && (
        <Alert kind="info">
          이미 등록된 번호예요: <b>{dup.name}</b> 고객님.{' '}
          <Link href={`/customers/${dup.id}`}>기존 고객 보기</Link>
        </Alert>
      )}

      <p className="label">성별</p>
      <div className="seg seg-3" role="radiogroup" aria-label="성별">
        {GENDERS.map((g) => (
          <button key={g.label} type="button" role="radio" aria-checked={gender === g.v} className={gender === g.v ? 'on' : ''} onClick={() => setGender(g.v)}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="field-gap" />
      <Field
        label="출생연도 (선택)"
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
        error={touched ? yearErr : null}
        inputMode="numeric"
        placeholder="예) 1975"
      />

      <div className="field">
        <label htmlFor="memo">메모</label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="두피 상태, 알레르기, 좋아하는 스타일 등 시술 전에 꼭 확인할 내용"
        />
      </div>

      <p className="label">태그</p>
      <div className="chips-wrap">
        {tags.map((t) => (
          <TagChip key={t.id} tag={t} on={tagIds.includes(t.id)} onClick={() => setTagIds(tagIds.includes(t.id) ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])} />
        ))}
      </div>
      <div className="row-end">
        <Field
          label="새 태그"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="예) 두피 민감"
          maxLength={30}
        />
        <Button type="button" variant="ghost" onClick={addTag} disabled={!newTag.trim()}>
          추가
        </Button>
      </div>

      <label className="check consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>고객님께 개인정보(이름·전화번호·시술 기록) 수집·이용 동의를 받았습니다</span>
      </label>

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" loading={busy}>
          {initial ? '저장' : '등록'}
        </Button>
      </div>
    </form>
  );
}
