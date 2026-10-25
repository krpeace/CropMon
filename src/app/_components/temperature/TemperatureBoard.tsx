import { connection } from "next/server";
import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import { getPageMeta, getStation, STATION_IDS } from "@/services/shell";
import { getTemperatureView } from "@/services/temperature";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
import { cachedObserved } from "../shell/ShellPage";
import { Grid } from "../ui/Grid";
import { ChillCard, CompareCard } from "./CompareCard";
import { HeatChartCard } from "./HeatChartCard";
import { SpeedCard, StageCards } from "./SpeedCard";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 온도 화면 (시안 그대로, 결정 0013·0014): 생육 속도 → 적산온도 단계 → 누적 그래프 →
 * 저온요구량 | 지역 비교 → 자료 상자. 값은 DB(데이터 계약 v1.4 heat_daily)에서 읽는다.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
 */
export function TemperatureBoard({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageHead page="temperature" meta={null} />}>
      <ResolvedTemperatureBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedTemperatureBoard({ searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_IDS);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page="temperature" meta={null} />;
  await connection(); // 요청마다 DB를 읽는다 (미리 만들어 두지 않음)
  const [view, observed] = await Promise.all([
    getTemperatureView(selection, station),
    cachedObserved(station.id),
  ]);
  // 자료 상자는 공통 틀과 같은 값(마지막 관측 받은 시각). 평년 기간만 DB 값으로 붙인다.
  const base = getPageMeta("temperature", station, observed);
  const meta = view.normalPeriod
    ? { ...base, source: `${base.source} · 평년 ${view.normalPeriod}` }
    : base;

  return (
    <>
      <PageHead page="temperature" meta={meta} />
      <SpeedCard view={view} />
      <StageCards view={view} />
      <HeatChartCard view={view} />
      <Grid min="wide">
        <ChillCard crop={selection.crop} />
        <CompareCard view={view} crop={selection.crop} />
      </Grid>
      <MetaBox meta={meta} />
    </>
  );
}
