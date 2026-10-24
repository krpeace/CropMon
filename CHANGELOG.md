# 변경 기록

이 저장소의 주요 변경을 버전별로 적는다.

## [Unreleased]

### 고침 (데이터 계약 v1.2)

- `water_outlook.lead_day` 0~3 → 0~4. 저녁 회차는 D+1~D+4를 계산하는데 v1은 0~3만 받았다 — `supabase/migrations/20261024040000_data_contract_v1_2.sql`
- 원자료를 둘 비공개 Storage 버킷 `raw` (같은 파일, Supabase에서만 실행)
- `docs/DATA_CONTRACT.md` v1.1 → v1.2, 결정 기록 `docs/decisions/0006-contract-v1-2.md`

### 추가 (데이터 계약 v1.1, 재배 방식별 Kc)

- 재배 방식별 Kc 표 `crop_kc_sets` — `supabase/migrations/20261024020000_data_contract_v1_1.sql`. 사과는 FAO-56 Table 12 네 가지, 기본은 3번(초생 재배, 서리 지역 0.50 / 1.20 / 0.95)
- 계산 조건 `scenarios`에 `kc_set_id`. 공개 조건 20개 → 50개(지점 10 × (사과 4 + 배추 1)), 이름에 재배 방식 번호(`101-apple-main-k3-loam-2026`)
- 사전 자료 `20261024030000_seed_kc_sets.sql`: 재배 방식 5개, 계산 조건 50개, `crops`의 Kc 칸을 기본 재배 방식 값으로 맞춤
- v1 사전 자료 파일의 계산 조건 부분을 새 파일로 옮김 (다시 실행해도 오류가 나지 않게)
- `docs/DATA_CONTRACT.md` v1 → v1.1, 결정 기록 `docs/decisions/0005-kc-sets.md`

### 추가 (사전 자료, 공1·공2)

- `supabase/migrations/20261024010000_seed_dictionaries.sql`: 지점 10곳(좌표·고도·풍속계 높이·예보 격자), 작물 2개(사과·김치배추), 작형 5개(사과, 배추 봄·여름·가을·월동. 값은 사과와 여름배추만), 토성 12종(Table 19 9종, 3종 빈 칸), 기본 계산 조건 20개(지점 × 작물, 양토, 2026)
- 사전 자료 검사 테스트 `src/infra/supabase/seed.test.ts`: 화면과 같은 지점 10곳, 기본 작형·토성 하나, 토성 가운데 값, TAW·RAW(FAO-56 식 82·83), 작기 끝 날짜를 다시 계산해 확인

### 추가 (데이터 계약 v1)

- 공개 테이블 9개: `stations`, `crops`, `crop_seasons`, `soil_types`, `scenarios`, `forecast_runs`, `weather_daily`, `water_balance_daily`, `water_outlook` — `supabase/migrations/20261024000000_data_contract_v1.sql` (표만 만든다. 지점·작물·토성의 실제 값은 다음 PR)
- 작형 사전 `crop_seasons`: 배추처럼 작형이 여러 개인 채소를 위해 작물과 작형을 나눔
- 모든 테이블 RLS, 비회원·회원은 읽기만. `forecast_runs`의 `error`, `raw_path`는 공개하지 않음
- 토양수분 상태 다섯 가지를 코드로 저장: `need`(관수 필요), `caution`(주의), `normal`(보통), `wet`(과습), `dormant`(휴면기). 예보 전망에는 과습이 없음
- 화면의 상태 이름을 계약에 맞춤: 아직 여유 → 주의(`caution`), 토양 수분 충분 → 보통(`normal`), 과습 경고 → 과습. 색 토큰 이름도 같이 바꿈(색 값은 그대로)
- 계약 일치 테스트 `src/infra/supabase/contract.test.ts`: 계약서와 마이그레이션의 테이블 목록, RLS·읽기 정책·쓰기 권한 없음, 상태 코드를 검사
- `docs/DATA_CONTRACT.md` v0 → v1, 결정 기록 `docs/decisions/0004-data-contract-v1.md`

### 변경

- 서비스 이름을 CropMon 으로 바꿈 (화면 제목·부제·메타, package.json 의 name `cropmon`, README)
- CLAUDE.md 를 "공통 규칙"과 "CropMon 전용 규칙" 두 섹션으로 나눔 (규칙 내용은 그대로)
- 홈 화면의 "데이터베이스 연결" 표시를 뺌. 연결 확인은 `/api/health` 에서만
- 어두운 화면(다크 모드)을 뺌. 시안대로 밝은 화면만
- 자동 검사(CI)에 화면 테스트(test:e2e) 단계 추가

### 추가 (화면 껍데기, 데스크톱 시안 기준)

- 디자인 토큰 `src/app/tokens.css`: 시안의 색·글꼴(Pretendard CDN)·글자 크기·모서리·그림자·배치 기준 폭
- 공통 틀: 헤더(로고·메뉴 6개·로그인 "곧 열려요"), 지역 칩 10곳(점 색은 오늘 물 판정)·작물(사과·배추) 선택 줄, 바닥글, 로그인 안내·CropMon 소개 창
- 쪽 7개: `/`, `/temperature`, `/sunlight`, `/water`, `/soil`, `/market`, `/my-farm` — 제목·질문·짧은 갱신 표시·자료/발표/갱신 상자 (본문은 다음 작업)
- 종합 화면 첫 줄 "오늘 춘천 사과는 어떤가요?"와 5초 자동 전환(사과 10곳 → 배추 10곳), 멈춤 버튼
- 지역·작물 선택을 주소창(`?st=101&crop=apple`)에 남겨 모든 메뉴에 이어 줌 — `src/domain/selection.ts`
- 예시 값 `src/mocks/` 와 화면용 정리 `src/services/shell.ts`
- 화면 테스트(Playwright) `e2e/`: 모든 쪽이 열리는지, 지역·작물이 다른 메뉴에서도 유지되는지, 자동 전환

### 추가 (종합 화면 본문, 시안 예시 값)

- 물·온도·햇빛 카드: 판정 문구, 배지("내일 관수 필요" 포함), 숫자 줄, 부족한 물 게이지. 물 카드는 판정 색으로 옅게 칠함
- 토양·도매시장 "준비 중" 작은 카드
- 전국 물·기상·생육 종합 표 (10곳, 줄을 누르면 그 지역으로) — 데스크톱에서만
- "내 밭 단위로 보고 싶다면" 줄 → 내 농장 미리보기
- 지역·작물이 바뀌면 카드가 넘어가듯 나타나는 효과 (시안 그대로)
- 예시 값 `src/mocks/home.ts` (지점 10곳 × 작물 2종, 기준일 8월 12일)와 화면용 정리 `src/services/home.ts`

### 고침

- 기본 줄 높이를 시안과 같게(브라우저 기본) 맞춤. 표 줄·작은 카드가 시안보다 높던 문제
- 화면 테스트는 3100 번에 따로 띄움. 켜 둔 개발 서버(3000)에 붙어 엉뚱한 화면을 검사하던 문제

### 추가

- Next.js 16 뼈대 (App Router, TypeScript strict, `src/`, Tailwind CSS, npm), Node 24 (`.nvmrc`)
- 품질 도구: ESLint, Prettier, Vitest 와 스크립트 `lint`, `typecheck`, `format`, `format:check`, `test`, `build`
- 폴더 구조 `src/domain`, `src/services`, `src/infra`, `src/app` 와 `docs/ARCHITECTURE.md`
- domain 이 화면·DB를 불러오지 못하게 막는 ESLint 규칙
- `getFreshness`: 마지막 갱신 시각을 "N분 전"처럼 보여 주고, 13시간 넘게 갱신이 없으면 멈춤으로 표시
- 홈 페이지 (제목, "준비 중", 버전 표시)
- 자동 검사(CI) `.github/workflows/ci.yml`: PR과 main 에서 lint → typecheck → format:check → test → build
- CLAUDE.md 에 개발 명령어 섹션
- Supabase 연결 확인
  - DB: 연결 확인용 `public.app_health` 테이블 (RLS, 읽기 전용) — `supabase/migrations/20261022000000_app_health.sql`
  - 데이터 계약 `docs/DATA_CONTRACT.md` v0 (연결 확인용)
  - `/api/health`: 연결 상태 JSON (정상 200, 실패 503)
  - 홈 화면에 "데이터베이스 연결: 정상 / 확인 필요"와 확인 시각 표시
  - CI 의 test·build 단계에 가짜 Supabase 환경변수
  - README·CLAUDE.md 에 환경변수 설정과 SQL 실행 방법

## [0.0.0] - 2026-10-22

### 추가

- 개발 규칙 세팅: CLAUDE.md, README.md, .gitignore, .env.example, PR 체크리스트 템플릿
