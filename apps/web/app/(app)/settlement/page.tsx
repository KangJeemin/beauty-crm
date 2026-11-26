'use client';

import type { DailySettlement, MonthlySettlement, PaymentItem } from '@beauty-crm/shared';
import { PAYMENT_METHOD_LABEL, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Field } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { parsePrice, priceText } from '../../../lib/format';

/** 새벽 4시 전이면 어제 영업일 (서버와 같은 기준) */
function today() {
  const d = new Date(Date.now() - 4 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftDay(date: string, n: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

function Diff({ actual, system }: { actual: number | null; system: number }) {
  if (actual == null) return null;
  const d = actual - system;
  return <span className={`diff ${d === 0 ? 'ok' : 'bad'}`}>{d === 0 ? '일치' : `${d > 0 ? '+' : ''}${formatWon(d)}`}</span>;
}

// ── 하루 ─────────────────────────────────────────────

function Daily({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const [d, setD] = useState<DailySettlement | null>(null);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [memo, setMemo] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<DailySettlement>(`/settlements/daily?date=${date}`);
    setD(r);
    setCash(r.closing?.actualCash != null ? priceText(r.closing.actualCash) : '');
    setCard(r.closing?.actualCard != null ? priceText(r.closing.actualCard) : '');
    setMemo(r.closing?.memo ?? '');
  }, [date]);

  useEffect(() => {
    setD(null);
    setMsg(null);
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  async function close() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<DailySettlement>(`/settlements/daily/${date}/closing`, {
        method: 'PUT',
        body: { actualCash: parsePrice(cash) ?? (cash === '0' ? 0 : null), actualCard: parsePrice(card) ?? (card === '0' ? 0 : null), memo: memo.trim() || null },
      });
      setD(r);
      setMsg({ kind: 'ok', text: `${dayLabel(date)} 마감했어요.` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(p: PaymentItem) {
    if (!window.confirm(`${p.customerName ?? ''} ${formatWon(p.finalAmount)} 결제를 취소할까요?\n선불권으로 낸 금액은 잔액으로 돌아갑니다.`)) return;
    try {
      await api(`/payments/${p.id}/cancel`, { method: 'POST' });
      await load();
      setMsg({ kind: 'ok', text: '결제를 취소했어요.' });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  const t = d?.totals;
  const isToday = date === today();

  return (
    <>
      <div className="date-nav">
        <Button variant="ghost" className="btn-icon" aria-label="전날" onClick={() => setDate(shiftDay(date, -1))}>
          ◀
        </Button>
        <label className="date-pick">
          <span>{dayLabel(date)}</span>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜 선택" />
        </label>
        <Button variant="ghost" className="btn-icon" aria-label="다음 날" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))}>
          ▶
        </Button>
        {!isToday && (
          <Button variant="ghost" className="btn-sm" onClick={() => setDate(today())}>
            오늘
          </Button>
        )}
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {!d || !t ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <div className="stack">
          <section className="card money-hero">
            <p className="muted">{isToday ? '오늘' : dayLabel(date)} 들어온 돈</p>
            <p className="hero-num">{formatWon(t.received)}</p>
            <div className="method-sum">
              {(['card', 'cash', 'transfer', 'etc'] as const)
                .filter((k) => k !== 'etc' || t.etc)
                .map((k) => (
                  <div key={k}>
                    <span>{PAYMENT_METHOD_LABEL[k.toUpperCase() as 'CARD']}</span>
                    <b>{formatWon(t[k])}</b>
                  </div>
                ))}
            </div>
            <dl className="sub-sums">
              <div><dt>시술 매출</dt><dd>{formatWon(t.sales)}</dd></div>
              <div><dt>선불권 차감</dt><dd>{formatWon(t.prepaidUsed)}</dd></div>
              <div><dt>선불권 판매</dt><dd>{formatWon(t.passSales)}</dd></div>
              <div><dt>할인</dt><dd>{formatWon(t.discount)}</dd></div>
              {t.passRefunds > 0 && <div><dt>선불권 환불</dt><dd>-{formatWon(t.passRefunds)}</dd></div>}
            </dl>
            <p className="muted small">시술 매출은 선불권으로 낸 금액까지 포함, 들어온 돈은 선불권 판매 포함·선불권 차감 제외예요.</p>
          </section>

          {d.unpaid.length > 0 && (
            <section className="card warn-card">
              <h2 className="sec-title">결제 기록이 없는 시술 {d.unpaid.length}건</h2>
              <ul className="list">
                {d.unpaid.map((u) => (
                  <li key={u.id} className="list-row">
                    <span className="list-main">
                      <b>{u.customerName}</b>
                      <span className="muted small">
                        {time(u.treatedAt)} · {u.summary} · {u.designerName}
                      </span>
                    </span>
                    <Link href={`/payments/new?treatmentId=${u.id}`} className="btn btn-primary btn-sm">
                      {formatWon(u.totalAmount)} 결제
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="sec-title">마감</h2>
            {d.closing && (
              <Alert kind={d.changedSinceClosing ? 'error' : 'ok'}>
                {time(d.closing.closedAt)} {d.closing.closedByName}님이 마감했어요.
                {d.changedSinceClosing && ' 마감 뒤에 결제가 바뀌었어요. 다시 마감해 주세요.'}
              </Alert>
            )}
            <p className="muted small">현금 시재와 카드 단말기 합계를 넣으면 기록과 맞는지 바로 확인할 수 있어요.</p>
            <div className="grid-2 tight">
              <div>
                <Field label={`실제 현금 (기록 ${formatWon(t.cash)})`} value={cash} onChange={(e) => setCash(e.target.value === '0' ? '0' : priceText(parsePrice(e.target.value)))} inputMode="numeric" />
                <Diff actual={parsePrice(cash) ?? (cash === '0' ? 0 : null)} system={t.cash} />
              </div>
              <div>
                <Field label={`카드 단말기 합계 (기록 ${formatWon(t.card)})`} value={card} onChange={(e) => setCard(e.target.value === '0' ? '0' : priceText(parsePrice(e.target.value)))} inputMode="numeric" />
                <Diff actual={parsePrice(card) ?? (card === '0' ? 0 : null)} system={t.card} />
              </div>
            </div>
            <Field label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />
            <Button className="btn-block" onClick={close} loading={busy}>
              {d.closing ? '다시 마감하기' : `${isToday ? '오늘' : dayLabel(date)} 마감하기`}
            </Button>
          </section>

          {d.designers.length > 1 && (
            <section className="card">
              <h2 className="sec-title">담당별 시술 매출</h2>
              <ul className="list">
                {d.designers.map((x) => (
                  <li key={x.designerName} className="list-row">
                    <span className="list-main">
                      <b>{x.designerName}</b>
                      <span className="muted small">{x.count}건</span>
                    </span>
                    <span className="menu-price">{formatWon(x.sales)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="sec-title">결제 내역 {d.payments.filter((p) => p.status === 'PAID').length}건</h2>
            {d.payments.length === 0 && <Empty title="결제 기록이 없어요" />}
            <ul className="list">
              {d.payments.map((p) => (
                <li key={p.id} className={`list-row pay-item ${p.status === 'CANCELLED' ? 'cancelled' : ''}`}>
                  <span className="list-main">
                    <b>
                      {p.customerName ?? '고객 없음'}
                      {p.status === 'CANCELLED' && <span className="badge badge-warn">취소</span>}
                      {p.paymentType === 'PASS_SALE' && <span className="badge">선불권 판매</span>}
                      {p.paymentType === 'PASS_REFUND' && <span className="badge badge-warn">환불</span>}
                    </b>
                    <span className="muted small">
                      {time(p.paidAt)} · {p.summary ?? ''} · {p.details.map((x) => `${PAYMENT_METHOD_LABEL[x.method]} ${formatWon(x.amount)}`).join(', ') || '0원'}
                    </span>
                  </span>
                  <span className="pay-amt">
                    <b>{formatWon(p.finalAmount)}</b>
                    {p.status === 'PAID' && p.paymentType !== 'PASS_REFUND' && (
                      <button type="button" className="link-btn small" onClick={() => cancel(p)}>
                        취소
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

// ── 한 달 ────────────────────────────────────────────

function Monthly({ onPickDay }: { onPickDay: (d: string) => void }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [m, setM] = useState<MonthlySettlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setM(null);
    api<MonthlySettlement>(`/settlements/monthly?month=${month}`).then(setM).catch((e) => setError(e.message));
  }, [month]);

  const max = Math.max(1, ...(m?.days.map((d) => d.received) ?? [1]));
  const thisMonth = today().slice(0, 7);

  return (
    <>
      <div className="date-nav">
        <Button variant="ghost" className="btn-icon" aria-label="전달" onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </Button>
        <span className="date-pick">
          <span>
            {month.slice(0, 4)}년 {Number(month.slice(5))}월
          </span>
        </span>
        <Button variant="ghost" className="btn-icon" aria-label="다음 달" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!m ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <div className="stack">
          <section className="card money-hero">
            <p className="muted">이번 달 들어온 돈</p>
            <p className="hero-num">{formatWon(m.totals.received)}</p>
            <div className="method-sum">
              <div><span>카드</span><b>{formatWon(m.totals.card)}</b></div>
              <div><span>현금</span><b>{formatWon(m.totals.cash)}</b></div>
              <div><span>계좌이체</span><b>{formatWon(m.totals.transfer)}</b></div>
            </div>
            <dl className="sub-sums">
              <div><dt>시술 매출</dt><dd>{formatWon(m.totals.sales)}</dd></div>
              <div><dt>선불권 판매</dt><dd>{formatWon(m.totals.passSales)}</dd></div>
              <div><dt>선불권 차감</dt><dd>{formatWon(m.totals.prepaidUsed)}</dd></div>
              <div><dt>결제 건수</dt><dd>{m.totals.paymentCount}건</dd></div>
            </dl>
          </section>

          <section className="card">
            <h2 className="sec-title">날짜별 들어온 돈</h2>
            <ul className="bars">
              {m.days
                .filter((d) => d.date <= today())
                .map((d) => (
                  <li key={d.date}>
                    <button type="button" className="bar-row" onClick={() => onPickDay(d.date)} aria-label={`${dayLabel(d.date)} ${formatWon(d.received)}`}>
                      <span className="bar-day">
                        {Number(d.date.slice(8))}일{d.closed ? ' ✓' : ''}
                      </span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(d.received / max) * 100}%` }} />
                      </span>
                      <span className="bar-amt">{d.received ? formatWon(d.received) : ''}</span>
                    </button>
                  </li>
                ))}
            </ul>
            <p className="muted small">✓ 마감한 날 · 날짜를 누르면 그날 정산으로 가요.</p>
          </section>

          {m.designers.length > 0 && (
            <section className="card">
              <h2 className="sec-title">담당별 시술 매출</h2>
              <ul className="list">
                {m.designers.map((x) => (
                  <li key={x.designerName} className="list-row">
                    <span className="list-main">
                      <b>{x.designerName}</b>
                      <span className="muted small">{x.count}건</span>
                    </span>
                    <span className="menu-price">{formatWon(x.sales)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {m.menus.length > 0 && (
            <section className="card">
              <h2 className="sec-title">많이 한 시술</h2>
              <ul className="list">
                {m.menus.map((x) => (
                  <li key={x.menuName} className="list-row">
                    <span className="list-main">
                      <b>{x.menuName}</b>
                      <span className="muted small">{x.count}건</span>
                    </span>
                    <span className="menu-price">{formatWon(x.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function SettlementPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'day' | 'month'>('day');
  const [date, setDate] = useState(today());

  if (user?.role !== 'OWNER') {
    return (
      <div className="page">
        <header className="page-head">
          <h1>정산</h1>
        </header>
        <section className="card">
          <Empty title="정산은 원장님만 볼 수 있어요" desc="시술 결제 입력은 고객 화면이나 시술 기록 저장 후에 할 수 있어요." />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>정산</h1>
      </header>
      <div className="seg seg-2" role="tablist">
        <button role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? 'on' : ''} onClick={() => setTab('day')}>
          하루
        </button>
        <button role="tab" aria-selected={tab === 'month'} className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>
          한 달
        </button>
      </div>
      {tab === 'day' ? (
        <Daily date={date} setDate={setDate} />
      ) : (
        <Monthly
          onPickDay={(d) => {
            setDate(d);
            setTab('day');
          }}
        />
      )}
    </div>
  );
}
