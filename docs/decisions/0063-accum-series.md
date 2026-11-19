# 결정 0063: 적산 계열 새 표 `heat_series_daily` · `sun_series_daily`와 계열 목록 뷰 `crop_accum_series` (데이터 계약 v2.2) (이슈 #186, D1-3 1단계)

- 날짜: 2026-11-20
- 상태: 확정 (운영 DB 실행과 확인 SQL 통과, 실행 뒤 개수 확인은 사용자 · 작업창이 한 뒤 병합)
- 관련 이슈: #186 (순서표 #144의 D1-3 1단계). 앞: 농장 DB와 사전(결정 0062 — `crop_seasons.cum_start_mmdd`, `is_valid_mmdd`). 뒤: croplib-dp 새 표 쓰기(2단계), 화면이 새 표로 읽기 + 옛 표 지우기(D1-3 2단계 = 3단계), G1(지역 보기 포도).
- 화면 변경은 없다. 계약은 `docs/DATA_CONTRACT.md` v2.2.

## 배경

- 적산온도는 **작목 기준온도와 기상청 기온만으로** 계산한다. 그래서 값을 가르는 것은 작물이 아니라 **기준온도**와 **어느 날부터 더하느냐(누적 시작 월-일)** 둘뿐이다. 이 짝을 **"적산 계열"**이라 부른다(데이터 계약 7판, 11/19 결정).
- 지금 `heat_daily`는 지점 × 작물 × 날짜, `sun_daily`는 지점 × 날짜이고 누적이 모두 1월 1일부터다. 포도 비가림은 04-20부터 더해야 하는데 화면은 계산하지 않으니 표가 그 줄을 가져야 한다. G1이 이것을 기다린다.
- croplib-dp 적산 수집기가 지금 키로 쓰고 있다(`upsert(… on_conflict=지금 키)`). 그래서 두 저장소가 **세 단계**로 바꾸기로 했다.

## 결정

### 1. 새 이름의 표 둘 — 옛 표의 키를 고치지 않는다

- 옛 표의 기본 키를 바꾸면 옛 줄과 새 줄을 한 표에 같이 두기 어렵다. PostgREST `on_conflict`는 **열 이름 목록만** 받고 부분 색인(`where …`)을 못 쓰며, `crop_id`를 비우는 순간 croplib-dp의 지금 쓰기가 깨진다. 새 표를 따로 두면 **1단계가 운영에 들어가도 croplib-dp 지금 쓰기 · 지금 화면이 하나도 안 깨지고**, 3단계에서 옛 표를 지우면 끝난다.
- **세 단계**: ① CropMon이 새 표 · 뷰를 넣는다(이 결정). 옛 표 · 옛 줄은 그대로. ② croplib-dp가 새 표에도 쓰기 시작한다(croplib-dp 이슈). ③ CropMon 화면이 새 표로 읽기를 바꾸고 **옛 표 · 옛 줄은 3단계에서 지운다**(D1-3 2단계).
- **옛 `heat_daily` · `sun_daily`는 한 글자도 바꾸지 않는다.** 이 PR의 마이그레이션에는 두 이름이 `create` · `alter` · `drop` · `insert` · `update` · `delete` · `grant` · `revoke` 어디에도 나오지 않고(`contract.test.ts`가 문장 단위로 확인), 확인 SQL이 키 · 외래키 · 열 · 정책 · 트리거 · 권한이 v1.4 + v1.8 값 그대로인지 본다.

### 2. `heat_series_daily` · `sun_series_daily`

- **`heat_series_daily`** 키 `(stn_id, t_base_c, cum_start_mmdd, date)`. `stn_id → stations`, `t_base_c numeric not null`(범위 -10 ~ 30, `crops.t_base_c`와 같음), `cum_start_mmdd text not null`(`public.is_valid_mmdd` — 02-29 · 04-31 · 형식 틀림 거절, D1-2의 함수), `date`. 값 열은 `heat_daily`와 같다: `gdd_day` · `gdd_cum` · `gdd_normal_day` · `gdd_normal_cum` · `lead_days` · `normal_from` · `normal_to` · `filled` · `calc_version` · `updated_at`(+ `set_updated_at` 트리거). **`crop_id` 열은 두지 않는다.** 누적 · 평년 누적 · 며칠 빠른가는 **그 계열의 누적 시작부터 센다**(뜻만 계약에 적음 — 계산은 croplib-dp).
- **`sun_series_daily`** 키 `(stn_id, cum_start_mmdd, date)`. 값 열은 `sun_daily`와 같다.
- 두 표 모두 RLS 켬, **누구나 읽기**(`anon` · `authenticated` select, 정책 `"<표> 누구나 읽기"` — 옛 표와 같은 이름 규칙이라 `contract.test.ts`의 공개 표 검사가 그대로 확인), 쓰기 정책 · 쓰기 권한 없음(서버 키만). 키 순서가 `stn_id`부터라 "한 지점 · 한 계열의 날짜 범위"는 키 앞 세 칸이 같고 날짜만 범위여서 기본 키 색인을 그대로 탄다(별도 색인 불필요).
- **`t_base_c`가 키의 일부(숫자)라 `4`와 `4.0`은 같은 키다**(값으로 비교). 확인 SQL이 "숫자 모양만 다른 같은 키는 중복으로 거절"을 확인한다.
- **해를 넘는 누적 시작**(예: 12-01 시작 계열)은 1/1 계열에 없다. 그때 "작기 해" 열이 필요한지는 **그때 정한다** — 지금 열을 미리 만들지 않는다.

### 3. 뷰 `public.crop_accum_series` — 계열 목록 한 곳

croplib-dp(무엇을 계산할지)와 화면(무엇을 읽을지)이 계열을 **같은 규칙**으로 찾도록, 규칙을 두 저장소 코드에 따로 두지 않고 뷰 하나에 둔다. `security_invoker = true`(읽는 사람의 권한으로 `crops` · `crop_seasons`를 읽음), `anon` · `authenticated` 읽기만. 열 `crop_id` · `season_type_id` · `heat_t_base_c` · `heat_cum_start_mmdd` · `sun_cum_start_mmdd`.

- **줄 기준: "단계 일수 네 개(`l_ini_d` · `l_dev_d` · `l_mid_d` · `l_late_d`)가 모두 있음" + 작물 공통(`common`)** — D1-2 결정 0062와 같은 기준이다. `cum_start_mmdd`가 비었는지로 거르면 적산온도는 비우지만 **일사 계열은 있는 시설가온이 빠지기** 때문이다. 지금 5줄: `apple-main` · `kimchi_cabbage-summer` · `grape-rainshelter` · `grape-heated` · `common`(값이 빈 배추 봄 · 가을 · 월동은 없음).
- **적산온도**: `heat_t_base_c = crops.t_base_c`, `heat_cum_start_mmdd = crop_seasons.cum_start_mmdd`. **둘 중 하나라도 비면 둘 다 비움 = 적산온도를 내지 않음**(포도 시설가온). 작물 공통은 `crops`의 `common` 줄 기준온도(5, 결정 0020)와 `01-01`.
- **적산일사**: `sun_cum_start_mmdd = coalesce(crop_seasons.cum_start_mmdd, '01-01')`. 작물 공통 · 시설가온(미정)은 `01-01`.
- **1/1 계열**(데이터 계약 7판 5-3절과 같음, 확인 SQL이 못 박음): 적산온도 **(4, 01-01)**(사과) · **(5, 01-01)**(배추 · 작물 공통, 5가 같아 한 계열로 합쳐짐) · **(10, 04-20)**(포도 비가림), 적산일사 **01-01**(사과 · 배추 · 작물 공통 · 시설가온) · **04-20**(포도 비가림).
- **사전을 고치면 뷰가 따라간다**(확인 SQL이 되돌림 안에서 `crops.t_base_c` · `cum_start_mmdd` · 단계 일수를 바꿔 뷰가 바뀌는 것을 확인) — 규칙이 두 저장소 코드가 아니라 뷰 한 곳에 있다는 증거다.
- 뷰 읽기 시험은 **`anon` · `authenticated` · `service_role` 각각으로 실제 줄 수(5)**를 확인한다. `security_invoker` 뷰는 사전 표의 읽기 권한(정책)이 빠지면 오류 없이 0줄이 되기 때문이다(변이 시험으로 확인: `crops` · `crop_seasons`의 읽기 정책을 지우면 1c · 1d가 거짓).

## croplib-dp에 넘길 것 (검토 채팅이 사용자를 통해 croplib-dp에 그대로 전함)

1. **새 표 이름과 `on_conflict` 열**: `heat_series_daily` = `stn_id,t_base_c,cum_start_mmdd,date` / `sun_series_daily` = `stn_id,cum_start_mmdd,date`. `t_base_c`는 **숫자로** 보낸다(`4`와 `4.0`은 같은 키).
2. **계산할 계열은 뷰에서 읽는다**: 적산온도 = `public.crop_accum_series`의 `distinct (heat_t_base_c, heat_cum_start_mmdd)`(둘 다 빈 줄은 제외), 적산일사 = `distinct sun_cum_start_mmdd`. 코드에 계열을 따로 적지 않는다. 사전(`crops` · `crop_seasons`)이 바뀌면 뷰가 따라 바뀐다.
3. **누적 · 평년 누적 · 며칠 빠른가는 그 계열의 누적 시작부터 센다.**
4. **옛 표(`heat_daily` · `sun_daily`)는 3단계까지 계속 써도 된다**(두 곳에 같이 쓰는 기간). 옛 표 키 · 열 · 정책은 안 바뀐다.
5. **3단계(화면이 새 표로 읽기 + 옛 표 · 옛 줄 지우기) 시점은 CropMon이 알린다.**
6. 새 표에 **`crop_id`는 없다**(작목이 아니라 기준온도 · 누적 시작이 계열을 가른다). 해를 넘는 누적 시작은 그때 정한다. 같은 계열을 쓰는 작목이 여럿(사과 · 배추 · 작물 공통의 일사 01-01)이어도 한 줄만 쓴다.
7. **새 표 쓰기가 시작되면(2단계) v2.2의 되돌리기 SQL은 멈춘다**(새 표에 줄이 있으면 아무것도 지우지 않음).

## 하지 않은 것

- 화면이 새 표로 읽기(온도 · 햇빛 · 종합 — 3단계), 옛 표 · 옛 줄 지우기(3단계), 수집 감시 조건(croplib-dp), 포도 `gdd_stages` 숫자(작은 시드 이슈), 회원 시작일 누적(G2, 1/1 뒤).
- 화면 코드 · `heat-source.ts` · `sun-source.ts` · 가짜 Supabase는 손대지 않았다(화면이 새 표를 아직 안 읽음).

## 시험 · 확인

- **시험용 DB가 없다** — 운영 DB에서 확인 SQL로 본다. `supabase/checks/d1_3a_series_check.sql`: 가짜 줄을 넣어 시험하고 사전을 일부러 바꿔 보고 끝에서 일부러 오류를 내 모두 되돌림, 항목마다 true/false, 마지막 `all_ok`(항목 37개). 비회원이 새 표 · 뷰를 읽음(뷰는 `anon` · `authenticated` · `service_role`로 실제 5줄) / 비회원 · 회원이 쓰지 못함 / 키 중복 거절(`4`와 `4.0` 포함) / 누적 시작 02-29 · 04-31 · 형식 틀림 거절, 기준온도 범위 / **서버 키(`service_role`)로 upsert**(croplib-dp가 PostgREST로 쓰는 것과 같은 충돌 열, 같은 키 두 번 → 한 줄, 값 갱신, `updated_at` 갱신) / 뷰가 위 1/1 계열을 정확히 줌 · 사전을 바꾸면 따라감 / **옛 표 키 · 열 · 정책 · 트리거 · 권한이 그대로**. 되돌리기 SQL `d1_3a_series_rollback.sql`(실행 안 함)은 **새 표에 줄이 하나라도 있으면 오류로 멈추고 아무것도 지우지 않는다.**
- **병합 순서**: 사용자가 SQL을 실행하고 `all_ok`를 알림 → 작업창이 **실행 뒤 MCP 확인 댓글**(새 표 2개 · 줄 0, 뷰 5줄, 옛 표 줄 수 그대로) → 검토 채팅 병합.
- 저장소 쪽 자동 시험: `contract.test.ts`(공개 표 16개 · 버전 v2.2 · 새 표 RLS · 읽기 정책 · 쓰기 권한 없음 · 키 · `crop_id` 없음 · 값 열이 옛 표와 같음 · 트리거 · 뷰의 `security_invoker` · 읽기 권한 · 줄 기준 · 옛 표 이름이 안 나옴 · 확인 · 되돌리기 SQL · 이 결정의 "croplib-dp에 넘길 것"). 기준은 낮추지 않았고 고친 것은 "표 개수 · 버전" 숫자뿐이다.
