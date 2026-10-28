# 0021. 데이터 계약 v1.6: 기상청 ASOS 105곳 지점 사전 현행화

- 날짜: 2026-10-28
- 상태: 확정 (이슈 #38, 입력: `krpeace/croplib-dp#30`)

## 배경

- 디자인 시안 v0.2.1의 "지역 고르기"는 "대표 지점 10곳" 칩과 "전체 ASOS 지점 N곳 · 가나다순" 검색 목록을 함께 보여 준다.
- 시안에 적힌 목록은 96곳인데, 기상청 API허브 지상 관측 지점정보(`stn_inf`, `inf=SFC`)를 조회해 비교한 결과(`croplib-dp` 결정 0016, PR #30):
  - 기상청 전체 지점은 **105곳**: 현행 운영 **97곳**(`is_active = true`) + 과거 운영 후 폐지·휴지 **8곳**(`is_active = false`: 116 관악산, 164 무안, 175 진도(첨찰산), 176 대구(기), 187 성산, 214 삼척, 256 주암, 265 성산포).
  - 시안 96곳과 비교하면 시안의 **175 진도(첨찰산)** 1곳이 폐지·휴지 지점이고(현행 진도는 268 진도군), 기상청 현행 지점 중 **181 서청주(충북)**·**296 북부산(부산)** 2곳이 시안에 빠져 있었다 (96 − 1 + 2 = 현행 97곳).
  - 기존 DB 지점 사전(`public.stations`)과 `src/infra/stations.ts`의 대표 10곳은 이름·번호·좌표·해발고도·풍속계 높이가 모두 기상청 현행 값과 정확히 일치한다.

## 결정

1. **`public.stations`에 열 5개 추가 (데이터 계약 v1.6, `20261028020000_data_contract_v1_6.sql`)**:
   - `sido text`: 시·도 약칭 17개 (화면 검색·목록 표시)
   - `is_representative boolean not null default false`: 대표 지점 10곳 여부 (자동 전환, 종합 표, 기본 지점, 지역 칩에 사용)
   - `is_active boolean not null default true`: 현행 운영 여부. 폐지·휴지 지점 8곳은 지우지 않고 `false`로 두어 과거 자료 연결을 보존
   - `measures_sunlight boolean`: 일사 관측 여부 (대표 10곳 중 춘천 등 9곳 `true`, 태백 `false`, 아직 확인 안 된 나머지 지점은 `null`)
   - `synced_at timestamptz`: 기상청 지점정보와 맞춘 시각 (`2026-10-28T00:00:00+09:00`)
2. **사전 값 마이그레이션 (`20261028030000_seed_stations_asos.sql`)**:
   - 기상청 ASOS 105곳을 `insert ... on conflict (stn_id) do update`로 넣는다.
   - 기존 대표 10곳(`101, 216, 119, 131, 129, 146, 156, 136, 192, 189`)의 좌표·고도·풍속계 높이·예보 격자(`grid_nx`, `grid_ny`)·`has_forecast = true`·`sort_order`(1~10)는 그대로 유지한다.
   - 나머지 95곳은 한글 가나다순(이름이 같으면 지점번호 오름차순)으로 `sort_order` 11~105번에 이어 붙이고, `grid_nx = null`, `grid_ny = null`, `has_forecast = false`, `measures_sunlight = null`로 둔다.
3. **화면 지점 사전 확장 (`src/infra/stations.ts`) 및 대표 10곳 필터**:
   - `STATIONS`를 105곳(`id, name, sido, isRepresentative, isActive, measuresSunlight`)으로 확장한다.
   - 대표 10곳만 써야 하는 곳(헤더 지역 칩, 자동 전환, 종합 표, 온도·햇빛 지역 비교, 기본 지점 및 현행 `?st=` 읽기)은 `isRepresentative`로 거른다.
   - 대표 밖 지점 검색·선택 UI와 대표 밖 `?st=` 허용, 그리고 대표 밖 지점을 골랐을 때 "자료 없음" 안내는 다음 이슈(#39)에서 구현한다.
