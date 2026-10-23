# 변경 기록

이 저장소의 주요 변경을 버전별로 적는다.

## [Unreleased]

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
