# 변경 기록

이 저장소의 주요 변경을 버전별로 적는다.

## [Unreleased]

### 추가 (파비콘 적용 — 이슈 #29)

- Next.js 파일 규칙에 따라 `src/app/` 에 파비콘 및 앱 아이콘 적용: `favicon.ico`(16·32·48 멀티 해상도), `icon.png`(512×512), `apple-icon.png`(180×180, iOS 검은 배경 방지용 흰 배경)
- 화면 테스트 `e2e/pages.spec.ts` 에 파비콘 및 홈 화면 아이콘 연결·응답 확인 추가
- `docs/ARCHITECTURE.md` 에 파비콘 파일 위치 및 규칙 추가

### 추가 (토양·도매시장 "준비 중" 본문 — 이슈 #27)

- `/soil`·`/market` 본문을 시안대로: 위 큰 카드(말풍선 "준비하고 있어요"·캐릭터·"이 메뉴가 답할 질문"과 질문), 아래 두 칸("열리면 보여 줄 것" 4개 | "쓸 자료"와 "지금은 자료 없음", "그동안 물 판정 보기" 버튼). 두 메뉴가 같은 조각(`ComingSoon`)에 글만 다르게 들어감
- 글은 `src/services/shell.ts` 의 `getComingSoon` 값으로, 질문은 쪽 정보(`PAGE_INFO`)에서 읽음(두 곳에 적지 않음). 도매시장 ①은 고른 작물 이름
- "그동안 물 판정 보기"는 물 화면으로 가며 지역·작물·재배 방식을 주소에 남김. DB 읽기·마이그레이션 없음
- 토큰 추가: `--text-soon-question`, `--radius-bubble`. 화면 테스트 `e2e/pages.spec.ts` (390·1280 폭)

### 바꿈 (종합 화면 온도·햇빛을 DB 값으로, 온1 마무리 — 이슈 #22)

- 종합 화면 온도 카드("평년보다 생육 N일 빠름", 적산온도 올해 / 평년)와 햇빛 카드("올해 햇빛은 평년의 N%", 적산일사), 전국 표 "생육 (적산온도)"·"생육 (적산일사)" 칸이 DB 값. "예시" 표시를 뗌. 자료가 없거나 DB 실패면 회색 "자료 없음"
- 읽기는 온도·햇빛 화면 지역 비교와 같은 함수(`src/services/growth-latest.ts`)로 모으고, 종합 화면은 판정 표와 따로 5분 캐시(`loadGrowth`)
- 태백 햇빛도 DB 기준 (자료가 있으면 보임)
- `src/mocks/home.ts` 지움. 결정 0003 대체됨(전부), 0011 갱신, 결정 기록 `docs/decisions/0017-home-heat-sun.md`

### 추가 (햇빛 화면 본문, 온1 — 이슈 #21)

- 햇빛 화면이 DB(`sun_daily`)를 읽음: 올해 쌓인 햇빛("올해 햇빛은 평년의 N%", 적산일사 올해 / 평년, 설명 한 줄), 적산일사 누적 그래프(올해·평년·오늘), 월별 햇빛(올해·평년 막대, 평년 대비 %, 95% 미만 주황, "10월은 24일까지"), 지역 비교 10곳(누르면 그 지역)
- 그 지점 `sun_daily` 줄이 없으면 "○○ 관측소는 햇빛을 재지 않아요"와 춘천·안동 버튼 (판단은 DB 기준, `measuresSunlight` 정리는 별도 이슈)
- 햇빛 자료 상자 출처에 평년 기간을 붙임 ("평년값 1991–2020" 지움). 누적 그래프 카드는 온도·햇빛이 함께 씀
- 화면 테스트용 가짜 DB 에 적산일사 표 (`e2e/fake-supabase.mjs`, 진주는 줄 없음), `e2e/sunlight.spec.ts`. 결정 기록 `docs/decisions/0016-sunlight-screen.md`

### 추가 (온도 화면 본문, 온1 — 이슈 #20)

- 온도 화면이 DB(`heat_daily`, `crops.gdd_stages`)를 읽음: 생육 속도("평년보다 생육 N일 빠름", 적산온도 올해 / 평년 (+차이), 기준 온도), 적산온도 단계 카드 2개(올해·평년 도달일, 아직이면 "아직"), 누적 그래프(올해·평년·오늘), 저온요구량 "준비 중", 지역 비교 10곳(누르면 그 지역)
- 시안과 다르게: 평년 기간은 DB 값(2016–2025), 기준 온도는 DB 값(4℃), 만개·수확 카드 대신 단계 카드, "올해 예상" 점선 없음, 지역 비교 눈금은 날 수가 크면 넓힘 — 결정 기록 `docs/decisions/0015-temperature-screen.md`
- 온도 자료 상자 출처에 평년 기간을 붙임 ("평년값 1991–2020" 지움)
- 화면 테스트용 가짜 DB 에 적산온도 표·작물 단계 (`e2e/fake-supabase.mjs`), `e2e/temperature.spec.ts`

### 추가 (수집 예약을 Supabase 가 직접, 대책 2)

- Supabase pg_cron → GitHub `workflow_dispatch` 로 croplib-dp 수집(02:15·02:45·17:15·17:45), 적산온도(09:20), 감시(매시간 40분)를 정시에 실행 — `supabase/migrations/20261026010000_ops_dispatch_cron.sql`. 토큰은 Vault 에만
- 결정 기록 `docs/decisions/0014-ops-cron-dispatch.md`

### 추가 (데이터 계약 v1.4, 온1)

- 적산온도 `heat_daily`, 적산일사 `sun_daily` — `supabase/migrations/20261026000000_data_contract_v1_4.sql`. 평년은 지난 10년(2016–2025) 같은 날 평균
- 작물 사전에 적산온도 기준온도 `t_base_c`·단계 `gdd_stages` (사과·배추 4℃)
- `docs/DATA_CONTRACT.md` v1.3 → v1.4, 결정 기록 `docs/decisions/0013-contract-v1-4-heat-sun.md`

### 바꿈 (예보 수집 10곳, 물6)

- 단기예보를 10곳 모두 받음 — `supabase/migrations/20261025010000_forecast_all_stations.sql` (사전 값만, 구조 그대로)
- 춘천 밖 지점은 물 화면 ②에 "예보 범위는 춘천 값을 빌려 써서 아직 검증 전" 안내
- 결정 기록 `docs/decisions/0012-forecast-all-stations.md`

### 추가 (종합 화면 DB 연결, 첫1)

- 종합 화면 물 카드와 전국 표가 DB 의 지점 판정 표를 씀: 판정 문구·배지·부족한 물·게이지, 앞으로 3일(예보 지점), 첫 줄 갱신 시각·회차
- 예보가 없는 지점은 앞날을 말하지 않고 "어제까지 관측 기준", 전국 표 앞으로 3일은 "예보 준비 중" (물 화면도 같은 문구)
- 온도·햇빛 카드와 표의 적산온도·적산일사 칸은 시안 예시 값에 "예시" 표시
- 종합 화면 예시 물 판정 값을 지움. 결정 기록 `docs/decisions/0011-home-db.md`

### 추가 (공통 틀 DB 연결, 기5)

- 지역 칩 점 색이 DB 의 오늘 물 판정 (기본 재배 방식의 최신 회차 출발 상태, 없으면 최근 관측 물수지, 둘 다 없으면 회색 "자료 없음"). 화면 읽기 도구에는 판정 이름을 읽어 줌
- 온도·햇빛 자료 상자의 갱신 시각이 그 지점 ASOS 관측을 받은 실제 시각 (예시 "8월 12일" 대신)
- 지점 목록을 예시 값 폴더에서 `src/infra/stations.ts` 로 옮김 (예시 판정 값은 지움)
- 결정 기록 `docs/decisions/0010-shell-status.md`

### 추가 (물 화면 본문, 물5)

- 시안대로 물 화면 본문: 기준 날짜 줄(전날·다음날·날짜 고르기·오늘로), ① 지금 토양 상태(판정 문구, 배지 둘, 게이지, ETo·ETc·비, 휴면기 안내, 토성 말풍선), ② 앞으로 3일(02·17시 발표 고르기, 관수 필요 예상일·권장 관수량, 마지막 참고일), ③ 2026 작기 돌아보기(ETo·ETc·비 그래프, 부족한 물 그래프, 누르면 그날로, 월별 요약)
- 지난 날을 고르면 그날 관측 물수지와 다음 3일 관측값(없으면 예보)
- 화면 테스트용 가짜 Supabase `e2e/fake-supabase.mjs`, 물 화면 브라우저 테스트(날짜 이동, 재배 방식, 휴면기, DB 오류, 휴대폰 폭)
- 결정 기록 `docs/decisions/0009-water-screen.md`

### 추가 (물 화면 DB 연결, 물5 첫 단계)

- 물 화면이 DB(데이터 계약 v1.3)를 읽는다: 지금 토양 상태, 관수 필요 예상일(중심·빠르면·늦으면), 권장 관수량, 자료 상자의 실제 발표 회차·갱신 시각(백업 회차는 표시)
- 재배 방식 선택(사과 4가지, 기본 초생 재배). 주소창 `&kc=`
- 주소창 `cabbage` → DB `kimchi_cabbage`
- DB에 닿지 못하면 "자료 없음"과 이유. 본문 카드·3일 표·작기 그래프는 시안을 받아 다음 PR
- 결정 기록 `docs/decisions/0008-water-db-read.md`

### 추가 (데이터 계약 v1.3)

- 3일 전망 요약 `water_outlook_summary` — `supabase/migrations/20261025000000_data_contract_v1_3.sql`. 서비스 엑셀 "관수 전망" 위쪽과 같은 내용: 출발 상태, 관수 필요 예상일(중심·빠르면·늦으면, 주 지표 3일), 권장 관수량, 3일 합
- `docs/DATA_CONTRACT.md` v1.2 → v1.3, 결정 기록 `docs/decisions/0007-outlook-summary.md`

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
