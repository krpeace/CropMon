# 0034. Supabase 를 서울 리전으로 옮긴다

- 날짜: 2026-11-02 (이전 작업), 2026-11-07 (기록)
- 상태: 확정 (2026-11-02 사용자 결정, 2026-11-03 검증 완료)

## 왜

Supabase 프로젝트가 시드니(ap-southeast-2)에 있어 화면이 느렸다. Vercel 함수는 이미 서울(icn1)에서 돌고 있었으므로, 화면 요청마다 서울 → 시드니 DB 를 오가는 구간이 지연의 원인이었다.

Supabase 는 프로젝트의 리전을 바꾸는 기능이 없다. 리전을 바꾸려면 새 리전에 프로젝트를 만들고 옮겨야 한다. 11/06 비회원 공개 전이고 회원(Auth)이 없어서, 지금이 옮기기 가장 쉬운 때였다.

## 결정

- **Supabase 와 Vercel 함수를 같은 서울 리전에 둔다.** Supabase = 서울(ap-northeast-2), Vercel 함수 = 서울(icn1). 어느 한쪽을 바꿀 때는 다른 쪽도 같은 리전인지 확인한다.
- 새 서울 프로젝트 이름을 `CropMon` 으로 하고, 옛 시드니 프로젝트는 `CropMon(old)` 로 바꿔 검증 동안 두었다가 삭제했다 (2026-11-07 삭제 확인).
- 주소·키는 환경변수로만 쓰고 있어서 저장소 코드·문서에는 바꿀 곳이 없었다 (CLAUDE.md 3번).

## 옮긴 순서 (다시 옮길 때 그대로 쓴다)

1. **수집 멈추기:** 옛 프로젝트에서 `select cron.unschedule(jobname) from cron.job where jobname like 'croplib-%';`, croplib-dp 의 `collect.yml`·`heat-sun.yml`·`monitor.yml` 을 GitHub Actions 에서 Disable.
2. **새 프로젝트 만들기:** 리전 Seoul. 무료 요금제는 활성 프로젝트 2개까지.
3. **Vault 토큰 넣기 (마이그레이션보다 먼저):** croplib-dp Actions 읽기·쓰기 전용 fine-grained 토큰을 `github_dispatch_token` 이름으로 넣는다 (결정 0014). 토큰 값은 저장소·채팅에 적지 않는다.
4. **마이그레이션 실행:** SQL Editor 에 `supabase/migrations/` 파일을 이름 순서대로 붙여 넣고 Run. 표·RLS·사전 자료(seed)·예약(pg_cron)이 생긴다.
5. **수집 자료 복사:** 사전 표는 seed 가 채우므로 복사하지 않는다. 수집 표 8개(`forecast_runs`, `water_outlook`, `water_outlook_summary`, `soil_water_daily`, `water_balance_daily`, `heat_daily`, `sun_daily`, `weather_daily`)만 `pg_dump --data-only` 로 꺼내 `psql --single-transaction` 과 `session_replication_role = replica` 로 넣었다. 약 19만 행이라 SQL Editor·CSV 로는 무리였다. 과거 예보 자료(`forecast_runs`, `water_outlook*`)는 다시 받을 수 없으므로 반드시 복사한다.
6. **연결 정보 교체:** Vercel 환경변수(Production·Preview·Development) → 재배포, croplib-dp Actions Secrets, 로컬 `.env.local`.
7. **검증 후 재개:** croplib-dp 워크플로 Enable.

## 검증 결과

- 수집 표 8개의 행 수가 옛 DB 와 새 DB 에서 모두 같음.
- `forecast_runs.run_id`(자동 번호)가 복사 뒤 205~214 로 이어져 번호 충돌 없음.
- 11/03 02시 회차 10개 지점이 새 DB 에 "정시 성공"으로 기록됨. `ops.dispatch_recent` 에 02:15·02:40·02:45 요청이 모두 204.
- 11/03 09:20 적산온도·적산일사가 11/02 관측까지 새 DB 에 갱신됨.
- `/api/health` 정상, 화면 속도 개선 확인.

## 주의

- `ops.dispatch_recent`·`forecast_runs` 의 시각은 UTC 로 보인다 (KST = UTC + 9시간).
- 회원제(2027-01-01) 이후에 다시 옮기면 Auth 사용자·세션·Redirect URL 도 옮겨야 해서 훨씬 번거롭다.
