import { execFileSync } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** ffmpeg 로 테스트용 음성 만들기 (Chrome 녹음과 같은 webm/opus 등) */
export function makeAudio(ext: 'webm' | 'wav' | 'm4a', seconds = 2): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpeg: string = require('ffmpeg-static');
  const out = join(tmpdir(), `bc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const codec = ext === 'webm' ? ['-c:a', 'libopus'] : ext === 'm4a' ? ['-c:a', 'aac'] : [];
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, ...codec, out]);
  const buf = readFileSync(out);
  rmSync(out, { force: true });
  return buf;
}
