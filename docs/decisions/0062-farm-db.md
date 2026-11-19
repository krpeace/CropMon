# 결정 0062: 농장 DB + 사전 — 농장 · 작기 · 관수 기록 · 계산 상태 · 결과 표, 작기 연도 규칙, 다시 계산 깨우기, 포도 (데이터 계약 v2.1) (이슈 #184, D1-2)

- 날짜: 2026-11-19
- 상태: 확정 (운영 DB 실행과 확인 SQL 통과는 사용자가 한 뒤 병합)
- 관련 이슈: #184 (순서표 #144 M2의 D1-2). 앞: 회원 DB(결정 0059). 뒤: D1-3(`heat_daily` · `sun_daily` 키 바꾸기), F1 · F2(농장 · 작물 설정 화면), W1 · W2 · W3(물 화면 · 관수 기록 · 쓰는 물), G1(포도), L6(회원 정보 · 탈퇴).
- 화면 변경은 없다. 계약은 `docs/DATA_CONTRACT.md` v2.1.

## 배경

1/1 회원제의 핵심은 "내 농장 기준 물 화면"이다. 그러려면 농장 · 작기 · 관수 기록 표와, croplib-dp가 농장별로 계산해 넣을 결과 표가 있어야 한다. **DB 구조의 주인은 CropMon**이고 croplib-dp는 쓰기만 한다. 이 저장소는 계산하지 않는다 — DB 함수가 하는 일은 **날짜 줄 만들기 · 권한 · 다시 계산 깨우기**까지이고 물수지 · 누적 · 판정은 croplib-dp다.

## 결정

### 1. 표 7개와 권한 (모두 RLS, 정책은 같은 파일)

| 표                                                                       | 회원 본인            | 다른 회원 · 비회원 | croplib-dp(서버 키)               |
| ------------------------------------------------------------------------ | -------------------- | ------------------ | --------------------------------- |
| `farms`, `irrigation_logs`                                               | 읽기 · 쓰기 · 지우기 | 없음               | 읽기                              |
| `farm_seasons`                                                           | 읽기만               | 없음               | 읽기 + `sync_farm_seasons` 부르기 |
| `farm_calc_status`                                                       | 읽기                 | 없음               | 읽기 · 쓰기                       |
| `farm_water_daily` · `farm_water_outlook` · `farm_water_outlook_summary` | 읽기                 | 없음               | 쓰기                              |

- 기준은 `auth.uid() = farms.user_id`이고 딸린 표는 `farm_id`로 주인을 따라간다. 회원이 못 고치는 열(`farm_id` · `user_id` · `created_at`, 로그의 `farm_id` · `log_id`)은 **열 단위 권한**으로 막는다(`members`와 같은 방식). 탈퇴(`auth.users` 삭제) 한 줄로 모든 농장 표가 연쇄 삭제된다(확인 SQL이 `delete_my_account()`로 확인).
- **`farms_one_per_user`**: `user_id` 유일 색인이 1/1의 "회원 1명 = 농장 1개"를 만든다. **여러 농장을 열 때는 이 색인만 지운다**(다른 것은 안 바뀐다).
- **작물 ↔ 작형 ↔ 재배 방식 관계는 합성 외래키로 DB가 지킨다**: `crop_seasons (season_type_id, crop_id)`와 `crop_kc_sets (kc_set_id, crop_id)`에 유일 색인을 더하고 `farms` · `farm_seasons`가 그 쌍을 가리킨다(비어 있으면 검사하지 않음). 거기에 `(crop_id = 'common') = (season_type_id is null)`(작물 공통이면 작형을 비우고, 아니면 필수) · 작물 공통이면 재배 방식 · 시작일 · 끝도 비움.
- **시작 월-일은 실제 있는 날만**: `public.is_valid_mmdd`가 02-29(어느 해에도 날짜가 있게 일부러 거절) · 04-31 · 06-31 같은 없는 날을 거절한다(`crop_seasons`의 옛 정규식은 04-31을 통과시키므로 새로 썼다).
- **필수 열**: 이슈가 "비어도 됨"이라고 적은 열만 비어도 되게 했다 → `address` · `stn_id` · `soil_code`는 필수(F1 설계의 필수 셋). `farms.crop_id`는 기본 `common`.
- `farm_water_*`는 공개 표와 **같은 열**에서 `scenario_id` → `farm_id`. 더한 열 `farm_season_id`(작기 밖이면 비움, 줄이 지워지면 비워짐) · `irr_l`(그날 계산에 넣은 L 합) · `taw_mm` · `raw_mm`. **최신 회차만** 남기므로 `farm_water_outlook`은 `(farm_id, target_date)`, `farm_water_outlook_summary`는 `farm_id`가 키이고 `run_id`는 열로 남는다(`forecast_runs` 외래키).
- **`etc_only`의 null 허용은 공개 표와 같다**: Dr · Ks · 판정 관련 열은 공개 표에서 이미 비어도 되는 열(`dr_prev_mm` · `ks` · `etc_adj_mm` · `dp_mm` · `dr_mm`, 전망의 `dr_*_mm`, 요약의 `dr_start_mm` · `need_*_in` · `advice_*_mm` · `etc_sum_mm`)이라 **더 풀 열이 없다**. 공개 표와 다른 곳은 `status` check에 `etc_only`가 더해진 것뿐이다.

### 2. 작기 연도 규칙 — `farm_season_window` 한 곳

- 시작 월-일 S(미정이면 `01-01`, 그 줄은 `start_unset = true`), 작기 일수 L = 작형의 단계 일수 합. 오늘(한국 날짜)이 [작년 S, S + L) 또는 [올해 S, S + L) 안이면 그 작기, 아니면 **다음에 올 S**. 끝 = 시작 + L − 1. 날짜 계산이지 물수지 계산이 아니다.
- 예) 포도 시설가온 S = 12-01, L = 190 → 2026-11-17은 "다음 작기 2026-12-01 ~ 2027-06-08", 2027-02-10은 "2026-12-01 시작 작기 중(끝 2027-06-08)".
- **`sync_farm_seasons(farm_id)`** (바깥, 서버 키만) / **`sync_farm_seasons_at(farm_id, 오늘)`** (안쪽, 아무도 못 부르고 확인 SQL이 "오늘"을 바꿔 부름). 하는 일: 지금 줄이 있으면 **고쳐 쓰고**(시작일을 바꿔도 새 줄을 만들지 않음), 없으면 규칙의 작기를 **만들고**(마지막 줄이 오늘 전에 끝난 경우 포함), **지난 줄은 고치지 않는다**(지난 작기 돌아보기 · "작기 끝" 판정에 씀). 작물 공통이면 줄을 만들지 않고 끝이 오늘 이후인 줄(지금 · 앞으로)은 지우며 지난 줄은 남긴다. 단계 일수가 빈 작형이면 저장을 거절한다.
- **`public.sync_all_farm_seasons()`**(검토 채팅 승인 보충): 모든 농장에 대해 안쪽 `sync_farm_seasons_at(farm_id, 한국 오늘)`을 부르고 **처리한 농장 수(int)**를 돌려준다. `security definer` · `search_path = ''` · **`service_role`만 실행**(`sync_farm_seasons`와 같음). croplib-dp가 정기 계산 **전에 한 번** 부르면 된다. 한 농장이 실패해도(예: 단계 일수가 비게 바뀐 작형) 전체가 멈추지 않도록 농장마다 따로 처리하고 실패한 농장은 세지 않는다(경고에는 오류 번호 sqlstate만).
- **`season_end_mmdd`는 열만 두고 끝 계산에 쓰지 않는다**(무시). 1/1에는 화면이 받지 않고, 값이 있을 때의 규칙은 나중 판에 정한다.
- **"지금 줄"의 정의는 한 곳** `public.farm_current_season`: 끝이 오늘 이후(`end_date >= 오늘`, **끝나는 날 당일은 아직 작기 중**)인 줄 가운데 시작이 가장 이른 줄. 작기 줄 만들기와 관수 기록 날짜 규칙이 같이 쓴다.
- **지난 줄과 겹칠 때: 지난 줄의 끝을 자르고, 통째로 겹치면 지운다.** 새 지금 줄의 시작 W가 지난 줄과 겹치면 지난 줄의 끝을 `W − 1일`로 줄이고, 지난 줄이 통째로 새 줄 안에 들어가면 지운다. 순서는 **자르기 → 지금 줄 쓰기**(배제 제약에 안 걸림).
  - **예시**: 사과 지난 줄 2026-04-01 ~ 10-27이 있고 오늘 11-20에 포도 시설가온 시작을 10-01로 고르면, 규칙상 지금 작기는 2026-10-01 ~ 2027-04-08(2026-10-01 + 190일 − 1)이라 지난 줄과 겹친다. 그래서 **새 줄은 2026-10-01 ~ 2027-04-08, 사과 줄은 2026-04-01 ~ 2026-09-30**이 된다.
  - 이유: 회원이 고른 시작일(W)이 그대로 지켜지고(화면이 "시작 10-01"이라고 말한 대로), 한 밭에 작목 둘이 동시에 있을 수 없으니 겹친 만큼은 새 작기가 맞다. 대안은 나쁘다 — "지금 줄 시작을 지난 줄 끝 다음 날로 미룸"은 회원이 고른 날짜와 조용히 달라지고, "저장을 거절하고 화면이 안내"는 합법적인 작목 바꾸기를 막고, "지난 줄을 지움"은 돌아보기 기록을 통째로 잃는다.
  - croplib-dp도 이 줄을 읽으므로 알려 둔다: 자른 줄은 끝날이 줄고, 잘린 기간의 관수 기록과 계산은 새 작기 소속이 된다. 새 줄을 만들 때 다시 계산이 요청되므로 `recalc_from`은 새 줄의 시작일(자른 기간의 첫날)까지 당겨진다.

### 3. 다시 계산 깨우기

- `farms` · `farm_seasons` · `irrigation_logs`가 바뀌면 `farm_calc_status` 줄을 만들거나 고친다(`requested_at`, `recalc_from`). **`recalc_from` 규칙**:

  | 바뀐 것                                                           | `recalc_from`                                                                                          |
  | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | 관수 기록 넣기 · 지우기                                           | 그 기록의 날                                                                                           |
  | 관수 기록 고치기(날짜 · 양 · 단위가 바뀔 때만 — 메모만은 안 깨움) | 옛 날과 새 날 중 이른 날                                                                               |
  | 작기 줄 시작일 변경 · 작목 · 작형 · 재배 방식 변경                | 옛 시작일과 새 시작일 중 이른 날 (끝이 오늘 이후인 줄이 바뀔 때만 — 지난 줄을 자르는 것으로는 안 깨움) |
  | 새 작기 줄 만들기 (지난 줄을 자른 경우 포함)                      | 새 줄의 시작일                                                                                         |
  | 지점 · 토성 · 면적 변경                                           | 지금 작기 줄의 시작일 (지금 줄이 없는 작물 공통은 요청하지 않음 — 계산할 것이 없음)                    |

  기다리는 중(`requested_at > done_at` 또는 `done_at` 없음)이면 **더 이른 날로만** 당기고, 끝난 뒤의 새 요청이면 새 날로 시작한다. `requested_at`은 `now()`가 아니라 `clock_timestamp()`라 같은 트랜잭션 안의 연속 요청도 순서가 구분된다. 농장 줄이 없으면(탈퇴 연쇄 삭제 중) 아무것도 하지 않고, **어떤 경우에도 오류를 내지 않는다**(회원의 저장 · 탈퇴를 막지 않는다).

- 요청을 기록하면 croplib-dp 농장 계산 작업을 깨운다: `ops.dispatch_workflow('farm_calc.yml')`. **깨우기가 실패해도(토큰 없음 · 작업 파일 없음 404 · 네트워크) 회원의 저장은 성공**한다. 작업 파일이 아직 없으면 GitHub이 404를 돌려주고 `ops.dispatch_recent`에 남을 뿐이다.
- **깨우기 줄이기 — 2분 창 + 매분 보충 예약.** 단순히 "2분 안이면 안 부름"만 하면 **이미 도는 작업이 못 본 요청**(작업이 농장 목록을 읽은 뒤 들어온 변경)이 다음 변경이나 02시까지 밀린다. 그래서:
  - ① 변경이 들어올 때: `ops.farm_calc_wake.last_wake_at`(한 줄짜리 운영 표)이 없거나 **2분 넘게 지났으면** 깨우고 시각을 적는다. 2분 안이면 안 부른다(관수 기록 연달아 넣기).
  - ② 보충 예약(`pg_cron` 작업 **`croplib-farm-calc-sweep`**, 매분 `ops.farm_calc_sweep()`): **마지막 깨우기 뒤에 들어온 기다리는 요청**이 있고 마지막 깨우기가 2분 지났으면 한 번 더 깨운다. 기다리는 요청이 없으면 색인 한 번 조회(`farm_calc_status_pending_idx`)로 끝난다. "마지막 깨우기 뒤에 들어온"이 조건이라 작업 파일이 없어 계속 404가 나도 **같은 요청으로 반복해서 부르지 않는다**(02시 정기 회차가 따라잡음).
  - 깨우는 함수가 **던지는** 드문 실패는 마지막 깨우기 시각도 함께 되돌려져(같은 블록) 다음 시도가 막히지 않는다.
  - 되돌리기 SQL은 `cron.unschedule('croplib-farm-calc-sweep')`와 짝이다.
- **깨우기 스위치 — 기본은 꺼짐**(croplib-dp 요청, 검토 채팅 승인 보충). croplib-dp에 `farm_calc.yml`이 아직 없는 동안 부르면 `net.http_post` 404가 조용히 묻히므로 그 파일이 병합된 뒤에 켠다. `ops.farm_calc_wake`에 `enabled boolean not null default false`(이미 있는 표에도 `add column if not exists`로 들어간다).
  - **꺼져 있으면** 저장 트리거(`farm_calc_try_wake(false)`)도 매분 보충 예약(`farm_calc_sweep` → `farm_calc_try_wake(true)`)도 **`ops.dispatch_workflow`를 부르지 않고 `last_wake_at`도 바꾸지 않는다.** 스위치를 읽고 꺼짐이면 부르기 앞에서 끝내므로 보충 예약은 한 줄 읽기뿐이다. 다만 **`farm_calc_status`의 `requested_at` · `recalc_from` 기록은 스위치와 상관없이 늘 한다**(croplib-dp 정기 계산이 따라잡는다).
  - 판단 함수 `ops.farm_calc_wake_due`에 스위치 인자(`p_enabled`)를 더했다(꺼짐 → 늘 거짓). 확인 SQL 판단표에 "꺼짐 → 안 부름" 항목이 있다(8c).
  - **켜는 SQL**(사용자가 croplib-dp의 `farm_calc.yml`이 병합된 뒤 SQL Editor에서 실행):

    ```sql
    update ops.farm_calc_wake set enabled = true;
    ```

    끄려면 `enabled = false`. 되돌리기 SQL은 표를 통째로 지우므로 따로 고칠 것이 없다.
- **정기(02시 · 17시) 농장 계산은 CropMon 예약이 아니다.** croplib-dp가 `collect.yml`이 끝난 뒤 이어서 부른다(그 전에 `sync_all_farm_seasons()`를 한 번). 이 PR이 만드는 예약은 `croplib-farm-calc-sweep`(매분) 하나이고, 이것은 **회원 저장 깨우기를 보충**할 뿐 정기 계산을 대신하지 않는다.
- **확인 SQL이 진짜 작업을 깨우지 않도록 이중으로 막는다**: ① `set_config('cropmon.skip_wake', 'on', true)`(그 트랜잭션에서만) — 깨우는 함수가 이 값을 보고 건너뛴다(마지막 깨우기 시각도 안 바꿈) ② `net.http_request_queue`가 일반 표라 같은 트랜잭션의 요청은 일부러 낸 오류로 같이 취소된다(끝에서 줄 수가 그대로인지 항목으로 본다). 깨우기 **판단**은 시각을 인자로 받는 `ops.farm_calc_wake_due`의 판단표로만 시험하고, 실제로 부르는 함수는 확인 SQL이 부르지 않는다. 설정 값은 SQL Editor 같은 직접 연결에서만 바꿀 수 있고 PostgREST로는 못 바꾼다.

### 4. 관수 기록 날짜 규칙 (DB가 지킨다)

- **넣을 때는 늘 검사**: 그 농장의 **지금 작기 줄 시작일 ~ 오늘(한국 날짜)** 안만 된다. 미래 · 작기 밖 · 작기 줄이 없는 농장(작물 공통)은 거절한다. **작기 시작 전 줄만 있을 때**(예: 11월에 사과 다음 작기 2027-04-01)는 **관수 기록이 모두 거절되는 것이 맞다**(작기 안만).
- **고칠 때는 날짜(나 농장)가 바뀔 때만 검사**한다. 작기 시작일을 바꿔 작기 밖이 된 **기존 기록의 메모 · 양은 고칠 수 있고**(막으면 옛 기록의 메모 오타도 못 고친다), **지우기는 언제나 된다**. 작기 시작일을 바꿔 작기 밖이 된 기존 기록은 지우지도 막지도 않는다.

### 5. 사전 (새 파일로 더함, 기존 시드 파일은 안 고침)

- `crop_seasons.is_protected`(시설 재배, croplib-dp가 비를 0으로 계산) · `cum_start_mmdd`(적산온도 · 적산일사를 더하기 시작하는 월-일, **비어 있으면 적산온도를 내지 않음** = 시설가온): 사과 · 배추 01-01, 포도 비가림 04-20, 시설가온 비움. 이 열을 읽어 계열을 만드는 일은 D1-3 · croplib-dp.
- `crops.gdd_stage_labels`(있으면 `gdd_stages`와 길이가 같아야 함).
- **배추 `t_base_c` 4 → 5**(위승환 외 2018, 한국농림기상학회지 20(2)). 배추 적산온도 줄은 croplib-dp 수집기가 다음 아침에 새 기준으로 다시 쓴다(**소급 작업 없음**). 배추 여름 작형 이름은 "고랭지배추"로(키 `kimchi_cabbage-summer`는 그대로 — 공개 계산 조건이 이 키를 쓴다).
- **포도 `grape`**: Kc 0.30 / 0.85 / 0.45(FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣), Zr 1.0 m, p 0.35, 높이 2.0 m, 기준온도 10℃(Paredes 2025b Table 3 · Winkler 1944). **`gdd_stages` · `gdd_stage_labels`는 비워 둔다** — 세 숫자(만개 · 변색기 · 수확기)는 croplib-dp가 계산 중이고 결과가 오면 작은 시드 이슈로 넣는다(그때 라벨 `["만개","변색기","수확기"]`와 함께).
- 재배 방식 `grape-k1`(기본). 포도 작형 둘: **비가림** `grape-rainshelter`(04-20, 25·45·90·45일 = 205일, 기본 작형, 시설 재배, 적산 04-20 — 천미건 외 2017 · Yamada 외 2008 · Yun 외 2009)와 **시설가온** `grape-heated`(시작일 비움, 35·40·85·30일 = 190일, 시설 재배, 적산 시작 비움 — 오카야마현 성과, **참조급이며 동료심사 근거 없음**).
- **2027 포도 공개 계산 조건 194줄**: 운영 97곳 × 두 작형 × `grape-k1` × 양토. 비가림 2027-04-20 ~ 2027-11-10(205일), 시설가온 2027-01-01 ~ 2027-07-09(190일, 미정 대신 1월 1일). TAW = 1000·(0.25−0.12)·1.0 = 130, RAW = 0.35·130 = 45.5, `dr0_mm` 0, **두 작형 모두 `is_default`**. 이름은 `101-grape-rainshelter-k1-loam-2027`.
  - 이 줄이 들어가면 croplib-dp 물수지 수집기가 2027-01-01부터 시설가온을 계산하기 시작한다. croplib-dp가 `is_protected`(비 0) · `etc_only`를 반영하기 전이면 값이 틀리게 써질 수 있으나, **포도는 G1 전까지 화면에 안 나오고** croplib-dp가 고친 뒤 다시 쓴다.

### 6. `scenarios_one_default` 색인을 작형 기준으로

- `(stn_id, crop_id, season_year)` → **`(stn_id, season_type_id, season_year)`**. 포도는 한 작목에 작형이 둘이라 두 작형 모두 기본 조건이어야 하기 때문이다. 사과 · 배추는 작형이 하나(배추는 값 있는 작형이 여름뿐)라 뜻이 같다. 운영 DB는 2027년 기본 조건 194줄(97곳 × 2)이라 기존 줄이 새 색인을 위반하지 않는다. 시드 후 2027년 기본 조건은 388줄(사과 97 + 배추 97 + 포도 194).
- **"작목의 기본 조건"을 읽는 곳**: 화면에서는 `src/infra/supabase/status-source.ts`의 `defaultScenarios(year)`(지역 칩 점 · 종합의 지점 판정)가 `is_default = true`인 줄을 작물 구분 없이 읽고 그 `scenario_id` 전부를 `.in(…)`에 실어 `water_outlook_summary` · `water_balance_daily` · `water_outlook`을 읽는다. 포도 194줄이 들어가면 읽는 줄이 194 → 388줄, 주소(URL)에 실리는 id가 약 6.5KB → 약 13KB가 되어 게이트웨이의 주소 길이 한계에 걸릴 수 있다. 그래서 **같은 PR에서 사과 · 배추 줄만 읽게 걸러 읽는다**(`.in("crop_id", SPECIFIC_CROP_DB_IDS)`). **작물 목록은 도메인 한 곳**(`src/domain/water-outlook.ts`의 `SPECIFIC_CROPS` → `SPECIFIC_CROP_DB_IDS`)에서 오고 `station-status.ts`도 같은 상수를 쓴다(목록이 두 곳에 따로 없음). croplib-dp는 `collectors/water.py`가 `is_default`를 수집 결과 알림 요약에서만 쓰고 계산 대상을 고르는 데는 안 쓰므로 색인을 바꿔도 깨지지 않는다(알림에 포도 줄이 더 붙는 정도 — 검토 채팅이 croplib-dp 쪽에 따로 알림).
- **G1이 할 일**: `src/infra/supabase/water-source.ts`의 `scenarios(stn, crop, year)`는 `crop_id`로 읽고 `kc_set_id`로 줄을 고른다. 포도는 두 작형이 같은 `grape-k1`을 써서 **작형까지 보고 고르도록 G1에서 고쳐야** 한다(포도는 G1 전까지 화면에 안 나오므로 지금은 영향 없음).

### 7. `etc_only` (쓰는 물)

세 공개 표(`water_balance_daily.status` · `water_outlook.status` · `water_outlook_summary.status_start`)의 check에 `etc_only`를 더하고 새 `farm_water_*`도 같은 값을 받는다. **판정 순서(`dormant` → `etc_only` → …)는 croplib-dp 몫이라 DB는 값만 받는다.** 지금 화면은 모르는 상태 값을 만나도 깨지지 않는다(`services/water.ts` · `station-status.ts`가 `WATER_STATUSES.includes(...)`로 거르고 아니면 없는 값으로 처리) — 포도 줄은 화면이 안 읽으므로 실제로는 안 만난다. 화면 이름 "쓰는 물"은 W3에서 `src/domain/water-status.ts`에 더한다(이 이슈에서 화면 코드는 안 바꾼다 — 위 6의 읽는 줄 걸러 읽기만 예외).

### 8. 작형 선택지 기준 (F2가 할 일)

`crop_seasons`를 읽는 화면 코드는 지금 없다. F2가 작형 선택지를 만들 때는 **"단계 일수 네 개가 모두 있음"을 기준**으로 해야 시설가온(시작일 빔)이 보인다 — `start_mmdd`가 비었다고 거르면 숨는다. 계약서의 "값이 빈 작형은 선택지에 안 나옴"을 이 기준으로 고쳐 썼다. 단계 일수가 빈 작형(배추 봄 · 가을 · 월동)을 농장에 저장하면 DB가 거절한다(안전망).

## croplib-dp와의 약속 (검토 채팅이 사용자를 통해 croplib-dp에 그대로 전함)

1. **작업 파일 이름은 `farm_calc.yml`**. 그 작업은 대기 중인 농장(`requested_at > done_at` 또는 `done_at` 없음)을 모두 처리한다. **그 파일이 병합되기 전에는 깨우기가 꺼져 있고**(`ops.farm_calc_wake.enabled` 기본 `false`), 병합된 뒤 사용자가 `update ops.farm_calc_wake set enabled = true;`를 SQL Editor에서 실행해 켠다. 꺼져 있는 동안에도 요청 기록(`requested_at` · `recalc_from`)은 남으므로 croplib-dp 정기 계산이 따라잡는다.
2. **`done_at`에는 "읽기 시작한 시각"을 쓴다.** 끝난 시각을 쓰면 그 사이에 들어온 요청의 `requested_at`이 `done_at`보다 이르게 보여 "끝남"으로 묻힌다.
3. **정기(02시 · 17시) 농장 계산은 croplib-dp가 `collect.yml` 뒤에 이어서 부른다 — CropMon cron이 아니다.** 그 계산 전에 서버 키로 **`public.sync_all_farm_seasons()`를 한 번** 부른다(모든 농장에 대해 끝난 작기의 다음 줄을 만들고 지난 줄을 자르는 규칙이 이 한 곳이다 — 한 농장씩 `public.sync_farm_seasons(farm_id)`를 부르는 것도 같은 규칙이다). 안쪽 함수 `sync_farm_seasons_at`은 서버 키도 못 부른다. CropMon의 `croplib-farm-calc-sweep`은 회원 저장 깨우기의 보충일 뿐이다.
4. `crop_seasons.is_protected`인 작형은 **비를 0으로 계산**하고, 쓰는 물인 날은 `status = 'etc_only'`로 올린다(Dr · Ks · 판정 열은 비움, `etc_sum_mm`은 채움). `farm_water_*`는 **최신 회차만** 남긴다(키에 회차가 없음).
5. `crop_seasons.cum_start_mmdd`가 비어 있으면 적산온도를 내지 않는다(적산 계열 만들기는 D1-3).
6. 지난 줄과 겹칠 때 지난 줄의 끝이 줄어들 수 있다(위 2). 잘린 기간의 결과는 새 작기로 다시 계산된다.
7. 배추 `t_base_c`가 5로 바뀌었다 — 소급 작업 없이 다음 아침에 새 기준으로 다시 쓴다.
8. 포도 계산 조건 194줄이 들어가면 2027-01-01부터 시설가온이 수집 대상이 된다. 시설 재배(비 0) · `etc_only`를 반영하기 전의 값은 틀릴 수 있으므로 반영 뒤 다시 쓴다.
9. `farm_calc_status.error`에는 사람이 읽는 말만 쓴다(개인 값 · 위치 · 키 없음).
10. **`farm_calc_status`에서 croplib-dp가 쓰는 열은 `done_at` · `result` · `error` · `calc_version`**이고, 트리거가 쓰는 열은 `requested_at` · `recalc_from`이다. 서버 키는 RLS를 건너뛰므로 croplib-dp의 쓰기에는 따로 권한 설정이 필요 없다.

## 하지 않은 것

- 화면 전부(F1 · F2 · W1 · W2 · W3 · G1), `heat_daily` · `sun_daily` 키 바꾸기와 온도 · 햇빛 화면 읽기(D1-3), 포도 `gdd_stages` 숫자(다음 작은 시드 이슈), `crop_overrides`(보정값), 작물 23종 · `crops.category` · `sort_order`(1/1 뒤).
- croplib-dp의 농장 계산 작업 · 시설 비 0 · `etc_only` 계산(croplib-dp 이슈).
- **정기(02시 · 17시) 농장 계산 예약은 만들지 않았다**(croplib-dp가 `collect.yml` 뒤에 부름). 만든 예약은 매분 보충 `croplib-farm-calc-sweep` 하나.
- 가짜 Supabase(`e2e/fake-supabase.mjs`)는 화면이 새 표를 읽지 않으므로 손대지 않았다.

## 시험 · 확인

- **시험용 DB가 없다** — 운영 DB에서 확인 SQL로 본다(D1-1과 같은 방식). `supabase/checks/d1_2_farms_check.sql`: 가짜 회원 · 농장을 만들어 시험하고 끝에서 되돌림, 항목마다 true/false, 마지막 `all_ok`(항목 118개). **회원 DB(D1-1)가 운영에 아직 없어도 돌아간다** — 있으면 `delete_my_account()` · `members`도 함께 시험하고, 없으면 그 항목(9b · 9c)만 "건너뜀"으로 참 처리한다(탈퇴가 하는 일인 `auth.users` 한 줄 삭제의 연쇄는 D1-1 없이도 시험한다). D1-1을 나중에 실행했다면 확인 SQL을 다시 Run 한다. (작업 중 읽기 전용 MCP로 본 운영 DB에는 D1-1의 `members` · 가입 트리거 · `delete_my_account()` · `ops.withdrawn_accounts`가 아직 없었다 — 이 이슈의 마이그레이션은 이것에 기대지 않는다.) 회원 시험은 `set role authenticated` + `request.jwt.claims`로 해 RLS가 실제로 걸린다. 연도 규칙은 안쪽 함수에 "오늘"을 넣어 시험하고, 트리거를 거치는 시험은 진짜 오늘 기준 상대 날짜로 써서 어느 날 돌려도 같다. 되돌리기 SQL `supabase/checks/d1_2_farms_rollback.sql`(실행 안 함)은 **`farms` 줄이 0인지 · `etc_only` 줄이 0인지 · 포도에 딸린 결과 줄이 0인지 먼저 확인**하고 하나라도 걸리면 아무것도 지우지 않고 멈춘다.
- 저장소 쪽 자동 시험: `contract.test.ts`(깨우기 스위치 · `sync_all_farm_seasons` 권한 문자열 · 켜는 SQL이 문서에 있음, 표 목록 21개 · 버전 v2.1 · 새 표마다 RLS · 정책 · 열 단위 권한 · 합성 외래키 · 배제 제약 · 함수 권한 · `search_path` · 깨우기 · `etc_only` · 확인 · 되돌리기 SQL), `seed.test.ts`(포도 사전 · 194줄 · TAW · RAW · 날짜 · 기본 조건 · 배추 기준온도), `status-source.test.ts` · `water-outlook.test.ts`(작물 걸러 읽기 · 단일 출처). 기준은 낮추지 않았고 고친 것은 "표 개수 · 버전" 숫자뿐이다.
