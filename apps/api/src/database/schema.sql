-- =====================================================================
--  미용 고객 시술 이력 관리 서비스 — MVP 스키마 (MariaDB 10.6+)
--
--  네이밍 규칙
--    · 테이블명 : snake_case
--    · 컬럼명   : camelCase
--    · 컬럼 순서 : id(PK) → FK → UK → 일반 컬럼 → 공통 컬럼(createdAt, updatedAt, delState) → activeKey
--  공통 규칙
--    · PK            : id BIGINT UNSIGNED AUTO_INCREMENT
--    · 멀티테넌트     : 매장 소속 데이터는 전부 shopId 보유 (API에서 강제 필터)
--    · 소프트 삭제    : DELETE 금지, delState TINYINT (0 = 정상, 1 = 삭제)
--    · 공통 컬럼      : createdAt, updatedAt, delState
--    · 금액           : INT (원 단위, 소수점 없음)
--    · 코드값         : VARCHAR(20) 대문자 코드 (ENUM 대신 → 값 추가 시 ALTER 불필요)
--    · 소프트 삭제 + UNIQUE : activeKey 생성 컬럼(정상=1, 삭제=NULL)을 UNIQUE에 포함
--                            → 삭제된 행끼리는 중복 허용, 정상 행만 유일성 보장
--  예외 (append-only 로그, delState 없음) : refresh_token, ai_usage_log, audit_log
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. 운영자 / 매장 / 계정
-- ---------------------------------------------------------------------

-- 서비스 운영자(슈퍼관리자) — 매장 계정과 분리
CREATE TABLE admin_user (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loginId        VARCHAR(50)  NOT NULL COMMENT '로그인 ID',
  passwordHash   VARCHAR(255) NOT NULL COMMENT 'argon2/bcrypt 해시',
  name           VARCHAR(50)  NOT NULL,
  lastLoginAt    DATETIME     NULL,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0 COMMENT '0:정상 1:삭제',
  activeKey      TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_user_loginId (loginId, activeKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='서비스 운영자';

-- 매장(테넌트)
CREATE TABLE shop (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  approvedBy         BIGINT UNSIGNED NULL COMMENT 'admin_user.id',
  name               VARCHAR(100) NOT NULL COMMENT '매장명',
  ownerName          VARCHAR(50)  NOT NULL COMMENT '원장 이름',
  phone              VARCHAR(20)  NULL     COMMENT '매장 연락처',
  bizNo              VARCHAR(20)  NULL     COMMENT '사업자번호(선택)',
  address            VARCHAR(255) NULL,
  status             VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING:승인대기 ACTIVE:사용 SUSPENDED:정지 CLOSED:해지',
  planType           VARCHAR(20)  NOT NULL DEFAULT 'FREE'    COMMENT 'FREE / FOUNDER(창립 테스터) / BASIC / PRO',
  isFounder          TINYINT      NOT NULL DEFAULT 0 COMMENT '창립 테스터 매장 여부 (평생 무료)',
  storageQuotaMb     INT UNSIGNED NOT NULL DEFAULT 1024 COMMENT '사진 저장 용량 상한(MB)',
  storageUsedBytes   BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '사용 중인 용량(비정규화)',
  businessHours      JSON         NULL COMMENT '영업시간 {"mon":["10:00","20:00"],...}',
  termsAgreedAt      DATETIME     NULL COMMENT '이용약관 동의 일시',
  privacyAgreedAt    DATETIME     NULL COMMENT '개인정보 처리위탁 동의 일시',
  approvedAt         DATETIME     NULL,
  createdAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState           TINYINT      NOT NULL DEFAULT 0 COMMENT '0:정상 1:삭제',
  PRIMARY KEY (id),
  KEY idx_shop_status (status, delState),
  CONSTRAINT fk_shop_approvedBy FOREIGN KEY (approvedBy) REFERENCES admin_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='매장(테넌트)';

-- 매장 사용자 (원장 / 디자이너)
CREATE TABLE shop_user (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  loginId        VARCHAR(100) NOT NULL COMMENT '이메일 또는 ID (서비스 전체에서 유일)',
  passwordHash   VARCHAR(255) NOT NULL,
  name           VARCHAR(50)  NOT NULL,
  phone          VARCHAR(20)  NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'DESIGNER' COMMENT 'OWNER:원장 DESIGNER:디자이너',
  status         VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'   COMMENT 'ACTIVE / LOCKED',
  fontScale      TINYINT      NOT NULL DEFAULT 100 COMMENT '글자 크기 설정(%)',
  lastLoginAt    DATETIME     NULL,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0 COMMENT '0:정상 1:삭제',
  activeKey      TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_shop_user_loginId (loginId, activeKey),
  KEY idx_shop_user_shop (shopId, delState),
  CONSTRAINT fk_shop_user_shop FOREIGN KEY (shopId) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='매장 사용자';

-- 직원 초대 코드 (P1)
CREATE TABLE shop_invite (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  usedUserId     BIGINT UNSIGNED NULL,
  createdBy      BIGINT UNSIGNED NOT NULL COMMENT 'shop_user.id',
  inviteCode     VARCHAR(32)  NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'DESIGNER',
  expiresAt      DATETIME     NOT NULL,
  usedAt         DATETIME     NULL,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_shop_invite_code (inviteCode),
  CONSTRAINT fk_shop_invite_shop      FOREIGN KEY (shopId)     REFERENCES shop (id),
  CONSTRAINT fk_shop_invite_usedUser  FOREIGN KEY (usedUserId) REFERENCES shop_user (id),
  CONSTRAINT fk_shop_invite_createdBy FOREIGN KEY (createdBy)  REFERENCES shop_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='직원 초대';

-- 리프레시 토큰 (로그 성격, delState 없음 → revokedAt 으로 무효화)
CREATE TABLE refresh_token (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tokenHash      CHAR(64)     NOT NULL COMMENT 'SHA-256 (원문 저장 금지)',
  userType       VARCHAR(10)  NOT NULL COMMENT 'SHOP / ADMIN',
  userId         BIGINT UNSIGNED NOT NULL,
  deviceInfo     VARCHAR(255) NULL,
  ip             VARCHAR(45)  NULL,
  expiresAt      DATETIME     NOT NULL,
  revokedAt      DATETIME     NULL,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_refresh_token_hash (tokenHash),
  KEY idx_refresh_token_user (userType, userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='리프레시 토큰';

-- ---------------------------------------------------------------------
-- 2. 고객
-- ---------------------------------------------------------------------

CREATE TABLE customer (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  phoneHash        CHAR(64)     NULL COMMENT '정규화 번호의 HMAC-SHA256 — 중복 체크/정확 검색',
  name             VARCHAR(50)  NOT NULL,
  phoneEnc         VARBINARY(255) NULL COMMENT '전화번호 암호문 (AES-256-GCM, 앱에서 암복호화)',
  phoneLast4       CHAR(4)      NULL COMMENT '뒷자리 4자리 — 빠른 검색',
  gender           CHAR(1)      NULL COMMENT 'F / M',
  birthYear        SMALLINT     NULL,
  memo             TEXT         NULL COMMENT '고객 메모 (두피 상태, 선호 스타일 등)',
  firstVisitAt     DATETIME     NULL,
  lastVisitAt      DATETIME     NULL COMMENT '비정규화 — 목록 정렬용',
  visitCount       INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '비정규화',
  totalPaidAmount  INT          NOT NULL DEFAULT 0 COMMENT '비정규화 누적 결제액',
  consentAt        DATETIME     NULL COMMENT '개인정보 수집·이용 동의 일시',
  consentVersion   VARCHAR(20)  NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  activeKey        TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_phone (shopId, phoneHash, activeKey),
  KEY idx_customer_last4 (shopId, phoneLast4, delState),
  KEY idx_customer_name  (shopId, name, delState),
  KEY idx_customer_lastVisit (shopId, lastVisitAt),
  CONSTRAINT fk_customer_shop FOREIGN KEY (shopId) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='고객';

CREATE TABLE tag (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(30)  NOT NULL,
  color          CHAR(7)      NULL COMMENT '#RRGGBB',
  sortOrder      INT          NOT NULL DEFAULT 0,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0,
  activeKey      TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tag_name (shopId, name, activeKey),
  CONSTRAINT fk_tag_shop FOREIGN KEY (shopId) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='고객 태그';

CREATE TABLE customer_tag (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  customerId     BIGINT UNSIGNED NOT NULL,
  tagId          BIGINT UNSIGNED NOT NULL,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0,
  activeKey      TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_tag (customerId, tagId, activeKey),
  KEY idx_customer_tag_tag (tagId),
  CONSTRAINT fk_customer_tag_shop     FOREIGN KEY (shopId)     REFERENCES shop (id),
  CONSTRAINT fk_customer_tag_customer FOREIGN KEY (customerId) REFERENCES customer (id),
  CONSTRAINT fk_customer_tag_tag      FOREIGN KEY (tagId)      REFERENCES tag (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='고객-태그 매핑';

-- ---------------------------------------------------------------------
-- 3. 시술 메뉴 / 가격표
-- ---------------------------------------------------------------------

CREATE TABLE service_category (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(50)  NOT NULL COMMENT '커트 / 펌 / 염색 / 클리닉 ...',
  sortOrder      INT          NOT NULL DEFAULT 0,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_service_category_shop (shopId, delState, sortOrder),
  CONSTRAINT fk_service_category_shop FOREIGN KEY (shopId) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 분류';

CREATE TABLE service_menu (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId         BIGINT UNSIGNED NOT NULL,
  categoryId     BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(100) NOT NULL COMMENT '여성 커트, 디지털펌, 뿌리염색 ...',
  basePrice      INT          NOT NULL DEFAULT 0,
  durationMin    SMALLINT     NULL COMMENT '예상 소요시간(분)',
  aliases        VARCHAR(255) NULL COMMENT '음성 매칭용 별칭 (쉼표 구분: 뿌염,뿌리 염색)',
  isActive       TINYINT      NOT NULL DEFAULT 1 COMMENT '판매 중 여부 (삭제와 별개)',
  sortOrder      INT          NOT NULL DEFAULT 0,
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState       TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_service_menu_shop (shopId, delState, isActive),
  CONSTRAINT fk_service_menu_shop     FOREIGN KEY (shopId)     REFERENCES shop (id),
  CONSTRAINT fk_service_menu_category FOREIGN KEY (categoryId) REFERENCES service_category (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 메뉴/가격표';

-- ---------------------------------------------------------------------
-- 4. 시술 기록 (핵심)
-- ---------------------------------------------------------------------

-- 방문 1회 = treatment 1건
CREATE TABLE treatment (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  customerId       BIGINT UNSIGNED NOT NULL,
  designerId       BIGINT UNSIGNED NOT NULL COMMENT '담당 디자이너 shop_user.id',
  copiedFromId     BIGINT UNSIGNED NULL COMMENT '"지난번이랑 똑같이" 원본 treatment.id',
  treatedAt        DATETIME     NOT NULL COMMENT '시술 일시',
  inputType        VARCHAR(10)  NOT NULL DEFAULT 'TEXT' COMMENT 'VOICE / TEXT',
  status           VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT:AI정리 검토 전 CONFIRMED:확정',
  summary          VARCHAR(500) NULL COMMENT '한 줄 요약 (목록 표시용)',
  note             TEXT         NULL COMMENT '특이사항 / 자유 메모',
  totalAmount      INT          NOT NULL DEFAULT 0 COMMENT '시술 항목 합계(할인 전, 비정규화)',
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_treatment_customer (shopId, customerId, treatedAt),
  KEY idx_treatment_date     (shopId, treatedAt, delState),
  KEY idx_treatment_designer (shopId, designerId, treatedAt),
  CONSTRAINT fk_treatment_shop       FOREIGN KEY (shopId)       REFERENCES shop (id),
  CONSTRAINT fk_treatment_customer   FOREIGN KEY (customerId)   REFERENCES customer (id),
  CONSTRAINT fk_treatment_designer   FOREIGN KEY (designerId)   REFERENCES shop_user (id),
  CONSTRAINT fk_treatment_copiedFrom FOREIGN KEY (copiedFromId) REFERENCES treatment (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 기록(방문 단위)';

-- 방문 1회에 여러 시술 (커트 + 염색 + 클리닉)
CREATE TABLE treatment_item (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  treatmentId      BIGINT UNSIGNED NOT NULL,
  serviceMenuId    BIGINT UNSIGNED NULL COMMENT '메뉴에 없는 시술이면 NULL',
  menuName         VARCHAR(100) NOT NULL COMMENT '시술명 스냅샷 (메뉴명이 바뀌어도 이력 유지)',
  price            INT          NOT NULL DEFAULT 0 COMMENT '실제 적용 가격 스냅샷',
  sortOrder        INT          NOT NULL DEFAULT 0,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_treatment_item_treatment (treatmentId, delState),
  CONSTRAINT fk_treatment_item_shop      FOREIGN KEY (shopId)        REFERENCES shop (id),
  CONSTRAINT fk_treatment_item_treatment FOREIGN KEY (treatmentId)   REFERENCES treatment (id),
  CONSTRAINT fk_treatment_item_menu      FOREIGN KEY (serviceMenuId) REFERENCES service_menu (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 항목';

-- 레시피 (약제 / 컬러 / 비율 / 방치시간) — 시술 항목 1개에 여러 줄
CREATE TABLE treatment_recipe (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  treatmentItemId  BIGINT UNSIGNED NOT NULL,
  area             VARCHAR(50)  NULL COMMENT '적용 부위: 뿌리 / 기장 / 전체 / 앞머리',
  productName      VARCHAR(100) NULL COMMENT '약제·제품명 (예: 로레알 마지렐)',
  colorCode        VARCHAR(50)  NULL COMMENT '컬러 번호 (예: 7N, 6.3)',
  mixRatio         VARCHAR(50)  NULL COMMENT '혼합 비율 (예: 1:1.5)',
  developerPct     DECIMAL(4,1) NULL COMMENT '산화제 % (예: 6.0)',
  amountGram       DECIMAL(6,1) NULL COMMENT '사용량(g)',
  processingMin    SMALLINT     NULL COMMENT '방치 시간(분)',
  rodSize          VARCHAR(50)  NULL COMMENT '펌 로드 사이즈',
  heatTemp         SMALLINT     NULL COMMENT '열처리 온도(℃)',
  memo             VARCHAR(500) NULL,
  sortOrder        INT          NOT NULL DEFAULT 0,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_treatment_recipe_item (treatmentItemId, delState),
  CONSTRAINT fk_treatment_recipe_shop FOREIGN KEY (shopId)          REFERENCES shop (id),
  CONSTRAINT fk_treatment_recipe_item FOREIGN KEY (treatmentItemId) REFERENCES treatment_item (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 레시피';

-- 시술 전후 사진 (P1)
CREATE TABLE treatment_photo (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  treatmentId      BIGINT UNSIGNED NOT NULL,
  photoType        VARCHAR(10)  NOT NULL DEFAULT 'AFTER' COMMENT 'BEFORE / AFTER / ETC',
  storageKey       VARCHAR(255) NOT NULL COMMENT '스토리지 객체 키 (S3 호환) — 서버 경로 저장 금지',
  thumbKey         VARCHAR(255) NULL,
  fileSize         INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'bytes',
  width            SMALLINT UNSIGNED NULL,
  height           SMALLINT UNSIGNED NULL,
  sortOrder        INT          NOT NULL DEFAULT 0,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_treatment_photo_treatment (treatmentId, delState),
  CONSTRAINT fk_treatment_photo_shop      FOREIGN KEY (shopId)      REFERENCES shop (id),
  CONSTRAINT fk_treatment_photo_treatment FOREIGN KEY (treatmentId) REFERENCES treatment (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시술 사진';

-- ---------------------------------------------------------------------
-- 5. 음성 / AI (STT 엔진 교체 가능 구조)
-- ---------------------------------------------------------------------

-- 녹음 1건 → STT → LLM 구조화 → 사용자 검토 → treatment 확정
CREATE TABLE voice_record (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  userId           BIGINT UNSIGNED NOT NULL COMMENT '녹음한 사용자',
  customerId       BIGINT UNSIGNED NULL COMMENT '녹음 시점에 고객을 몰라도 됨',
  treatmentId      BIGINT UNSIGNED NULL COMMENT '확정되면 연결',
  storageKey       VARCHAR(255) NULL COMMENT '원본 음성 객체 키',
  mimeType         VARCHAR(50)  NULL COMMENT 'audio/webm, audio/mp4 ...',
  durationSec      DECIMAL(7,2) NULL,
  fileSize         INT UNSIGNED NULL,
  sttProvider      VARCHAR(20)  NOT NULL DEFAULT 'CLOVA' COMMENT 'CLOVA / WHISPER / GOOGLE ... (엔진 교체 대비)',
  sttStatus        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / PROCESSING / DONE / FAILED',
  sttRequestId     VARCHAR(100) NULL COMMENT '외부 엔진 작업 ID',
  transcript       TEXT         NULL COMMENT 'STT 원문',
  sttErrorMsg      VARCHAR(500) NULL,
  aiProvider       VARCHAR(20)  NULL COMMENT 'LLM 제공자',
  aiModel          VARCHAR(50)  NULL,
  aiStatus         VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / DONE / FAILED / SKIPPED',
  aiResult         JSON         NULL COMMENT 'LLM 구조화 결과 원본 (검토 화면 초기값)',
  promptVersion    VARCHAR(20)  NULL COMMENT '프롬프트 버전 — 품질 비교용',
  fileExpireAt     DATETIME     NULL COMMENT '원본 음성 자동 삭제 예정일 (예: +30일)',
  fileDeletedAt    DATETIME     NULL COMMENT '원본 파일 실제 삭제 시각 (행은 유지)',
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_voice_record_shop      (shopId, createdAt),
  KEY idx_voice_record_treatment (treatmentId),
  KEY idx_voice_record_stt       (sttStatus),
  KEY idx_voice_record_expire    (fileExpireAt, fileDeletedAt),
  CONSTRAINT fk_voice_record_shop      FOREIGN KEY (shopId)      REFERENCES shop (id),
  CONSTRAINT fk_voice_record_user      FOREIGN KEY (userId)      REFERENCES shop_user (id),
  CONSTRAINT fk_voice_record_customer  FOREIGN KEY (customerId)  REFERENCES customer (id),
  CONSTRAINT fk_voice_record_treatment FOREIGN KEY (treatmentId) REFERENCES treatment (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='음성 녹음/STT/AI 결과';

-- 외부 API 사용량 (원가 계산·매장별 사용량) — 로그, delState 없음
CREATE TABLE ai_usage_log (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  voiceRecordId    BIGINT UNSIGNED NULL,
  usageType        VARCHAR(10)  NOT NULL COMMENT 'STT / LLM',
  provider         VARCHAR(20)  NOT NULL,
  model            VARCHAR(50)  NULL,
  inputUnits       INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'STT: 초 / LLM: 입력 토큰',
  outputUnits      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'LLM: 출력 토큰',
  costKrw          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '추정 비용(원)',
  isSuccess        TINYINT      NOT NULL DEFAULT 1,
  latencyMs        INT UNSIGNED NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_usage_shop (shopId, createdAt),
  KEY idx_ai_usage_type (usageType, provider, createdAt),
  CONSTRAINT fk_ai_usage_shop  FOREIGN KEY (shopId)        REFERENCES shop (id),
  CONSTRAINT fk_ai_usage_voice FOREIGN KEY (voiceRecordId) REFERENCES voice_record (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='외부 AI API 사용량';

-- ---------------------------------------------------------------------
-- 6. 정산 (결제 "기록" — PG 연동 아님)
-- ---------------------------------------------------------------------

CREATE TABLE prepaid_pass (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  customerId       BIGINT UNSIGNED NOT NULL,
  passName         VARCHAR(100) NOT NULL COMMENT '30만원 정액권 등',
  chargeAmount     INT          NOT NULL DEFAULT 0 COMMENT '고객이 실제 낸 금액',
  bonusAmount      INT          NOT NULL DEFAULT 0 COMMENT '추가 적립(서비스) 금액',
  balance          INT          NOT NULL DEFAULT 0 COMMENT '현재 잔액 (prepaid_transaction 합과 일치해야 함)',
  purchasedAt      DATETIME     NOT NULL,
  expireAt         DATE         NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / EXHAUSTED / REFUNDED / EXPIRED',
  memo             VARCHAR(500) NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_prepaid_pass_customer (shopId, customerId, status),
  CONSTRAINT fk_prepaid_pass_shop     FOREIGN KEY (shopId)     REFERENCES shop (id),
  CONSTRAINT fk_prepaid_pass_customer FOREIGN KEY (customerId) REFERENCES customer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='선불권/정액권';

-- 결제 1건 (방문 1회 기준). 선불권 "충전" 결제도 여기 기록 (treatmentId NULL)
CREATE TABLE payment (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  customerId       BIGINT UNSIGNED NULL,
  treatmentId      BIGINT UNSIGNED NULL COMMENT '시술 결제면 연결',
  prepaidPassId    BIGINT UNSIGNED NULL COMMENT '선불권 구매 결제면 연결',
  createdBy        BIGINT UNSIGNED NOT NULL COMMENT 'shop_user.id',
  paymentType      VARCHAR(20)  NOT NULL DEFAULT 'SERVICE' COMMENT 'SERVICE:시술 PASS_SALE:선불권 판매 PRODUCT:제품 판매',
  listAmount       INT          NOT NULL DEFAULT 0 COMMENT '정가 합계',
  discountAmount   INT          NOT NULL DEFAULT 0,
  discountReason   VARCHAR(100) NULL,
  finalAmount      INT          NOT NULL DEFAULT 0 COMMENT 'listAmount - discountAmount',
  paidAt           DATETIME     NOT NULL,
  businessDate     DATE         NOT NULL COMMENT '영업일 기준 날짜 (자정 넘긴 마감 대비)',
  status           VARCHAR(20)  NOT NULL DEFAULT 'PAID' COMMENT 'PAID / CANCELLED',
  cancelledAt      DATETIME     NULL,
  memo             VARCHAR(500) NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_payment_date      (shopId, businessDate, status, delState),
  KEY idx_payment_customer  (shopId, customerId, paidAt),
  KEY idx_payment_treatment (treatmentId),
  CONSTRAINT fk_payment_shop      FOREIGN KEY (shopId)        REFERENCES shop (id),
  CONSTRAINT fk_payment_customer  FOREIGN KEY (customerId)    REFERENCES customer (id),
  CONSTRAINT fk_payment_treatment FOREIGN KEY (treatmentId)   REFERENCES treatment (id),
  CONSTRAINT fk_payment_pass      FOREIGN KEY (prepaidPassId) REFERENCES prepaid_pass (id),
  CONSTRAINT fk_payment_createdBy FOREIGN KEY (createdBy)     REFERENCES shop_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='결제';

-- 결제수단별 분할 (카드 5만 + 현금 2만, 선불권 차감 등)
CREATE TABLE payment_detail (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  paymentId        BIGINT UNSIGNED NOT NULL,
  prepaidPassId    BIGINT UNSIGNED NULL COMMENT 'method=PREPAID 일 때 차감한 선불권',
  method           VARCHAR(20)  NOT NULL COMMENT 'CASH / CARD / TRANSFER / PREPAID / ETC',
  amount           INT          NOT NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_payment_detail_payment (paymentId, delState),
  KEY idx_payment_detail_method  (shopId, method),
  CONSTRAINT fk_payment_detail_shop    FOREIGN KEY (shopId)        REFERENCES shop (id),
  CONSTRAINT fk_payment_detail_payment FOREIGN KEY (paymentId)     REFERENCES payment (id),
  CONSTRAINT fk_payment_detail_pass    FOREIGN KEY (prepaidPassId) REFERENCES prepaid_pass (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='결제수단 상세';

-- 선불권 잔액 변동 원장 (잔액은 이 테이블로 언제든 재계산 가능)
CREATE TABLE prepaid_transaction (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  prepaidPassId    BIGINT UNSIGNED NOT NULL,
  paymentId        BIGINT UNSIGNED NULL,
  paymentDetailId  BIGINT UNSIGNED NULL,
  createdBy        BIGINT UNSIGNED NOT NULL,
  txType           VARCHAR(20)  NOT NULL COMMENT 'CHARGE / USE / REFUND / ADJUST / CANCEL_USE',
  amount           INT          NOT NULL COMMENT '+충전 / -사용',
  balanceAfter     INT          NOT NULL,
  memo             VARCHAR(255) NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_prepaid_tx_pass (prepaidPassId, createdAt),
  CONSTRAINT fk_prepaid_tx_shop      FOREIGN KEY (shopId)          REFERENCES shop (id),
  CONSTRAINT fk_prepaid_tx_pass      FOREIGN KEY (prepaidPassId)   REFERENCES prepaid_pass (id),
  CONSTRAINT fk_prepaid_tx_payment   FOREIGN KEY (paymentId)       REFERENCES payment (id),
  CONSTRAINT fk_prepaid_tx_detail    FOREIGN KEY (paymentDetailId) REFERENCES payment_detail (id),
  CONSTRAINT fk_prepaid_tx_createdBy FOREIGN KEY (createdBy)       REFERENCES shop_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='선불권 거래 원장';

-- 일 마감 스냅샷 (카드 단말기 금액과 대조)
CREATE TABLE daily_closing (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  closedBy         BIGINT UNSIGNED NOT NULL,
  businessDate     DATE         NOT NULL,
  cashAmount       INT          NOT NULL DEFAULT 0,
  cardAmount       INT          NOT NULL DEFAULT 0,
  transferAmount   INT          NOT NULL DEFAULT 0,
  prepaidAmount    INT          NOT NULL DEFAULT 0 COMMENT '선불권 차감액 (실입금 아님)',
  etcAmount        INT          NOT NULL DEFAULT 0,
  totalAmount      INT          NOT NULL DEFAULT 0,
  paymentCount     INT          NOT NULL DEFAULT 0,
  actualCash       INT          NULL COMMENT '실제 시재(입력값)',
  actualCard       INT          NULL COMMENT '단말기 합계(입력값)',
  memo             VARCHAR(500) NULL,
  closedAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  activeKey        TINYINT AS (IF(delState = 0, 1, NULL)) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_closing (shopId, businessDate, activeKey),
  CONSTRAINT fk_daily_closing_shop     FOREIGN KEY (shopId)   REFERENCES shop (id),
  CONSTRAINT fk_daily_closing_closedBy FOREIGN KEY (closedBy) REFERENCES shop_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='일 마감';

-- ---------------------------------------------------------------------
-- 7. 운영 / 감사
-- ---------------------------------------------------------------------

CREATE TABLE feedback (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NOT NULL,
  userId           BIGINT UNSIGNED NOT NULL,
  repliedBy        BIGINT UNSIGNED NULL COMMENT 'admin_user.id',
  category         VARCHAR(20)  NOT NULL DEFAULT 'ETC' COMMENT 'BUG / REQUEST / QUESTION / ETC',
  content          TEXT         NOT NULL,
  pageUrl          VARCHAR(255) NULL COMMENT '보낸 화면',
  status           VARCHAR(20)  NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN / IN_PROGRESS / DONE',
  reply            TEXT         NULL,
  repliedAt        DATETIME     NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delState         TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_feedback_status (status, createdAt),
  CONSTRAINT fk_feedback_shop      FOREIGN KEY (shopId)    REFERENCES shop (id),
  CONSTRAINT fk_feedback_user      FOREIGN KEY (userId)    REFERENCES shop_user (id),
  CONSTRAINT fk_feedback_repliedBy FOREIGN KEY (repliedBy) REFERENCES admin_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='사용자 피드백';

-- 변경 이력 — 로그, delState 없음. 소프트 삭제도 action='DELETE'로 남김
CREATE TABLE audit_log (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shopId           BIGINT UNSIGNED NULL,
  actorType        VARCHAR(10)  NOT NULL COMMENT 'SHOP / ADMIN / SYSTEM',
  actorId          BIGINT UNSIGNED NULL,
  action           VARCHAR(20)  NOT NULL COMMENT 'CREATE / UPDATE / DELETE / RESTORE / LOGIN / EXPORT',
  targetTable      VARCHAR(50)  NOT NULL,
  targetId         BIGINT UNSIGNED NULL,
  beforeData       JSON         NULL,
  afterData        JSON         NULL,
  ip               VARCHAR(45)  NULL,
  userAgent        VARCHAR(255) NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_target (targetTable, targetId),
  KEY idx_audit_shop   (shopId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='감사 로그';

SET FOREIGN_KEY_CHECKS = 1;
