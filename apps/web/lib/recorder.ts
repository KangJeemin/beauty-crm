'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecState = 'idle' | 'recording' | 'stopped';

/** 브라우저가 지원하는 녹음 형식 (Chrome·Android: webm/opus, iPhone Safari: mp4) */
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function recordErrorMessage(e: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) return '녹음은 https 주소에서만 할 수 있어요. 관리자에게 문의해 주세요.';
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 사용을 허용해 주세요. 주소창 옆 자물쇠(설정) → 마이크 → 허용';
  if (name === 'NotFoundError') return '마이크를 찾을 수 없어요. 이어폰·마이크 연결을 확인해 주세요.';
  if (typeof MediaRecorder === 'undefined') return '이 브라우저는 녹음을 지원하지 않아요. 최신 크롬이나 사파리를 사용해 주세요.';
  return '녹음을 시작하지 못했어요. 다시 시도해 주세요.';
}

/**
 * 녹음 훅 — 시작/정지, 경과 시간, 소리 크기(말하고 있는지 보여주기), 최대 길이 자동 정지
 */
export function useRecorder(maxSeconds = 180) {
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolveRef = useRef<((b: Blob) => void) | null>(null);
  const timers = useRef<{ tick?: number; raf?: number; started: number }>({ started: 0 });
  const ctxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (timers.current.tick) clearInterval(timers.current.tick);
    if (timers.current.raf) cancelAnimationFrame(timers.current.raf);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => undefined);
    streamRef.current = null;
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || mime || 'audio/webm' });
        cleanup();
        setState('stopped');
        resolveRef.current?.(blob);
      };
      rec.start(1000);
      recRef.current = rec;

      // 소리 크기 표시
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40));
          timers.current.raf = requestAnimationFrame(loop);
        };
        loop();
      }

      timers.current.started = Date.now();
      setElapsed(0);
      timers.current.tick = window.setInterval(() => {
        const s = Math.floor((Date.now() - timers.current.started) / 1000);
        setElapsed(s);
        if (s >= maxSeconds && recRef.current?.state === 'recording') recRef.current.stop();
      }, 250);
      setState('recording');
    } catch (e) {
      cleanup();
      setError(recordErrorMessage(e));
      setState('idle');
    }
  }, [cleanup, maxSeconds]);

  /** 정지하고 녹음 파일을 돌려준다 */
  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        resolveRef.current = resolve;
        if (recRef.current?.state === 'recording') recRef.current.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    resolveRef.current = null;
    if (recRef.current?.state === 'recording') {
      recRef.current.onstop = () => cleanup();
      recRef.current.stop();
    }
    cleanup();
    setState('idle');
    setElapsed(0);
  }, [cleanup]);

  return { state, elapsed, level, error, start, stop, cancel, maxSeconds };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
