/**
 * STT · LLM 엔진 교체용 인터페이스.
 * 새 엔진을 붙일 때는 이 인터페이스를 구현한 클래스를 만들고 ai.module.ts 의 팩토리에 추가한다.
 */

export const STT_PROVIDER = Symbol('STT_PROVIDER');
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface SttInput {
  audio: Buffer;
  mimeType: string;
  fileName: string;
  /** 인식률을 높일 단어 (메뉴명·미용 용어) */
  boostWords: string[];
}

export interface SttResult {
  text: string;
  requestId?: string | null;
}

export interface SttProvider {
  /** voice_record.sttProvider / ai_usage_log.provider 에 저장되는 코드 */
  readonly code: string;
  transcribe(input: SttInput): Promise<SttResult>;
}

export interface MenuHint {
  name: string;
  aliases: string[];
  price: number;
  category: string;
}

export interface LlmInput {
  transcript: string;
  menus: MenuHint[];
}

export interface LlmResult {
  /** 모델이 돌려준 JSON (검증 전) */
  raw: unknown;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmProvider {
  readonly code: string;
  readonly model: string;
  structure(input: LlmInput): Promise<LlmResult>;
}

/** 외부 API 오류 — 사용자에게 보여줄 짧은 메시지와 로그용 상세를 분리 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}
