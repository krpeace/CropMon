import { connection } from "next/server";
import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import { getPageMeta, getStation, STATION_IDS } from "@/services/shell";
import { getSunlightView } from "@/services/sunlight";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
import { cachedObserved } from "../shell/ShellPage";
import { HeatChartCard } from "../temperature/HeatChartCard";
import { Grid } from "../ui/Grid";
import {
  MonthsCard,
  NotMeasuredCard,
  SunCompareCard,
  TotalCard,
} from "./SunCards";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 햇빛 화면 (시안 그대로, 결정 0013·0016): 올해 쌓인 햇빛 → 적산일사 누적 → 월별 | 지역 비교 → 자료 상자.
 * 그 지점 sun_daily 줄이 없으면 "햇빛을 재지 않아요" 화면. 값은 DB(데이터 계약 v1.4 sun_daily)에서 읽는다.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
 */
export function SunlightBoard({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageHead page="sunlight" meta={null} />}>
      <ResolvedSunlightBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedSunlightBoard({ searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_IDS);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page="sunlight" meta={null} />;
  await connection(); // 요청마다 DB를 읽는다 (미리 만들어 두지 않음)
  const [view, observed] = await Promise.all([
    getSunlightView(selection, station),
    station.measuresSunlight ? cachedObserved(station.id) : null,
  ]);
  // 자료 상자는 공통 틀과 같은 값(measuresSunlight 기준, 정리는 별도 이슈). 평년 기간만 DB 값으로 붙인다.
  const base = getPageMeta("sunlight", station, observed);
  const meta =
    station.measuresSunlight && view.normalPeriod
      ? { ...base, source: `${base.source} · 평년 ${view.normalPeriod}` }
      : base;

  return (
    <>
      <PageHead page="sunlight" meta={meta} />
      {view.kind === "notMeasured" ? (
        <NotMeasuredCard name={station.name} crop={selection.crop} />
      ) : (
        <>
          <TotalCard view={view} />
          <HeatChartCard
            title="적산일사 누적"
            days={view.days}
            today={view.today}
            normalPeriod={view.normalPeriod}
          />
          <Grid min="wide">
            <MonthsCard view={view} />
            <SunCompareCard view={view} crop={selection.crop} />
          </Grid>
        </>
      )}
      <MetaBox meta={meta} />
    </>
  );
}
