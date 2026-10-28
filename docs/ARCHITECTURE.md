# 구조 (ARCHITECTURE)

## 큰 그림

```
croplib-dp (Python, 별도 저장소)  →  Supabase (DB)  →  이 저장소 (Next.js 화면)  →  Vercel (배포)
      수집·계산                        저장                    보여 주기                   공개
```

이 저장소는 계산하지 않습니다. DB에 저장된 값을 읽어서 보여 주기만 합니다. 공공 API 수집과 계산은 croplib-dp가 맡고, 둘은 `docs/DATA_CONTRACT.md`의 약속으로만 이어집니다.

## 폴더 4개

| 폴더           | 하는 일                                       | 예                                 |
| -------------- | --------------------------------------------- | ---------------------------------- |
| `src/domain`   | 표시·판정 규칙. 순수 함수만 둡니다.           | "13시간 넘게 갱신이 없으면 멈춤"   |
| `src/services` | 일의 순서. 자료를 읽고 화면용으로 정리합니다. | "관측소 자료 읽기 → 신선도 붙이기" |
| `src/infra`    | 바깥 연결. Supabase 같은 외부 서비스.         | "Supabase에서 표 읽기"             |
| `src/app`      | Next.js 화면과 API.                           | 홈 페이지                          |

그 밖에:

- `src/mocks` — 예시 값. `src/mocks/meta.ts`(발표 회차 등)와 `src/mocks/farm.ts`(내 농장 데모용 240개 계산 표, `FARM_SAMPLES`)가 있습니다.
- **내 농장 데모 화면** (이슈 #31, 결정 0018): 2027년 회원제 정식 오픈 전까지 시안과 똑같이 보여 주는 정적 미리보기 화면입니다. 화면에서 계산하지 않고, 시안 물수지 흉내 계산을 미리 돌려 뽑아 둔 240개 표(`src/mocks/farm.ts`)에서 `지점|작물|흙번호` 키로 읽기만 합니다. 주소 맞추기와 흙 12종 목록은 `src/domain/farm-preview.ts`의 `farmMatch(addr)` 순수 함수(테스트 있음)가 맡고, 화면은 클라이언트 컴포넌트(`src/app/_components/farm/FarmScreen.tsx`) 하나입니다. CSV 올리기는 파일 이름만 표시하며, "예시 파일로 보기"로 정적 보고서를 열고 다시 올리기로 초기화할 수 있습니다.
- **DB에서 읽는 쪽**: 물 화면(`src/services/water.ts`)이 처음입니다. 읽기는 `src/infra/supabase/water-source.ts`(공개 키, 필요한 열만, 8초 제한, 자동 재시도 끔), 이름·날짜 붙이기는 `src/domain/water-outlook.ts`가 합니다. DB에 닿지 못하면 쪽은 멈추지 않고 "자료 없음"과 이유를 보여 줍니다. 쪽을 요청마다 그리도록 `connection()`을 부릅니다. 지역 칩 점 색(`src/services/station-status.ts`, `src/infra/supabase/status-source.ts`)과 온도·햇빛 자료 상자의 관측 시각도 DB에서 읽습니다. 헤더는 모든 쪽에 나오므로 `SiteHeaderWithStatus`가 서버에서 읽어 5분 동안 재사용(`use cache`)하고, 브라우저 쪽 헤더에 넘깁니다. 종합 화면 물 카드·전국 표도 같은 판정 표(`getStationBoard`, 캐시는 `src/app/_components/shell/board.ts` 한 곳)를 씁니다. 온도·햇빛 카드와 전국 표 생육 칸은 지점 10곳의 마지막 관측일 적산온도·적산일사(`src/services/growth-latest.ts`, 온도·햇빛 화면의 지역 비교와 같은 읽기)를 판정 표와 따로 5분 동안 재사용합니다(`loadGrowth`, 같은 `board.ts`). 헤더는 이 값을 쓰지 않습니다.
- **지점 사전**: `src/infra/stations.ts` 고정 목록(기상청 ASOS 105곳: 현행 운영 97곳 + 폐지·휴지 보존 8곳, 번호·이름·시도·대표 여부·운영 여부·일사 관측 여부). 주소창 읽기와 지역 검색에 바로 쓰려고 DB 를 묻지 않으며, DB 사전 자료와 같은지는 `seed.test.ts`가 검사합니다.
- **지역 고르기** (이슈 #39, 결정 0022): 넓은 화면(`>= 1280px`)에서는 대표 10곳 칩 오른쪽에 "지역 고르기" 버튼(380px 팝오버)을 두고, 대표 밖 지점을 고르면 그 버튼이 진초록 선택 칩(`● 홍천 212 ▾`)으로 바뀝니다. 좁은 화면(`< 1280px`)에서는 칩 10개가 단일 버튼(`지역 · ● 춘천 101 ▾`)으로 접히며, 모바일(`< 1024px`)에서는 바닥 시트(`role="dialog"`)로 열립니다. 정렬·검색·묶기 규칙은 `src/domain/selection.ts`의 순수 함수(`sortStationsKo`, `filterStations`, `buildRegionSections`)에 있습니다.
- **물 화면 조각** (`src/app/_components/water/`): `WaterBoard`(순서와 기준 날짜 줄·재배 방식), `NowCard`(① 지금 토양 상태·작물 공통 `CommonNowCard`·토성/계산근거 말풍선), `SoilPicker`(작물 공통 12종 토양 선택), `OutlookCard`(② 앞으로 3일), `SeasonCard`(③ 작기 그래프·월별 요약). 그래프 좌표는 `season-chart.ts`(순수 함수, 테스트 있음)가 만들고, 누르면 그날로 가는 부분(`ChartClick`)과 날짜 고르기(`DayPicker`)만 브라우저 코드입니다. 작물별 판정 문구·월별 합계 규칙은 `src/domain/water-verdict.ts`에, 작물 공통(토양 물 상태) 6단계 이름·설명·계산근거 문구는 `src/domain/soil-water.ts`에 있습니다.
- **온도 화면** (온1): 읽기는 `src/infra/supabase/heat-source.ts`(물 화면과 같은 방식), 화면용 정리는 `src/services/temperature.ts`, 문구·단계 도달일 찾기는 `src/domain/heat.ts`. 조각은 `src/app/_components/temperature/`: `TemperatureBoard`(순서·자료 상자), `SpeedCard`(생육 속도·단계 카드), `HeatChartCard`(누적 그래프, 좌표는 `heat-chart.ts`), `CompareCard`(저온요구량·지역 비교). 고른 지점과 지역 비교는 따로 읽어, 한쪽이 실패해도 다른 쪽은 보입니다.
- **햇빛 화면** (온1): 읽기는 `src/infra/supabase/sun-source.ts`, 화면용 정리는 `src/services/sunlight.ts`, 평년 대비 %·월별 합·가장 적은 달·문구는 `src/domain/sun.ts`. 조각은 `src/app/_components/sunlight/`: `SunlightBoard`(순서·자료 상자), `SunCards`(올해 쌓인 햇빛·월별·지역 비교·재지 않는 지점). 누적 그래프는 온도 화면의 `HeatChartCard`(제목을 받음)를 같이 쓰고, 막대 좌표는 `sun-chart.ts`. 그 지점 `sun_daily` 줄이 없으면 "햇빛을 재지 않는 지점"입니다(DB 기준).
- **화면 테스트용 가짜 DB**: `e2e/fake-supabase.mjs`가 PostgREST 흉내를 냅니다. 오늘 날짜 기준으로 춘천(101) 사과·배추 자료를 만들고, 태백(216)은 일부러 오류를 돌려줍니다. Playwright 가 먼저 띄웁니다.
- `src/app/_components` — 여러 쪽이 함께 쓰는 화면 부품. `shell/`(헤더·바닥글·쪽 제목·자료 상자·가운데 창), `ui/`(아이콘·배지·게이지·카드 격자), `home/`(종합 화면 조각).
- **토양·도매시장 "준비 중" 본문** (이슈 #27): `ShellPage` 가 두 쪽에만 `shell/ComingSoon.tsx`(정적 조각, DB 읽기 없음)를 제목과 자료 상자 사이에 넣습니다. 글(열리면 보여 줄 것 4개·쓸 자료)은 `src/services/shell.ts` 의 `getComingSoon` 값이고, 질문은 `PAGE_INFO` 에서 읽습니다.
- **파비콘·앱 아이콘** (이슈 #29): Next.js 파일 규칙에 따라 `src/app/` 에 `favicon.ico`(16·32·48), `icon.png`(512×512), `apple-icon.png`(180×180, iOS 흰 배경)를 둡니다. `<head>` 연결 태그가 자동으로 들어가므로 직접 `<link>` 나 `metadata.icons` 를 쓰지 않습니다.
- `e2e` — 실제 브라우저로 쪽을 열어 보는 화면 테스트(Playwright).

## 화면 공통 규칙

- **디자인 토큰**: 색·글꼴·글자 크기·모서리·그림자·배치 기준 폭은 `src/app/tokens.css` 한 곳에 둡니다. 화면은 토큰 이름(`bg-brand`, `text-15`, `rounded-card` …)만 씁니다. Tailwind 기본 색·글자 크기·모서리는 지워 두어, 토큰에 없는 값은 효과가 없습니다.
- **지역·작물·토양 선택**: 주소창 `?st=<지점 번호>&crop=<common|apple|cabbage>`에 남겨 모든 메뉴에 이어집니다. 읽고 쓰는 규칙은 `src/domain/selection.ts`에 있습니다. 기본 작물은 `"common"`(`작물 공통`)이며, 현행 운영(`isActive: true`) 지점 97곳을 모두 허용하고 값이 없거나 잘못되었거나 폐지·휴지 지점(`isActive: false`)이면 춘천(101)·작물 공통으로 돌립니다. 작물 공통일 때는 토성 12종 선택을 `&soil=<코드>`(기본값 `"loam"` 양토이면 생략)로 주소창에 남기고, 사과·배추로 바꾸면 `soil`을 지웁니다. 대표 10곳 밖 지점을 고르면 자동 전환은 멈추고("대표 지점 밖"), 아직 물 계산 시나리오가 없는 화면(종합·물·온도)은 "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요"를 안내합니다. 재배 방식은 사과·배추일 때만 `&kc=<번호>`(FAO-56 Table 12 순서, `crop_kc_sets.set_no`)로 붙으며, 지역을 바꾸면 그대로, 작물을 바꾸면 빠집니다. 물 화면만 기준 날짜 `&d=YYYY-MM-DD`(오늘이면 없음)와 발표 회차 `&run=02|17`을 더 붙이고, 다른 메뉴로 가면 빠집니다.
- **주소창 읽기**: `cacheComponents` 설정 때문에 주소창 값을 읽는 부분은 `<Suspense>` 안에 둡니다. 쪽 파일은 `ShellPage`/`HomeHead`에 `searchParams`를 넘기기만 합니다.
- **폭**: px로 고정하지 않습니다. 내용 최대 폭(`--page-max` 1440)과 가장자리 여백(`--page-gutter`)은 토큰에 있고, 2열→1열이 바뀌는 폭은 `--breakpoint-desktop`(1024), 대표 10개 칩이 단일 버튼으로 접히는 폭은 `--breakpoint-wide`(1280)입니다.
- **밝은 화면만** 씁니다 (시안 기준).

## 방향: 안쪽은 바깥을 모른다

```
app  →  services  →  domain
             ↓
           infra
```

- 화살표는 "불러다 쓴다"는 뜻입니다. 거꾸로는 불러다 쓰지 않습니다.
- **domain은 바깥을 모릅니다.** 화면(React, Next.js), DB(Supabase), 네트워크를 불러오지 않습니다. 시각이 필요하면 직접 시계를 보지 않고 값으로 받습니다. 예를 들어 `getFreshness(마지막갱신, 지금)`은 "지금"을 인자로 받습니다.
- 이렇게 하면 domain 규칙은 DB나 화면 없이 테스트만으로 확인할 수 있고, DB나 화면이 바뀌어도 규칙은 그대로 남습니다.
- 이 원칙은 ESLint가 자동으로 검사합니다. `src/domain`에서 화면·DB·다른 폴더 코드를 불러오면 `npm run lint`가 실패합니다.

## 기술

- Next.js (App Router, TypeScript strict), Tailwind CSS
- 품질 도구: ESLint, Prettier, Vitest, Playwright
- 보안 도구: gitleaks (비밀키 검사, 결정 0019)
- Node 버전은 `.nvmrc`에 적힌 값을 쓰고, 자동 검사(CI)도 같은 값을 씁니다.
- CI 검사(`.github/workflows/ci.yml`): `quality` 작업(린트·타입체크·포맷·단위테스트·빌드·E2E)과 `secrets` 작업(gitleaks 바이너리 체크섬 검증 후 전체 커밋 이력 비밀키 검사 및 런타임 자체 시험)이 병렬로 돌아갑니다.

## 운영 예약 (결정 0014)

croplib-dp 수집은 Supabase pg_cron 이 정해진 시각에 GitHub 워크플로를 실행시킨다(`ops.dispatch_workflow`, 토큰은 Vault `github_dispatch_token`). 운영용 이름공간 `ops` 는 화면·회원이 볼 수 없다. 최근 실행 요청 결과는 `select * from ops.dispatch_recent;`.
