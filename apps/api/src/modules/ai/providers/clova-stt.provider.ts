import { Logger } from '@nestjs/common';
import { ProviderError, SttInput, SttProvider, SttResult } from './provider.types';

/**
 * 네이버 CLOVA Speech — 장문 인식 · 로컬 파일 업로드 (sync)
 *   POST {Invoke URL}/recognizer/upload
 *   Header  X-CLOVASPEECH-API-KEY: {Secret Key}
 *   Body    multipart/form-data — media(파일), params(JSON)
 */
export class ClovaSttProvider implements SttProvider {
  readonly code = 'CLOVA';
  private readonly logger = new Logger(ClovaSttProvider.name);

  constructor(
    private readonly invokeUrl: string,
    private readonly secretKey: string,
    private readonly timeoutMs = 90_000,
  ) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    const params: Record<string, unknown> = {
      language: 'ko-KR',
      completion: 'sync',
      fullText: true,
      wordAlignment: false,
      diarization: { enable: false },
    };
    // 키워드 부스팅: 한글·영어만 지원, 최대 1,000개
    const words = [...new Set(input.boostWords.map((w) => w.trim()))].filter((w) => /^[가-힣a-zA-Z ]{2,}$/.test(w)).slice(0, 1000);
    if (words.length) params.boostings = [{ words: words.join(',') }];

    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), input.fileName);
    form.append('params', JSON.stringify(params));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.invokeUrl.replace(/\/$/, '')}/recognizer/upload`, {
        method: 'POST',
        headers: { 'X-CLOVASPEECH-API-KEY': this.secretKey, Accept: 'application/json' },
        body: form,
        signal: ac.signal,
      });
    } catch (e) {
      throw new ProviderError('음성 인식 서버에 연결하지 못했습니다.', String(e));
    } finally {
      clearTimeout(timer);
    }

    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body) {
      this.logger.warn(`CLOVA Speech HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
      throw new ProviderError(`음성 인식에 실패했습니다. (HTTP ${res.status})`, JSON.stringify(body));
    }
    if (body.result !== 'COMPLETED') {
      throw new ProviderError(`음성 인식에 실패했습니다. (${body.message ?? body.result})`, JSON.stringify(body));
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    return { text, requestId: body.token ?? null };
  }
}
