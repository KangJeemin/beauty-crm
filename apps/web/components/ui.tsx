'use client';

import { useId, useState } from 'react';

export function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null },
) {
  const { label, hint, error, id, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-invalid={!!error} aria-describedby={hint ? `${fid}-h` : undefined} {...rest} />
      {error ? <p className="field-err">{error}</p> : hint ? <p className="field-hint" id={`${fid}-h`}>{hint}</p> : null}
    </div>
  );
}

/** 비밀번호 보기/숨기기 버튼이 있는 입력 — 어르신 사용자 오타 방지 */
export function PasswordField(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null },
) {
  const { label, hint, error, id, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <div className="pw-wrap">
        <input id={fid} type={show ? 'text' : 'password'} aria-invalid={!!error} {...rest} />
        <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? '숨기기' : '보기'}
        </button>
      </div>
      {error ? <p className="field-err">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean },
) {
  const { variant = 'primary', loading, children, disabled, className, ...rest } = props;
  return (
    <button className={`btn btn-${variant} ${className ?? ''}`} disabled={disabled || loading} {...rest}>
      {loading ? '처리 중…' : children}
    </button>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'ok'; children: React.ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Section({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {desc && <p className="muted">{desc}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {desc && <p className="muted">{desc}</p>}
    </div>
  );
}
