import { cacheLife } from "next/cache";
import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import {
  getPageMeta,
  getStation,
  STATION_IDS,
  type PageKey,
} from "@/services/shell";
import { getObserved } from "@/services/station-status";

import { MetaBox } from "./MetaBox";
import { PageHead } from "./PageHead";

type Props = {
  page: Exclude<PageKey, "home" | "water" | "temperature">;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 종합을 뺀 쪽의 뼈대: 제목 → (본문) → 자료 상자.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
 */
export function ShellPage({ page, searchParams }: Props) {
  return (
    <Suspense fallback={<PageHead page={page} meta={null} />}>
      <ResolvedShellPage page={page} searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedShellPage({ page, searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_IDS);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page={page} meta={null} />;
  const needsObserved = page === "sunlight" && station.measuresSunlight;
  const observed = needsObserved ? await cachedObserved(station.id) : null;
  const meta = getPageMeta(page, station, observed);

  return (
    <>
      <PageHead page={page} meta={meta} />
      <MetaBox meta={meta} />
    </>
  );
}

/** 그 지점의 마지막 ASOS 관측 받은 시각. 하루 두 번 바뀌므로 5분 동안 같은 값을 쓴다. */
export async function cachedObserved(stationId: number) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  return getObserved(stationId);
}
