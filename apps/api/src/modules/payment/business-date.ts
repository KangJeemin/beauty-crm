/**
 * 영업일 계산 (한국 시간 기준)
 * 미용실은 자정을 넘겨 마감하기도 하므로, 새벽 cutoffHour(기본 4시) 전 결제는 전날 영업일로 본다.
 * 서버 시간대(TZ)와 상관없이 같은 결과가 나오도록 UTC+9 를 직접 계산한다.
 */
const KST = 9 * 3600_000;

export function businessDateOf(d: Date, cutoffHour: number): string {
  return new Date(d.getTime() + KST - cutoffHour * 3600_000).toISOString().slice(0, 10);
}

/** 영업일 하루의 실제 시간 범위 [start, end) */
export function businessDayRange(date: string, cutoffHour: number): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, cutoffHour) - KST);
  return { start, end: new Date(start.getTime() + 86400_000) };
}

export function todayBusinessDate(cutoffHour: number): string {
  return businessDateOf(new Date(), cutoffHour);
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** DATE 컬럼 값이 Date 로 올 때를 대비해 'YYYY-MM-DD' 로 통일 */
export function ymd(v: string | Date): string {
  if (typeof v === 'string') return v.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}
