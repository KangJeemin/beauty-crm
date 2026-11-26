import { MenuHint } from './providers/provider.types';

/** 프롬프트를 바꾸면 버전을 올린다 → voice_record.promptVersion 으로 품질 비교 */
export const PROMPT_VERSION = 'v1';

/**
 * Structured Outputs 스키마.
 * CLOVA Studio 는 JSON Schema 일부만 지원하므로 단순한 타입만 쓰고,
 * "없음" 은 null 대신 빈 문자열 "" / 숫자 0 으로 받은 뒤 서버에서 null 로 바꾼다.
 */
export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    customerName: { type: 'string', description: '고객 이름. 말하지 않았으면 빈 문자열' },
    phoneLast4: { type: 'string', description: '고객 전화번호 뒷자리 4자리 숫자. 말하지 않았으면 빈 문자열' },
    items: {
      type: 'array',
      description: '이번 방문에 받은 시술 목록',
      items: {
        type: 'object',
        properties: {
          menuName: { type: 'string', description: '시술 이름. 매장 메뉴 목록에 있으면 그 이름을 그대로 사용' },
          price: { type: 'integer', description: '이 시술의 금액(원). 말하지 않았으면 0' },
          recipes: {
            type: 'array',
            description: '약제·컬러 등 레시피. 없으면 빈 배열',
            items: {
              type: 'object',
              properties: {
                area: { type: 'string', description: '적용 부위 (뿌리, 기장, 전체, 앞머리 등). 없으면 빈 문자열' },
                productName: { type: 'string', description: '약제·제품 이름. 없으면 빈 문자열' },
                colorCode: { type: 'string', description: '컬러 번호 (예: 7N, 6.3, 8/0). 없으면 빈 문자열' },
                mixRatio: { type: 'string', description: '혼합 비율 (예: 1:1, 1:1.5). 없으면 빈 문자열' },
                developerPct: { type: 'number', description: '산화제 농도 % (예: 6). 없으면 0' },
                amountGram: { type: 'number', description: '사용량 g. 없으면 0' },
                processingMin: { type: 'integer', description: '방치 시간(분). 없으면 0' },
                rodSize: { type: 'string', description: '펌 로드 크기. 없으면 빈 문자열' },
                heatTemp: { type: 'integer', description: '열처리 온도(℃). 없으면 0' },
                memo: { type: 'string', description: '그 밖의 메모. 없으면 빈 문자열' },
              },
              required: ['area', 'productName', 'colorCode', 'mixRatio', 'developerPct', 'amountGram', 'processingMin', 'rodSize', 'heatTemp', 'memo'],
            },
          },
        },
        required: ['menuName', 'price', 'recipes'],
      },
    },
    totalPrice: { type: 'integer', description: '총 금액(원). 말하지 않았으면 0' },
    note: { type: 'string', description: '두피 상태, 고객 요청, 다음 방문 시 참고 등 특이사항. 없으면 빈 문자열' },
    summary: { type: 'string', description: '목록에 보여줄 한 줄 요약 (예: 뿌리염색 7N + 커트)' },
  },
  required: ['customerName', 'phoneLast4', 'items', 'totalPrice', 'note', 'summary'],
} as const;

export function buildSystemPrompt(menus: MenuHint[]): string {
  const menuLines = menus.length
    ? menus.map((m) => `- ${m.name} (${m.category}, ${m.price}원)${m.aliases.length ? ` / 다르게 부르는 말: ${m.aliases.join(', ')}` : ''}`).join('\n')
    : '- (등록된 메뉴 없음)';

  return `당신은 미용실 원장님이 말로 남긴 시술 메모를 정해진 JSON 으로 정리하는 도우미입니다.

규칙
1. 말한 내용만 정리합니다. 추측해서 값을 만들지 마세요. 모르는 값은 빈 문자열 "" 또는 0 으로 둡니다.
2. 시술 이름은 아래 [매장 메뉴]에 있으면 메뉴 이름을 그대로 씁니다. "뿌염" → "뿌리염색" 처럼 다르게 부르는 말도 메뉴 이름으로 바꿉니다. 목록에 없으면 말한 이름을 씁니다.
3. 금액: "5만 5천원" → 55000, "삼만원" → 30000. 시술별 금액을 말하지 않고 총액만 말했으면 시술 price 는 0, totalPrice 에 총액을 넣습니다.
4. 레시피는 염색·펌 등 약제를 쓴 시술에만 넣습니다. 컬러 번호는 들은 그대로(7N, 6.3 등), 산화제 "6프로" → developerPct 6, "1대1" → mixRatio "1:1", "30분 방치" → processingMin 30.
5. 뿌리와 기장에 다른 약을 썼다면 레시피를 부위별로 나눕니다.
6. 고객 이름·전화번호 뒷자리를 말했으면 customerName, phoneLast4 에 넣습니다. "고객님" 같은 호칭은 빼고 이름만 넣습니다.
7. 두피 상태, 알레르기, 고객 요청, 다음 방문 참고 사항은 note 에 짧게 적습니다.
8. summary 는 20자 안팎의 한 줄로 씁니다.

[매장 메뉴]
${menuLines}`;
}

export function buildUserPrompt(transcript: string): string {
  return `다음은 원장님이 말한 내용을 받아 적은 글입니다. 음성 인식 오류가 있을 수 있으니 미용 용어로 자연스럽게 해석해 주세요.\n\n"""\n${transcript}\n"""`;
}
