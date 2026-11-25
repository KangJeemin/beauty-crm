import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { buildSystemPrompt, buildUserPrompt, DRAFT_JSON_SCHEMA } from '../prompt';
import { LlmInput, LlmProvider, LlmResult, ProviderError } from './provider.types';

/**
 * HyperCLOVA X (CLOVA Studio) — Chat Completions v3 + Structured Outputs
 *   POST {base}/v3/chat-completions/{model}      (Structured Outputs 는 HCX-007 전용)
 *   Header Authorization: Bearer {API Key}
 *   Body   responseFormat: { type: 'json', schema }, thinking: { effort: 'none' } (추론과 동시 사용 불가)
 */
export class HyperClovaLlmProvider implements LlmProvider {
  readonly code = 'HYPERCLOVA';
  private readonly logger = new Logger(HyperClovaLlmProvider.name);

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://clovastudio.stream.ntruss.com',
    private readonly timeoutMs = 45_000,
  ) {}

  async structure(input: LlmInput): Promise<LlmResult> {
    const body = {
      messages: [
        { role: 'system', content: buildSystemPrompt(input.menus) },
        { role: 'user', content: buildUserPrompt(input.transcript) },
      ],
      topP: 0.8,
      topK: 0,
      temperature: 0.2,
      repetitionPenalty: 1.05,
      maxCompletionTokens: 2048,
      thinking: { effort: 'none' },
      responseFormat: { type: 'json', schema: DRAFT_JSON_SCHEMA },
    };

    // 네트워크·5xx 는 한 번만 재시도
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call(body);
      } catch (e) {
        const retryable = e instanceof ProviderError && e.message.includes('[retry]');
        if (!retryable || attempt >= 2) throw e instanceof ProviderError ? new ProviderError(e.message.replace(' [retry]', ''), e.detail) : e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  private async call(body: unknown): Promise<LlmResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v3/chat-completions/${this.model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-NCP-CLOVASTUDIO-REQUEST-ID': randomUUID(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      throw new ProviderError('AI 서버에 연결하지 못했습니다. [retry]', String(e));
    } finally {
      clearTimeout(timer);
    }

    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.status?.code !== '20000') {
      this.logger.warn(`CLOVA Studio HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}`);
      const msg = json?.status?.message ?? `HTTP ${res.status}`;
      throw new ProviderError(`AI 정리에 실패했습니다. (${msg})${res.status >= 500 ? ' [retry]' : ''}`, JSON.stringify(json));
    }

    const content = json.result?.message?.content;
    let raw: unknown;
    try {
      raw = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      throw new ProviderError('AI 응답을 읽지 못했습니다.', String(content).slice(0, 500));
    }
    return {
      raw,
      model: this.model,
      promptTokens: Number(json.result?.usage?.promptTokens ?? 0),
      completionTokens: Number(json.result?.usage?.completionTokens ?? 0),
    };
  }
}
