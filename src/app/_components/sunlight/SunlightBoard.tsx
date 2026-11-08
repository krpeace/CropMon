import { connection } from "next/server";
import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import { getPageMeta, getStation, STATION_ENTRIES } from "@/services/shell";
import { getSunlightView } from "@/services/sunlight";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
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
  const selection = parseSelection(await searchParams, STATION_ENTRIES);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page="sunlight" meta={null} />;
  await connection(); // 요청마다 DB를 읽는다 (미리 만들어 두지 않음)
  const view = await getSunlightView(selection, station);
  // 자료 상자의 갱신 시각 = sun_daily 마지막 계산 시각(매일 09:20 heat-sun).
  // 일사를 재는지는 아직 사전(measuresSunlight) 기준이다 (DB 기준으로 고치는 것은 별도 이슈). 평년 기간은 DB 값으로 붙인다.
  const base = getPageMeta(
    "sunlight",
    station,
    view.updatedAt
      ? { date: view.observedDate, updatedAt: view.updatedAt }
      : null,
  );
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
