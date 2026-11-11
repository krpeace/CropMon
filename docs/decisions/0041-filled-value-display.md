# 0041. 채운 값(filled=true) 추정 포함 표시 및 적산 유효 기준일 구분 (PR 1)

- **날짜:** 2026-11-11
- **상태:** 채택
- **연관:** 이슈 #128, 데이터 계약 v1.10 (`soil_water_latest`), 결정 0035, 결정 0036

## 맥락

기상 관측소 결측이나 수집 지연이 생겼을 때 `croplib-dp`와 CropMon 화면의 동작이 두 계열에서 서로 다른데, 기존 화면이 이를 구분하지 못하고 모두 `"어제까지 관측 기준"`으로만 보여 주는 문제가 있었습니다.

1. **물·토양 계열 (`water_balance_daily`, `soil_water_daily`, `soil_water_latest`):**
   - `filled = true`는 단순히 "어제 하루만 채웠다"가 아니라, 결측을 메운 날 이후 **부족한 물(`Dr`)이 `0`으로 돌아오기 전까지 며칠~몇 주 동안 추정의 영향을 받는 날**을 뜻합니다.
   - `water_balance_daily`는 `filled`를 SELECT하고 있었으나 화면에 전달·표시하지 않았고, 종합표용 뷰 `soil_water_latest`에는 `filled` 열 자체가 없었습니다.
   - 그 결과 `filled = true` 줄에도 `"어제까지 관측 기준"`이 붙어 사용자가 순수 관측 값으로 오해할 수 있었습니다.
2. **적산온도·적산일사 계열 (`heat_daily`, `sun_daily`):**
   - `heat_daily.filled`·`sun_daily.filled`는 평년값 보간 등 성격이 달라 이번 범위에서 쓰지 않고, 종합표·첫 화면(`growth-latest.ts`)은 각각 유효 값(`gdd_cum != null`, `rs_cum_mj != null`)이 있는 가장 마지막 날짜의 값을 읽습니다.
   - 그러나 `HeatLatest`·`SunLatest`가 날짜(`date`)를 담지 않아 어제보다 이전 날짜의 값을 읽은 날도 첫 화면에 날짜가 표시되지 않았습니다.
   - 추가로 라이브 DB 점검에서 `measures_sunlight = false`인 운영 32개 지점 중 7곳(`130 울진`, `174 순천`, `188 성산`, `217 정선군`, `221 제천`, `272 영주`, `273 문경`)은 `sun_daily`에 `rs_cum_mj = null, filled = true` 365줄이 들어가 있어, `sunlight.ts`(`readMain`)의 `rows.length === 0` 검사만으로는 미관측(`kind: "notMeasured"`) 대신 빈 차트가 나오는 버그가 확인되었습니다.

## 결정

이번 작업은 PR 1(최소 핵심 범위)과 후속 PR 2(전국 표·지역 비교·시계열 확장)로 나눕니다. PR 1에서는 아래 4가지를 구현합니다.

1. **데이터 계약 v1.10 (`soil_water_latest.filled` 추가):**
   - `public.soil_water_latest` 뷰 마지막 열에 `filled`를 추가하고 (`20261111000000_data_contract_v1_10_soil_water_latest_filled.sql`), `heat_latest`·`sun_latest`는 만들지 않으며 `heat_daily.filled`·`sun_daily.filled`도 읽지 않습니다.
   - `CREATE OR REPLACE VIEW`로 기존 열 순서를 유지한 채 마지막에 `filled`를 붙입니다(작물 공통 토양 뷰 읽기 Egress 증가는 미미함).
2. **물·토양 `추정 포함` 표시 및 단일 문구 상수(`FILLED_COPY`):**
   - 특정 날짜("어제 기상 자료가 비어...")를 단정하지 않고, 추정 영향권을 드러내는 배지 **`추정 포함`**, 기준 문구 **`어제까지 기준 (추정 포함)`**(및 날짜별·예보 출발·지난 날짜 변형), 안내 문구를 `src/domain/water-outlook.ts`의 **`FILLED_COPY`** 상수 1곳에서 관리합니다.
   - 휴면기(`dormant`)와 겨울철(`winter`)처럼 물수지·적산 계산 판정을 표시하지 않는 상태에서는 `추정 포함` 배지와 안내를 띄우지 않습니다.
   - 적용 위치: 첫 화면 물·토양 `SummaryCard` + 갱신 줄(`metaLine`, `runHour === null`일 때 활성 물/토양 기준일 및 추정 여부 연동), 물 상세 `NowCard` · `CommonNowCard`.
3. **적산온도·적산일사 유효 날짜 표시 및 일사 미측정 7곳 수정:**
   - `HeatLatest`·`SunLatest`에 이미 SELECT 중인 `date`를 포함하고, 첫 화면 카드에서 읽은 날짜가 `yesterday`보다 이전이면 **`"OO월 OO일까지의 값이에요"`** 안내를 추가합니다(DB 스키마 변경 없음).
   - `src/services/sunlight.ts` `readMain`의 미측정 판별을 `if (!rows.some((r) => r.rs_cum_mj != null))`로 고쳐, `null` 365줄이 있는 미측정 7개 지점도 `"햇빛을 재지 않아요"`(`kind: "notMeasured"`) 화면을 보여 주도록 수정합니다.
4. **한계 문서화 (`DATA_CONTRACT.md` · `AboutSheet`):**
   - 기상청이 뒤늦게 관측 값을 거둬들이거나 정정한 경우 이미 적재된 옛 값이 남아 화면 최신 날짜가 실제 관측과 하루 정도 어긋날 수 있다는 한계를 계약서와 푸터 "CropMon 소개" 시트(`AboutSheet`)에 한 줄로 명시합니다.
