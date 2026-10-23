# CLAUDE.md

## 공통 규칙

<!-- prettier-ignore-start -->
3. 비밀키는 환경변수로만 쓴다. 서버 키는 화면 코드에 넣지 않는다. 키를 대화창이나 파일에 적지 않는다.
4. 한 번에 이슈 하나, PR 하나. 파일 3개 이상을 바꾸는 작업은 계획을 먼저 보여 주고 승인받는다.
5. 테스트를 먼저 쓴다. 실패한 테스트를 통과시키려고 테스트를 지우거나 기준을 낮추지 않는다.
8. 커밋은 feat: fix: docs: 로 시작한다. 코드를 바꾸면 같은 PR에서 docs/ 도 고치고, 중요한 결정은 docs/decisions/ 에 남긴다.
9. 사용자는 개발자가 아니다. git·배포는 알아서 하되, 무엇을 했는지 쉬운 말로 보고한다.
<!-- prettier-ignore-end -->

## CropMon 전용 규칙

### 프로젝트 배경

- 노지 작물 물수지(FAO-56) 결과를 보여 주는 공개 웹 서비스. Next.js + Supabase + Vercel.
- 계산은 하지 않는다. 별도 저장소(cropwater, Python)가 계산해 Supabase에 올리고, 이 저장소는 DB 값을 보여 준다.
- 사용자(나)는 개발자가 아니다.

### 프로젝트 규칙

<!-- prettier-ignore-start -->
1. 이 저장소는 화면과 DB 구조만 맡는다. 계산하지 않고 DB 값을 보여 준다. 계산이 필요해 보이면 멈추고 묻는다.
2. 테이블 변경은 supabase/migrations/ 와 docs/DATA_CONTRACT.md 를 같은 PR에서 고치고 계약 버전을 올린다. 새 테이블은 RLS를 켜고 정책을 같은 파일에 쓴다.
6. 화면에는 자료 출처, 발표 회차, 마지막 갱신 시각, 결측("자료 없음")을 항상 표시한다.
7. 문구는 농업인이 이해하는 쉬운 말로, 약어는 FOS·GW 등 프로젝트 표기를 따른다. 휴대폰 화면을 먼저 만든다.
<!-- prettier-ignore-end -->

### 개발 명령어

- `npm run dev` — 내 컴퓨터에서 화면을 띄워 본다 (http://localhost:3000).
- `npm run lint` — 코드 규칙(ESLint)을 검사한다. domain 폴더가 바깥을 불러오는지도 여기서 걸린다.
- `npm run typecheck` — 타입(TypeScript) 오류가 없는지 검사한다.
- `npm run format` — 코드 모양(Prettier)을 자동으로 정리한다. 검사만 하려면 `npm run format:check`.
- `npm run test` — 테스트(Vitest)를 실행한다.
- `npm run build` — 배포용으로 만들어 본다. 여기서 실패하면 배포도 실패한다.
- `npm run test:e2e` — 실제 브라우저(Playwright)로 쪽을 열어 본다. 먼저 `npm run build` 를 해 둔다. 처음 한 번은 `npx playwright install chromium`.
- `design/` 은 시안 원본이다. 고치지 않고, git 에 올리지 않는다. Prettier·ESLint 도 건너뛴다.

### 환경변수와 SQL

- 환경변수: `.env.example` 을 `.env.local` 로 복사하고, 사용자가 값을 직접 채운다. Claude 는 값을 묻거나 적지 않는다. `.env.local` 은 git 에 올라가지 않는다.
- 배포(Vercel)에는 Settings → Environment Variables 에 같은 값을 사용자가 넣는다. CI 에는 가짜 값만 쓴다.
- SQL: Supabase 대시보드 → SQL Editor 에 `supabase/migrations/` 파일을 이름 순서대로 붙여 넣고 Run. 마이그레이션은 여러 번 실행해도 오류가 나지 않게 쓴다.
- 연결 확인: `/api/health`.

자동 검사(CI)는 PR과 main 에서 lint → typecheck → format:check → test → build → test:e2e 순서로 돈다. 구조는 docs/ARCHITECTURE.md 참고.
