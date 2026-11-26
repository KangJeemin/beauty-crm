import { LlmInput, LlmProvider, LlmResult, SttInput, SttProvider, SttResult } from './provider.types';

/**
 * 개발·테스트용 가짜 엔진 (STT_PROVIDER=MOCK / LLM_PROVIDER=MOCK)
 * NAVER API 키 없이 녹음 → 정리 → 검토 → 저장 흐름 전체를 확인할 수 있다.
 */
export const MOCK_TRANSCRIPT = '김미영 고객님 뿌리 염색 7N 6프로 1대1로 30분 방치했고 커트 같이 해서 5만 5천원 받았어요. 두피가 좀 예민하세요.';

export class MockSttProvider implements SttProvider {
  readonly code = 'MOCK';
  async transcribe(_input: SttInput): Promise<SttResult> {
    await new Promise((r) => setTimeout(r, 300));
    return { text: MOCK_TRANSCRIPT, requestId: null };
  }
}

/** 간단한 규칙으로 흉내만 낸다 (실제 품질은 HyperCLOVA X 로 확인) */
export class MockLlmProvider implements LlmProvider {
  readonly code = 'MOCK';
  readonly model = 'mock-rules';

  async structure({ transcript: t, menus }: LlmInput): Promise<LlmResult> {
    await new Promise((r) => setTimeout(r, 200));
    const compact = t.replace(/\s+/g, '');
    const found = menus.filter((m) => [m.name, ...m.aliases].some((n) => n.replace(/\s+/g, '').length >= 2 && compact.includes(n.replace(/\s+/g, ''))));
    const color = /(\d{1,2}(?:[./]\d{1,2})?[A-Za-z]{1,2})/.exec(t)?.[1] ?? '';
    const dev = /(\d+(?:\.\d)?)\s*(?:%|프로|퍼센트)/.exec(t)?.[1];
    const ratio = /(\d(?:\.\d)?)\s*(?:대|:)\s*(\d(?:\.\d)?)/.exec(t);
    const minutes = /(\d+)\s*분/.exec(t)?.[1];
    const name = /^\s*([가-힣]{2,4})\s*(?:고객|님)/.exec(t)?.[1] ?? '';
    const l4 = /뒷자리\s*(\d{4})/.exec(t)?.[1] ?? '';

    const items = found.map((m) => {
      const isChem = ['염색', '펌'].includes(m.category);
      return {
        menuName: m.name,
        price: 0,
        recipes: isChem
          ? [{
              area: /뿌리/.test(t) ? '뿌리' : '', productName: '', colorCode: color, mixRatio: ratio ? `${ratio[1]}:${ratio[2]}` : '',
              developerPct: dev ? Number(dev) : 0, amountGram: 0, processingMin: minutes ? Number(minutes) : 0, rodSize: '', heatTemp: 0, memo: '',
            }]
          : [],
      };
    });
    const note = /(두피[^.。]*|알레르기[^.。]*)/.exec(t)?.[1] ?? '';
    const raw = {
      customerName: name,
      phoneLast4: l4,
      items,
      totalPrice: parseKoreanWon(t),
      note,
      summary: found.map((m) => m.name).join(' + '),
    };
    return { raw, model: this.model, promptTokens: Math.ceil(t.length / 2), completionTokens: 120 };
  }
}

/** "5만 5천원" → 55000, "35000원" → 35000 */
export function parseKoreanWon(t: string): number {
  const m = /(\d+)\s*만\s*(?:(\d+)\s*천)?\s*원?/.exec(t);
  if (m) return Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0);
  const n = /(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/.exec(t);
  return n ? Number(n[1].replace(/,/g, '')) : 0;
}
