# 변경 기록

이 저장소의 주요 변경을 버전별로 적는다.

## [Unreleased]

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
