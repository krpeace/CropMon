# 0020. 데이터 계약 v1.5: 작물 공통 토양 물 상태와 추정 토성 3종

- 날짜: 2026-10-28
- 상태: 확정

## 배경

- 작물을 고르지 않고 흙(토성)만 반영한 물 상태를 보여 주기 위해 데이터 계약을 v1.4에서 v1.5로 올린다.
- "기준작물(잔디)"을 작물처럼 보여 주면 지도사가 내 작물 대신 쓰는 오해가 생기므로 기준작물이라는 명칭을 쓰지 않고 **"작물 공통"**으로 한다.
- 고정 조건으로 계산하며, 화면은 디자인 시안 v0.2.1(데스크톱 1440)을 따른다.
- FAO-56 Table 19에 없는 토성 3종도 추정값으로 11/06 공개에 포함한다.

## 결정

- **작물 공통 = 흙만 본 물 상태, 기준작물 이름은 쓰지 않음**:
  - 이름은 "작물 공통"으로 통일한다.
  - 계산 조건은 고정: 흙 깊이 0.5 m(겉흙 0~50 cm), 증발 수요 = ETo × 1.0, p = 0.40, 3월 1일에 Dr = 0(포장용수량)으로 시작, 지표유출·모관상승 0 (FAO-56 식 (84)~(88)).
- **새 표 `public.soil_water_daily`**:
  - 키: 지점 × 토성 × 날짜 (`stn_id`, `soil_code`, `date`).
  - 한 해 10지점 × 12토성 × 365일 ≈ 4.4만 줄.
  - 겨울(12~2월) 줄도 두되 `status = 'winter'`, `dr_mm`·`aw_pct`는 빈 칸으로 둔다.
  - RLS를 켜고 `anon`·`authenticated`는 읽기만 허용한다.
- **흙 물 상태 판정 (작물 공통 5단계 + 겨울철)**:
  - `winter`(겨울철, 12~2월), `pool`(물 고임, Dr = 0 및 당일·전일 dp ≥ 1 mm), `ample`(충분, aw_pct ≥ 80), `fair`(보통, 60 ≤ aw_pct < 80), `dry`(건조, 30 ≤ aw_pct < 60), `very_dry`(매우 건조, aw_pct < 30).
  - 판정은 croplib-dp가 하고 화면은 이름만 붙인다.
  - 작물용 `status`(`need`, `caution`, `normal`, `wet`, `dormant`)와 섞지 않는다.
  - 비가 오지 않으면 건조까지 남은 날(`days_to_dry`)은 `fair`일 때만 계산해 채운다.
- **토성 사전에 `is_estimated` 열과 추정 3종 값**:
  - `soil_types.is_estimated boolean not null default false` 열을 추가한다.
  - FAO-56 Table 19에 없는 3종은 Saxton & Rawls (2006) 식(유기물 2.5%, USDA 토성 삼각형 중심 조성)으로 추정해 11/06 공개에 포함한다:
    - 사질식양토(`sandy_clay_loam`): FC 0.278, WP 0.177, TAW (0.5 m) 50 mm
    - 식양토(`clay_loam`): FC 0.351, WP 0.213, TAW (0.5 m) 69 mm
    - 사질식토(`sandy_clay`): FC 0.371, WP 0.260, TAW (0.5 m) 55 mm
  - `is_estimated = true`, `source = '추정: Saxton & Rawls (2006), 토성 중심 조성·유기물 2.5%'`. 기존 사전 파일은 수정하지 않고 새 마이그레이션 파일로 넣는다.
- **작물 사전에 `common` 등록**:
  - 작물 공통의 적산온도를 `heat_daily`에 `crop_id = 'common'`으로 저장하기 위해 `crops`에 `common` 행을 추가한다 (`name_ko = '작물 공통'`, `kc_ini/mid/end = 1.0`, `zr_m = 0.5`, `p = 0.40`, `t_base_c = 5`, `gdd_stages = [1000, 2000]`).
