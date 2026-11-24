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
docker compose up -d mariadb seaweedfs

# 3. 의존성 설치 · 스키마 생성
npm install
npm run build -w @beauty-crm/shared
npm run db:migrate

# 4. 개발 서버
npm run dev                        # web: http://localhost:3000  api: http://localhost:4000/api
```

`http://localhost:3000` 에서 웹 / API / DB / 파일 저장소가 모두 "정상" 이면 0단계 완료.

## 회사 서버 배포

```bash
cp .env.example .env               # 운영 값으로 수정 (NODE_ENV=production)
docker compose --profile app up -d --build
```

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
