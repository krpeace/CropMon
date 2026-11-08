import { Suspense } from "react";

import { parseSelection, withSelection } from "@/domain/selection";
import {
  getComingSoon,
  getPageMeta,
  getStation,
  STATION_ENTRIES,
  type PageKey,
} from "@/services/shell";

import { ComingSoon } from "./ComingSoon";
import { MetaBox } from "./MetaBox";
import { PageHead } from "./PageHead";
import { PAGE_INFO } from "./pages";

type Props = {
  page: Exclude<
    PageKey,
    "home" | "water" | "temperature" | "sunlight" | "my-farm"
  >;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 종합을 뺀 쪽의 뼈대: 제목 → (본문) → 자료 상자. 토양·도매시장은 "준비 중" 본문(ComingSoon)이 들어간다.
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
  const selection = parseSelection(await searchParams, STATION_ENTRIES);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page={page} meta={null} />;
  // 토양·도매시장·내 농장은 계산 시각이 필요 없다 (온도·햇빛은 각 보드가 view.updatedAt 으로 만든다)
  const meta = getPageMeta(page, station, null);

  return (
    <>
      <PageHead page={page} meta={meta} />
      {(page === "soil" || page === "market") && (
        <ComingSoon
          question={PAGE_INFO[page].question}
          {...getComingSoon(page, selection.crop)}
          waterHref={withSelection("/water", selection)}
        />
      )}
      <MetaBox meta={meta} />
    </>
  );
}
