# 미용 고객 관리 (beauty-crm)

음성으로 시술 내용을 기록하는 미용실 고객·시술 이력 관리 서비스 — MVP.

| 영역 | 기술 |
|---|---|
| Frontend | Next.js 15 (App Router), React 19 |
| Backend | Nest.js 10, TypeORM 0.3 |
| DB | MariaDB 10.11 |
| 파일 | SeaweedFS (S3 호환) → 이전 시 NCP Object Storage 등 |
| STT / LLM | 네이버 CLOVA Speech / HyperCLOVA X (CLOVA Studio) |
| 모노레포 | npm workspaces + Turborepo |

## 폴더 구조

```
beauty-crm/
├─ apps/
│  ├─ api/                         # Nest.js
│  │  └─ src/
│  │     ├─ common/
│  │     │  ├─ entities/           # BaseEntity(id·createdAt·updatedAt·delState), TenantBaseEntity(+shopId)
│  │     │  ├─ repositories/       # BaseRepository(소프트 삭제 강제), TenantRepository(shopId 강제)
│  │     │  ├─ storage/            # S3 호환 파일 저장소 (StorageService)
│  │     │  ├─ subscribers/        # 물리 삭제 차단
│  │     │  └─ interceptors/       # 응답 { success, data } 래핑
│  │     ├─ config/                # 환경변수 검증, DB 설정
│  │     ├─ database/
│  │     │  ├─ schema.sql          # ERD 기준 DDL (원본)
│  │     │  ├─ data-source.ts      # TypeORM CLI 용
│  │     │  └─ migrations/
│  │     ├─ health/                # GET /api/health
│  │     └─ modules/               # 기능 모듈 (shop 예시)
│  └─ web/                         # Next.js
├─ docker/seaweedfs/start.sh      # SeaweedFS 실행 스크립트 (.env 키로 S3 인증 설정 생성)
├─ packages/
│  └─ shared/                      # 프론트·백엔드 공통 코드값/타입
└─ docker-compose.yml
```

## 로컬 개발 시작

```bash
# 1. 환경변수
cp .env.example .env               # 비밀번호 등 수정

# 2. DB · 파일 저장소 실행
npm run db:up                      # MariaDB(3307) · SeaweedFS 실행, healthy 까지 대기

# 3. 의존성 설치 · 스키마 생성
npm install
npm run build -w @beauty-crm/shared
npm run db:migrate

# 4. 개발 서버
npm run dev                        # web: http://localhost:3000  api: http://localhost:4000/api
```

`http://localhost:3000` 에서 웹 / API / DB / 파일 저장소가 모두 "정상" 이면 0단계 완료.

## 1단계: 인증 · 매장 · 직원

### 로그인 구조

| 항목 | 방식 |
|---|---|
| Access Token | JWT, 30분. 화면 메모리에만 보관 (localStorage 저장 안 함) |
| Refresh Token | 불투명 랜덤 문자열, 30일. `httpOnly` 쿠키(`bc_rt`, path `/api/auth`)로만 전달, DB 에는 SHA-256 해시만 저장 |
| 갱신 | 쓸 때마다 새 토큰으로 교체(회전). 이미 쓴 토큰이 다시 오면 탈취로 보고 해당 사용자 전체 로그아웃 (동시 요청 대비 10초 유예) |
| 비밀번호 | bcrypt. 변경·초기화 시 다른 기기 로그인 모두 해제 |
| 로그인 제한 | 로그인·가입 API 는 IP당 1분 10회 |

### 매장 격리 규칙 (중요)

- 매장 사용자의 `shopId` 는 **오직 토큰에서만** 온다 → 컨트롤러에서 `@CurrentUser()` 로 받는다.
- 요청 body 에 `shopId` 를 보내면 400 (ValidationPipe `forbidNonWhitelisted`).
- 매장 데이터 저장소는 `TenantRepository` 를 상속하고 `*ForShop(shopId, ...)` 메서드만 사용한다.
- 다른 매장 데이터 id 로 접근하면 403 이 아니라 **404** (존재 여부도 숨김).
- 전역 `AuthGuard` 가 기본으로 로그인을 요구한다. 예외는 `@Public()`, 운영자 전용은 `@AdminOnly()`, 원장 전용은 `@Roles('OWNER')`.

### 매장 가입 승인

`.env` 의 `SHOP_AUTO_APPROVE` — 개발은 `true`(가입 즉시 사용), 운영은 `false`(운영자 승인 후 로그인).
승인·정지는 운영자 화면(`/admin`, 5단계)에서 한다. 첫 운영자 계정 만들기와 비상시에는 CLI 를 쓴다.

```bash
npm run cli -w @beauty-crm/api -- create-admin <아이디> <이름>       # 운영자 계정 (임시 비밀번호 출력)
npm run cli -w @beauty-crm/api -- list-shops PENDING                # 승인 대기 매장
npm run cli -w @beauty-crm/api -- approve <shopId> --founder        # 승인 + 창립 테스터(평생 무료) 표시
npm run cli -w @beauty-crm/api -- suspend <shopId>                  # 이용 정지 (로그인 유지 토큰 즉시 해제)
npm run cli -w @beauty-crm/api -- reset-owner-password <shopId>     # 원장 비밀번호 초기화

# Docker 로 띄운 서버에서는
docker compose exec api node dist/cli/admin-cli.js list-shops PENDING
```

### API 목록

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/auth/signup` | 공개 | 매장 + 원장 계정 가입 |
| GET | `/api/auth/invites/:code` | 공개 | 초대 코드 미리보기 (매장명) |
| POST | `/api/auth/join` | 공개 | 초대 코드로 직원 가입 |
| POST | `/api/auth/login` | 공개 | 로그인 → Access Token + 쿠키 |
| POST | `/api/auth/refresh` | 쿠키 | Access Token 재발급 (회전) |
| POST | `/api/auth/logout` | 쿠키 | 로그아웃 |
| GET | `/api/auth/me` | 로그인 | 내 정보 |
| POST | `/api/auth/password` | 로그인 | 비밀번호 변경 |
| PATCH | `/api/me/settings` | 로그인 | 이름 · 글자 크기 |
| GET / PATCH | `/api/shop` | 로그인 / 원장 | 내 매장 정보 |
| GET | `/api/staff`, `/api/staff/:id` | 로그인 | 직원 목록 · 상세 |
| PATCH / DELETE | `/api/staff/:id` | 원장 | 직원 수정·잠금 / 소프트 삭제 |
| POST | `/api/staff/:id/reset-password` | 원장 | 디자이너 임시 비밀번호 발급 |
| GET / POST / DELETE | `/api/invites` | 원장 | 초대 코드 (7일, 1회용) |
| POST | `/api/admin/auth/login` | 공개 | 운영자 로그인 |
| GET | `/api/admin/shops` | 운영자 | 매장 목록 |
| POST | `/api/admin/shops/:id/approve` · `suspend` · `reset-owner-password` | 운영자 | 매장 관리 |

### 화면

| 경로 | 내용 |
|---|---|
| `/login` · `/signup` · `/join` · `/pending` | 로그인 · 매장 가입 · 초대 가입 · 승인 대기 |
| `/home` | 홈 (큰 녹음 버튼, 오늘 매출·최근 기록 자리) |
| `/customers` · `/records` · `/settlement` | 2~4단계에서 채움 |
| `/settings` | 내 정보·글자 크기, 직원 초대·관리, 매장 정보, 비밀번호, 로그아웃 |
| `/status` | 0단계 점검 화면 (웹·API·DB·저장소) |

레이아웃: 휴대폰(~767px) 하단 탭 + 가운데 녹음 버튼 / 태블릿(768~1199px) 왼쪽 아이콘 메뉴 / PC(1200px~) 넓은 사이드바.

### 테스트

```bash
npm run db:up && npm run db:migrate
npm run test:e2e -w @beauty-crm/api
```

실제 MariaDB 에 붙어 시나리오를 확인한다 (5단계 기준 85개) (매장 격리, 권한, 토큰 회전·재사용 감지, 소프트 삭제 등).
테스트 데이터는 실행마다 고유 아이디로 개발 DB 에 쌓인다.

## 2단계: 고객 · 태그 · 시술 메뉴

### 고객 전화번호 보호

| 컬럼 | 내용 | 용도 |
|---|---|---|
| `phoneEnc` | AES-256-GCM 암호문 (`PHONE_ENC_KEY`) | 상세 화면에서만 복호화해 표시 |
| `phoneHash` | HMAC-SHA256 (`PHONE_HMAC_KEY`) | 같은 매장 중복 확인, 전체 번호 정확 검색 |
| `phoneLast4` | 뒷자리 4자리 평문 | 빠른 검색 |

목록 API 에는 전체 번호가 나가지 않는다 (`***-****-1234`).
**`PHONE_ENC_KEY` / `PHONE_HMAC_KEY` 는 운영 데이터가 쌓인 뒤 바꾸거나 잃어버리면 기존 번호를 읽을 수 없다.** DB 백업과 별도로 보관할 것.

### 고객 검색 (`GET /api/customers?q=`)

| 입력 | 동작 |
|---|---|
| 숫자 4자리 (`5678`) | 뒷자리 일치 |
| 숫자 9~11자리 (`010-1234-5678`) | 전체 번호 정확 일치 |
| 숫자 1~3자리 | 뒷자리에 포함 |
| 그 외 (`미영`) | 이름에 포함 |

그 밖에 `tagId`(태그로 거르기), `sort=recent|name|created`, `page`, `size`.

### API 목록 (2단계)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/customers` | 로그인 | 목록·검색 |
| GET | `/api/customers/check-phone?phone=` | 로그인 | 등록 전 중복 확인 |
| GET / POST / PATCH / DELETE | `/api/customers[/:id]` | 로그인 | 상세·등록·수정·소프트 삭제 |
| GET / POST / PATCH / DELETE | `/api/tags[/:id]` | 로그인 | 태그 (삭제 시 고객 연결도 해제) |
| GET | `/api/menus` | 로그인 | 분류별 메뉴·가격표 |
| POST | `/api/menus/seed-defaults` | 원장 | 메뉴가 없을 때 기본 메뉴 넣기 |
| POST / PATCH / DELETE | `/api/menus/categories[/:id]` | 원장 | 분류 |
| PUT | `/api/menus/categories/order`, `/api/menus/categories/:id/order` | 원장 | 순서 변경 (`{ ids: [...] }`) |
| POST / PATCH / DELETE | `/api/menus/items[/:id]` | 원장 | 메뉴 (가격·소요시간·별칭·판매 중지) |

- 매장 가입 시 기본 메뉴(커트·펌·염색·클리닉·기타, 예시 가격)가 자동으로 들어간다.
- 메뉴 `aliases`(다르게 부르는 이름, 예: `뿌염`)는 3단계 음성 기록에서 메뉴를 찾는 데 쓴다.
- 다른 매장의 분류·태그 id 를 body 에 넣으면 404 (메뉴 이동, 고객 태그 지정 포함).

### 화면

| 경로 | 내용 |
|---|---|
| `/customers` | 검색(뒷자리·이름) + 목록. 태블릿·PC(1000px~)는 왼쪽 목록 + 오른쪽 상세 2단 |
| `/customers/new`, `/customers/:id/edit` | 등록·수정 (번호 자동 하이픈, 중복 번호 즉시 안내, 태그 바로 만들기) |
| `/customers/:id` | 상세 (전화 걸기, 메모 강조, 방문·결제 통계) |
| `/settings/menu` | 시술 메뉴·가격표 (원장 수정, 디자이너 보기) |
| `/settings/tags` | 태그 이름·색상·삭제 |

## 3단계: 음성 기록

### 흐름

```
[녹음] ──업로드──▶ voice_record (PENDING) ──백그라운드──▶ WAV 변환(ffmpeg) ─▶ STT ─▶ LLM 정리 ─▶ 검증
                                                                                      │
[검토 화면] ◀──────────── 1.5초마다 상태 조회 ◀───────────────────────────────────────┘
     │ 고객 확인 · 틀린 부분 수정
     ▼
POST /api/treatments ─▶ treatment + treatment_item + treatment_recipe, 고객 방문 횟수·최근 방문일 갱신
```

- 글로 입력(`POST /api/voice-records/text`)은 STT 를 건너뛰고 바로 정리한다.
- AI 결과는 그대로 저장하지 않는다. 검토 화면에서 원장님이 확인하고 저장해야 시술 기록이 된다.
- 고객을 정하지 않고 녹음해도 AI 가 들은 이름·뒷자리로 후보를 찾아 보여준다 (`candidates`).
- 실패하면 단계별로 다시 시도(`/retry`)하거나 직접 입력할 수 있다. 받아 적은 글은 남는다.
- 처리 큐는 서버 안에서 동시 2건. 서버가 재시작되면 끝나지 않은 작업을 다시 넣는다. 사용자가 늘면 BullMQ 로 교체.

### 엔진 교체 구조

| 구분 | 인터페이스 | 구현 | `.env` |
|---|---|---|---|
| STT | `SttProvider` | `ClovaSttProvider` (CLOVA Speech 장문 인식, 키워드 부스팅), `MockSttProvider` | `STT_PROVIDER=CLOVA\|MOCK` |
| LLM | `LlmProvider` | `HyperClovaLlmProvider` (HCX-007 Structured Outputs), `MockLlmProvider` | `LLM_PROVIDER=HYPERCLOVA\|MOCK` |

새 엔진은 인터페이스 구현 클래스를 만들고 `modules/ai/ai.module.ts` 팩토리에 한 줄 추가하면 된다.
`voice_record.sttProvider / aiProvider / aiModel / promptVersion` 에 어떤 엔진·프롬프트로 처리했는지 남는다.

- **STT 요청**: `POST {Invoke URL}/recognizer/upload` multipart(`media`=16kHz 모노 WAV, `params`=`{language:"ko-KR", completion:"sync", boostings}`), 헤더 `X-CLOVASPEECH-API-KEY`
  - 부스팅 단어: 매장 메뉴명·별칭 + 미용 용어 (한글·영어만, 최대 1,000개)
- **LLM 요청**: `POST {base}/v3/chat-completions/HCX-007`, `responseFormat: { type: "json", schema }`, `thinking: { effort: "none" }`
  - 시스템 프롬프트에 매장 메뉴(이름·별칭·가격)를 넣어 "뿌염" → "뿌리염색" 으로 매칭
  - 스키마는 `modules/ai/prompt.ts`. "없음" 은 `""`/`0` 으로 받아 서버에서 `null` 로 바꾸고, 길이·범위를 DB 컬럼에 맞게 다시 검증 (`draft-normalizer.ts`)
- 사용량·추정 비용은 `ai_usage_log` 에 매장별로 기록 (단가는 `.env`)

### 실제 키로 바꾸기 (회사 서버)

```
STT_PROVIDER=CLOVA
CLOVA_SPEECH_INVOKE_URL=https://clovaspeech-gw.ncloud.com/external/v1/....
CLOVA_SPEECH_SECRET_KEY=...
LLM_PROVIDER=HYPERCLOVA
CLOVA_STUDIO_API_KEY=...
```

값이 비어 있으면 API 가 시작하지 않고 어떤 값이 필요한지 알려준다. 바꾼 뒤 `docker compose --profile app up -d --build`.

### 원본 녹음 보관

`VOICE_FILE_RETENTION_DAYS`(기본 30일)가 지나면 저장소의 음성 파일만 삭제한다 (6시간마다 확인).
받아 적은 글·시술 기록은 남는다. 그 전에는 검토 화면에서 "녹음 다시 듣기" 가능.

### API 목록 (3단계)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/voice-records` | 녹음 업로드 (multipart `audio`, `customerId` 선택, 최대 20MB) |
| POST | `/api/voice-records/text` | 글로 입력 `{ text, customerId? }` |
| GET | `/api/voice-records/:id` | 처리 상태 · 받아 적은 글 · AI 결과 · 고객 후보 |
| GET | `/api/voice-records/pending` | 검토 대기 (저장 안 한 최근 7일) |
| POST | `/api/voice-records/:id/retry` | 실패한 단계 다시 시도 |
| GET | `/api/voice-records/:id/audio` | 원본 녹음 듣기 |
| DELETE | `/api/voice-records/:id` | 기록 버리기 |
| POST / PUT / DELETE | `/api/treatments[/:id]` | 시술 기록 저장 · 수정(항목 통째 교체) · 삭제 |
| GET | `/api/treatments/:id`, `/api/treatments/recent` | 상세 · 최근 기록 |
| GET | `/api/customers/:id/treatments` | 고객 시술 이력 (레시피 포함) |

저장할 때 body 의 고객·담당 디자이너·메뉴·녹음·원본 기록 id 가 모두 내 매장 것인지 확인한다 (아니면 404).

### 화면

| 경로 | 내용 |
|---|---|
| `/records` | 큰 녹음 버튼(최대 3분, 소리 크기 표시) · 글로 기록 · 검토 대기 목록 |
| `/records/:id` | 처리 단계 표시 → 검토·수정 (고객 후보, 메뉴 선택, 레시피, 총액 차이 안내, 녹음 다시 듣기) |
| `/records/new?copyFrom=` | "지난번이랑 똑같이" (마지막 시술 복사) / `?customerId=` 직접 입력 |
| `/treatments/:id/edit` | 시술 기록 수정 · 삭제 |
| `/customers/:id` | 시술 이력 타임라인 (레시피 한 줄 요약, 메모) |

### 테스트

`naver-providers.e2e-spec.ts` 는 가짜 NAVER 서버를 띄워 CLOVA Speech·HCX-007 요청 형식(경로·헤더·multipart·responseFormat)과
실패·재시도를 검증한다. 실제 키로 호출하는 확인은 회사 서버에서 한다.

## 4단계: 결제 · 선불권 · 정산

결제는 **기록만** 합니다(PG 연동 없음). 카드 단말기·현금으로 받은 돈을 앱에 적어 두고, 하루 끝에 시재와 맞춰 보는 용도입니다.

### 흐름

1. 시술 기록 저장 → 바로 **결제 화면**으로 이동 (`/payments/new?treatmentId=`)
2. 할인(%, 금액, 이유) → 결제수단 버튼(카드·현금·계좌이체·선불권)을 누르면 남은 금액이 자동으로 채워짐. 나눠 받았으면 금액을 고친 뒤 다른 수단을 더 누름
3. "나중에"를 누르면 미결제로 남고, 고객 타임라인·정산 화면에 **결제 기록 없는 시술**로 표시됨
4. 원장은 `/settlement`에서 하루/한 달 정산을 보고, 실제 현금·카드 단말기 합계를 넣어 **마감**

### 돈 규칙 (중요)

| 항목 | 정의 |
| --- | --- |
| 들어온 돈 (received) | 카드+현금+계좌이체+기타. 선불권 **판매 포함**, 선불권 **차감 제외**, 환불은 마이너스 |
| 시술 매출 (sales) | SERVICE/PRODUCT 결제의 최종 금액 (선불권으로 낸 금액 포함) |
| 선불권 차감 (prepaidUsed) | 시술 결제 중 선불권으로 낸 금액 |
| 고객 누적 결제액 | 선불권 차감을 뺀 실제 받은 돈 합계 (`customer.totalPaidAmount`) |

- **선불권 잔액은 `prepaid_transaction` 원장으로만** 바뀝니다 (CHARGE / USE / CANCEL_USE / ADJUST / REFUND). 행 잠금(FOR UPDATE)으로 동시 차감을 막고, 잔액 = 원장 합계가 항상 성립합니다.
- 결제된 시술은 금액·고객 변경과 삭제가 막힙니다. 결제를 취소하면 다시 수정할 수 있습니다.
- 결제 취소: 원장 또는 결제한 직원. 선불권으로 낸 금액은 잔액으로 돌아갑니다. 사용 이력이 있는 선불권 판매는 취소 대신 **환불**로 처리합니다.
- **영업일**은 KST 기준 새벽 `BUSINESS_DAY_CUTOFF_HOUR`시(기본 4시)에 바뀝니다. 밤 1시 결제는 전날 매출입니다.
- 마감 후 결제가 바뀌면 정산 화면에 "다시 마감해 주세요"가 뜹니다. 다시 마감하면 이전 마감은 soft delete 됩니다.

### API 목록 (4단계)

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/api/payments` | 직원 | 시술 결제 기록 |
| GET | `/api/payments/:id` | 직원 | 결제 상세 |
| POST | `/api/payments/:id/cancel` | 원장·결제자 | 결제 취소 |
| POST | `/api/prepaid-passes` | 직원 | 선불권 판매 |
| GET | `/api/customers/:id/prepaid-passes` | 직원 | 고객 선불권 목록 |
| GET | `/api/prepaid-passes/:id` | 직원 | 선불권 상세 + 사용 내역 |
| POST | `/api/prepaid-passes/:id/adjust` | 원장 | 잔액 조정 |
| POST | `/api/prepaid-passes/:id/refund` | 원장 | 환불 |
| GET | `/api/settlements/daily?date=` | 원장 | 하루 정산 |
| GET | `/api/settlements/monthly?month=` | 원장 | 한 달 정산 |
| PUT | `/api/settlements/daily/:date/closing` | 원장 | 마감 / 다시 마감 |

### 화면

- 결제 화면: 큰 결제수단 버튼, 남은 금액 표시, 할인 칩(10%·20%·5천·1만원), 할인 이유 칩
- 고객 상세: 선불권 카드(잔액), 타임라인에 결제 배지 / 미결제 링크
- 선불권 판매: 10만+1만, 20만+3만, 30만+5만 프리셋, 유효기간 기본 1년
- 정산(원장): 하루 탭(들어온 돈, 수단별, 미결제 시술, 마감·시재 비교, 담당별, 결제 내역·취소), 한 달 탭(날짜별 막대, 담당별, 많이 한 시술)
- 홈(원장): 오늘 들어온 돈

### 테스트

`test/payment-settlement.e2e-spec.ts` — 결제/분할/할인, 선불권 판매·차감·취소·환불·조정, 잔액=원장 합계, 영업일 경계, 정산 합계, 마감 변경 감지, 매장 격리.

## 5단계: 운영자 화면 · 의견 · 변경 이력

테스터 매장을 받기 전에 운영자(서비스 관리자)가 매장을 관리하고, 원장님 의견을 받고, "누가 언제 무엇을 바꿨는지" 확인할 수 있게 한다.

### 운영자 화면 (`/admin`)

매장 화면과 완전히 분리된 화면. 매장 계정으로는 들어갈 수 없다.

```bash
# 첫 운영자 계정 (임시 비밀번호 출력) — 서버에서
docker compose exec api node dist/cli/admin-cli.js create-admin <아이디> <이름>
```

| 화면 | 내용 |
| --- | --- |
| `/admin` 현황 | 사용 중 매장, 최근 7일 쓴 매장·시술·녹음(실패), 이번 달 AI 비용, 답변 안 한 의견, **승인 대기 매장 → 창립 테스터/일반 승인** |
| `/admin/shops` | 검색(매장명·원장·연락처·로그인 아이디), 상태 필터, 직원·고객·시술 수, 이번 달 AI 비용, 마지막 사용 |
| `/admin/shops/:id` | 매장 정보, 승인·정지·다시 사용, 창립 테스터 지정/해제, 원장 비밀번호 초기화(임시 비밀번호 한 번만 표시), 사진 용량 상한, 직원, 월별 AI 사용량, 의견, 최근 변경 이력 |
| `/admin/feedback` | 매장 의견 받은 편지함 — 확인 중 / 답변 보내기 / 답변 없이 완료 |
| `/admin/ai-usage` | 월별 AI 호출·실패·음성 분·토큰·추정 비용, 매장별·날짜별 |
| `/admin/audit` | 변경 이력 (대상·동작 필터, 줄을 누르면 바뀐 값) |

- 운영자 로그인은 탭 세션(sessionStorage)에 12시간. 탭을 닫으면 로그아웃.
- 매장을 정지하면 그 매장 직원들의 로그인 유지가 바로 끊긴다.

### 의견 보내기 (매장)

설정 → **의견 보내기** (`/feedback`). 불편·오류 / 바라는 기능 / 궁금한 점 / 기타. 보낸 화면 주소가 같이 간다.
운영자가 답하면 같은 화면에서 답변을 볼 수 있다 (디자이너는 자기 의견, 원장은 매장 전체).

### 변경 이력 (`audit_log`)

- 전역 인터셉터(`common/audit`)가 **성공한 변경 요청**(POST/PUT/PATCH/DELETE)을 모두 남긴다. 실패한 요청은 남기지 않는다.
- 남기는 것: 매장, 누가(직원/운영자), 동작(등록·수정·삭제·결제 취소·마감·승인…), 대상 테이블·ID, 변경 전·후 값, IP, 브라우저.
- 변경 전 값은 서비스에서 `auditBefore({...})` 로 넣는다 (고객·시술 수정/삭제, 결제 취소, 선불권 조정, 직원·매장 설정, 마감, 의견 답변).
- 경로 → 이름 규칙은 `common/audit/audit-rules.ts`. 규칙에 없는 경로도 기본 규칙으로 남는다.
- **비밀번호·임시 비밀번호·토큰·초대 코드·전화번호 원문은 저장하지 않는다** (전화번호는 뒤 4자리만).
- 기록 실패는 본 요청에 영향을 주지 않는다 (로그만 남김).

### API 목록 (5단계)

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/api/feedback` | 직원 | 의견 보내기 |
| GET | `/api/feedback` | 직원 | 내 의견(원장: 매장 전체) + 답변 |
| GET | `/api/admin/dashboard` | 운영자 | 현황 |
| GET | `/api/admin/shops?status=&q=` | 운영자 | 매장 목록 + 이용 현황 |
| GET | `/api/admin/shops/:id` | 운영자 | 매장 상세 |
| PATCH | `/api/admin/shops/:id` | 운영자 | 창립 테스터 · 사진 용량 |
| GET | `/api/admin/ai-usage?month=` | 운영자 | AI 사용량 |
| GET | `/api/admin/feedback?status=` | 운영자 | 의견 목록 (`UNDONE` = 답변 안 함) |
| PATCH | `/api/admin/feedback/:id` | 운영자 | 상태 변경 · 답변 |
| GET | `/api/admin/audit-logs?shopId=&targetTable=&targetId=&action=&page=` | 운영자 | 변경 이력 |

### 테스트

`test/admin-ops.e2e-spec.ts` — 운영자 권한, 현황·검색, 승인/창립 테스터/정지, 비밀번호 초기화(이력에 임시 비밀번호 없음), 의견 → 답변 → 매장에서 확인, 고객·시술·결제·마감 이력의 변경 전/후, 전화번호 원문 미저장, 실패 요청 미기록, AI 사용량 합계.

## 회사 서버 배포

```bash
cp .env.example .env               # 운영 값으로 수정 (아래 체크리스트)
docker compose --profile app up -d --build
```

운영 `.env` 체크리스트:
- `NODE_ENV=production`
- `JWT_ACCESS_SECRET` → `openssl rand -hex 32` 로 새로 생성
- `SHOP_AUTO_APPROVE=false`
- `CORS_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL` → 실제 HTTPS 도메인
- DB · 저장소 비밀번호 변경

- `PHONE_ENC_KEY`, `PHONE_HMAC_KEY` → `openssl rand -hex 32` 로 각각 새로 생성 (위 주의사항 참고)
- `STT_PROVIDER=CLOVA`, `LLM_PROVIDER=HYPERCLOVA` 와 NAVER 키 (3단계 참고)

도메인(`https://beauty.emtpro.kr`) 기준 `.env`:

```
NODE_ENV=production
CORS_ORIGIN=https://beauty.emtpro.kr
NEXT_PUBLIC_API_BASE_URL=https://beauty.emtpro.kr/api
```

리버스 프록시는 같은 도메인에서 `/api/*` → api(4000), 나머지 → web(3000) 으로 보낸다.
`NEXT_PUBLIC_API_BASE_URL` 은 web 빌드 때 화면 코드에 들어가므로 바꾼 뒤 `--build` 로 다시 빌드한다.

- API 컨테이너는 시작할 때 밀린 마이그레이션을 자동 적용한 뒤 실행된다.
- HTTPS(브라우저 마이크 사용에 필수)는 앞단 Nginx/Caddy 리버스 프록시에서 처리한다.
- 서버 이전 시: `.env` 의 DB_HOST · STORAGE_* 만 바꾸고 같은 compose 로 실행.

## 파일 저장소

MinIO 는 2026-09 Docker Hub·Quay 공식 이미지가 삭제되고 커뮤니티판 유지보수가 끝나 사용하지 않는다.
대신 **SeaweedFS**(Apache 2.0) 단일 노드를 S3 호환 저장소로 쓴다.

| 항목 | 값 |
|---|---|
| 이미지 | `chrislusf/seaweedfs:4.55` (`SEAWEEDFS_VERSION` 으로 고정) |
| S3 엔드포인트 | `http://localhost:8333` (컨테이너 간: `http://seaweedfs:8333`) |
| 인증 | `.env` 의 `STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY` → 시작 시 S3 설정 파일 생성 |
| 버킷 | API 시작 시 `STORAGE_BUCKET` 이 없으면 자동 생성 |
| 데이터 | `docker/data/seaweedfs` (백업 대상) |

코드는 `StorageService`(AWS SDK v3, `forcePathStyle`)만 사용하므로 저장소를 바꿔도 코드 변경이 없다.

**NCP Object Storage 로 이전할 때** `.env` 만 수정:

```
STORAGE_ENDPOINT=https://kr.object.ncloudstorage.com
STORAGE_REGION=kr-standard
STORAGE_ACCESS_KEY=<NCP Access Key>
STORAGE_SECRET_KEY=<NCP Secret Key>
```

기존 파일은 `rclone sync` 등으로 옮긴다. compose 의 `seaweedfs` 서비스는 제거한다.

## DB 규칙

| 항목 | 규칙 |
|---|---|
| 테이블명 | `snake_case` — `@Entity('treatment_item')` |
| 컬럼명 | `camelCase` — 엔티티 프로퍼티명 = 컬럼명 |
| 컬럼 순서 | `id(PK) → FK → UK → 일반 → createdAt, updatedAt, delState → activeKey` |
| 삭제 | **DELETE 금지.** `delState` 0 정상 / 1 삭제. `BaseRepository.softDeleteById()` 사용 |
| 삭제 + UNIQUE | `activeKey` 생성 컬럼(정상 1 / 삭제 NULL)을 UNIQUE 에 포함. 엔티티에는 매핑하지 않음 |
| 스키마 변경 | `synchronize: false`. 반드시 마이그레이션으로 |
| 예외 | `refresh_token`, `ai_usage_log`, `audit_log` 는 로그 테이블이라 delState 없음 |

### 새 테이블/컬럼 추가

```bash
npm run migration:create -w @beauty-crm/api -- src/database/migrations/AddSomething
```

생성된 파일에 SQL 을 직접 작성한다. 컬럼 순서를 지키기 위해 `ALTER TABLE ... ADD COLUMN ... AFTER <컬럼>` 을 사용.

### 저장소 사용 예

```ts
@Injectable()
export class CustomerRepository extends TenantRepository<Customer> {
  constructor(@InjectRepository(Customer) repo: Repository<Customer>) { super(repo); }
}

// 서비스에서
await customers.findForShop(shopId, { where: { phoneLast4: '1234' } }); // delState=0, shopId 자동
await customers.softDeleteForShop(shopId, id);                          // UPDATE delState=1
```

## 명령어

특정 패키지만 실행할 때는 `-w <패키지명>` 을 붙인다. 예: `npm run dev -w @beauty-crm/api`,
패키지 추가: `npm install <패키지> -w @beauty-crm/api`

| 명령 | 설명 |
|---|---|
| `npm run dev` | web + api 개발 서버 |
| `npm run build` | 전체 빌드 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:revert` | 마지막 마이그레이션 되돌리기 |
| `npm run db:status` | 적용 상태 확인 |
