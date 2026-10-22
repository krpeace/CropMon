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

## [0.0.0] - 2026-10-22

### 추가

- 개발 규칙 세팅: CLAUDE.md, README.md, .gitignore, .env.example, PR 체크리스트 템플릿
