import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import {
  getPageMeta,
  getStation,
  STATION_IDS,
  type PageKey,
} from "@/services/shell";

import { MetaBox } from "./MetaBox";
import { PageHead } from "./PageHead";

type Props = {
  page: Exclude<PageKey, "home">;
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
  const meta = getPageMeta(page, station);

  return (
    <>
      <PageHead page={page} meta={meta} />
      <MetaBox meta={meta} />
    </>
  );
}
