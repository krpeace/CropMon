# domain

표시·판정 규칙을 담는 순수 함수 모음입니다. DB·화면·네트워크를 모릅니다. 같은 값을 넣으면 언제나 같은 결과가 나옵니다.

## 공통 표시 함수 (이슈 #153, 결정 0048)

화면마다 따로 만들지 않고 여기 것을 씁니다.

- `display.ts` — 줄바꿈 금지(`NBSP` U+00A0 · `WJ` U+2060): 값을 만들 때 묶인 글을 돌려주는 `valueUnit` · `approx`, 가운뎃점 낱말 `tieMiddleDot`, 끝의 "›" `tieChevron`, 이미 있는 문구를 한 번에 묶는 `keepTogether`, 천 단위 쉼표 `formatNumber`.
- `datetime.ts` — 시각 `formatKoreanDateTime` · `koreanClock`, 날짜(`YYYY-MM-DD`) `monthDay` · `weekdayKo` · `koreanDate` · `tenDayPeriod`(상·중·하순) · `koreanPeriod`.
- `water-amount.ts` — 톤 환산(보이는 mm × 면적 ÷ 1,000) `roundMm1` · `toTons` · `formatApproxTons`, 관수량 `convertWater`(L ↔ 톤) · `formatWaterAmount`. 계산이 아니라 DB 의 mm 를 단위만 바꿔 보여 주는 표시 변환입니다.
