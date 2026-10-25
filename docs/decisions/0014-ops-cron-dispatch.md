# 0014. 수집 예약은 Supabase pg_cron 이 GitHub 워크플로를 실행시킨다 (대책 2)

- 날짜: 2026-10-25
- 상태: 확정 (2026-10-25 사용자 승인)

## 왜

GitHub Actions 예약 실행(schedule)은 몰리면 늦거나 건너뛴다. 10/25 기록: 02시 회차가 2시간 14분 늦게 시작(마감 03:30 넘김, "지연 수집"), 17시 회차는 17:15·17:35·17:55 세 번 걸어 둔 예약이 17:50까지 하나도 돌지 않음, 매시간 감시는 14시간 동안 4번. 11/04 공개 판단 기준("예약 수집 사흘 연속 정상")을 맞출 수 없다.

## 결정

- **Supabase pg_cron 이 정한 시각에 pg_net 으로 GitHub API `workflow_dispatch` 를 불러 croplib-dp 워크플로를 실행한다** (`supabase/migrations/20261026010000_ops_dispatch_cron.sql`).
  - 물 수집 `collect.yml`: 02:15·02:45, 17:15·17:45 KST (두 번째는 예비, 이미 정시 성공이면 `--skip-if-done` 으로 바로 끝남)
  - 적산온도·적산일사 `heat-sun.yml`: 09:20 KST (DB 쓰기 켬)
  - 수집 감시 `monitor.yml`: 매시간 40분
- **GitHub 예약(schedule)은 예비로 남긴다.** 두 경로가 겹쳐도 같은 회차를 두 번 쓰지 않는다(`concurrency: collect` + `--skip-if-done`).
- **토큰:** 사용자가 GitHub fine-grained 토큰(croplib-dp 하나, Actions 읽기·쓰기만)을 만들어 Supabase Vault 에 `github_dispatch_token` 이름으로 직접 넣는다. 저장소·채팅·커밋에 적지 않는다(CLAUDE.md 3번). 테스트가 마이그레이션에 토큰 모양 문자열이 없는지 검사한다.
- **운영 이름공간 `ops`:** 실행 함수와 최근 요청 결과(`ops.dispatch_recent`)를 둔다. 화면(anon)·회원(authenticated)은 쓸 수도 볼 수도 없다.
- **확인:** `select * from ops.dispatch_recent;` 에서 GitHub 응답 204 = 정상. 실패해도 GitHub 예약이 예비로 돌고, 감시가 늦은 회차를 경고한다.

## 남은 것

- 토큰 만료일(최대 1년)이 오기 전에 바꾼다. 만료일을 일정에 적어 둔다.
- 실행 시각이 정확해지면 GitHub 예약을 줄일지(호출 수) 11/04 판단 때 본다.
