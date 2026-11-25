import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface Transcoded {
  audio: Buffer;
  mimeType: string;
  ext: string;
  durationSec: number | null;
  transcoded: boolean;
}

/**
 * 브라우저 녹음(webm/opus, iOS mp4 등)을 16kHz 모노 WAV 로 변환.
 *  - CLOVA Speech 가 확실히 받는 형식으로 통일
 *  - WAV 크기로 재생 시간을 정확히 계산 (사용량·비용 기록용)
 * ffmpeg 이 없거나 실패하면 원본을 그대로 쓴다.
 */
@Injectable()
export class AudioTranscoder {
  private readonly logger = new Logger(AudioTranscoder.name);
  private readonly ffmpeg: string | null;

  constructor(config: ConfigService) {
    let p: string | null = config.get<string>('FFMPEG_PATH') || null;
    if (!p) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        p = require('ffmpeg-static') as string;
      } catch {
        p = null;
      }
    }
    this.ffmpeg = p;
  }

  async toWav(input: Buffer, mimeType: string): Promise<Transcoded> {
    const fallback: Transcoded = { audio: input, mimeType, ext: extOf(mimeType), durationSec: null, transcoded: false };
    if (!this.ffmpeg) return fallback;

    // mp4/m4a 는 파일 끝에 메타데이터가 있을 수 있어 파이프 대신 임시 파일 사용
    const id = randomUUID();
    const inPath = join(tmpdir(), `bc-${id}.${extOf(mimeType)}`);
    const outPath = join(tmpdir(), `bc-${id}.wav`);
    try {
      await fs.writeFile(inPath, input);
      await run(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inPath, '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', outPath]);
      const wav = await fs.readFile(outPath);
      const durationSec = Math.max(0, (wav.length - 44) / (16000 * 2));
      return { audio: wav, mimeType: 'audio/wav', ext: 'wav', durationSec: Math.round(durationSec * 100) / 100, transcoded: true };
    } catch (e) {
      this.logger.warn(`오디오 변환 실패 — 원본으로 진행: ${(e as Error).message}`);
      return fallback;
    } finally {
      await Promise.all([fs.rm(inPath, { force: true }), fs.rm(outPath, { force: true })]);
    }
  }
}

function run(bin: string, args: string[], timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => (clearTimeout(t), reject(e)));
    p.on('close', (code) => (clearTimeout(t), code === 0 ? resolve() : reject(new Error(err.trim().slice(0, 300) || `exit ${code}`))));
  });
}

export function extOf(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('flac')) return 'flac';
  return 'bin';
}
