import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import { getHomeView, type HomeView } from "@/services/home";
import { getStation, STATION_ENTRIES, STATION_IDS } from "@/services/shell";

import { loadBoard, loadGrowth } from "../shell/board";
import { HomeBoardClient } from "./HomeBoardClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 종합 화면: 첫 줄 → 물·온도·햇빛 카드 → 토양·도매시장 → 전국 표 → 내 농장 안내.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
 * 대표 10곳의 판정·생육 자료를 처음 한 번에 모두 받아 클라이언트로 넘긴다 (결정 0038).
 */
export function HomeBoard({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="min-h-25" />}>
      <ResolvedHomeBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedHomeBoard({ searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_ENTRIES);
  const station = getStation(selection.stationId);
  if (!station) return null;

  const [board, growth] = await Promise.all([
    loadBoard(),
    loadGrowth(selection.crop),
  ]);

  const viewsByStation: Record<number, HomeView> = {};
  for (const id of STATION_IDS) {
    viewsByStation[id] = getHomeView(
      { ...selection, stationId: id },
      board,
      growth,
    );
  }
  if (!(selection.stationId in viewsByStation)) {
    viewsByStation[selection.stationId] = getHomeView(selection, board, growth);
  }

  return (
    <HomeBoardClient
      initialSelection={selection}
      viewsByStation={viewsByStation}
    />
  );
}
