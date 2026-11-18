import { Suspense } from "react";

import { parseSelection, withSelection } from "@/domain/selection";
import {
  type ComingSoonPage,
  getComingSoon,
  getPageMeta,
  getStation,
  STATION_ENTRIES,
} from "@/services/shell";

import { ComingSoon } from "./ComingSoon";
import { MetaBox } from "./MetaBox";
import { PageHead } from "./PageHead";
import { PAGE_INFO } from "./pages";

type Props = {
  page: ComingSoonPage;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * "준비 중" 쪽의 뼈대: 제목 → 본문(ComingSoon) → 자료 상자. 토양·시세·관측·농사정보·병해충·일지가 쓴다.
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
  // 준비 중인 쪽은 계산 시각이 필요 없다 (온도·햇빛은 각 보드가 view.updatedAt 으로 만든다)
  const meta = getPageMeta(page, station, null);

  return (
    <>
      <PageHead page={page} meta={meta} />
      <ComingSoon
        question={PAGE_INFO[page].question}
        {...getComingSoon(page, selection.crop)}
        waterHref={withSelection("/water", selection)}
      />
      <MetaBox meta={meta} />
    </>
  );
}
