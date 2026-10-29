import { Suspense } from "react";

import {
  homeQuestion,
  parseSelection,
  withSelection,
} from "@/domain/selection";
import { getHomeView } from "@/services/home";
import { getStation, STATION_ENTRIES } from "@/services/shell";

import { loadBoard, loadGrowth } from "../shell/board";
import { Grid } from "../ui/Grid";
import { STATUS_CARD } from "../ui/status";
import { AutoRotate } from "./AutoRotate";
import { FarmPromo } from "./FarmPromo";
import { FlipItem } from "./FlipItem";
import { NationalList } from "./NationalList";
import { NationalTable } from "./NationalTable";
import { SoonCard, SummaryCard } from "./SummaryCard";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 종합 화면: 첫 줄 → 물·온도·햇빛 카드 → 토양·도매시장 → 전국 표 → 내 농장 안내.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
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
  const view = getHomeView(selection, board, growth);
  const flipKey = `${selection.stationId}|${selection.crop}`;
  const href = (path: string) => withSelection(path, selection);

  return (
    <>
      <div className="flex flex-wrap items-end gap-4 pt-1.5 pb-0.5">
        <FlipItem
          flipKey={flipKey}
          order={0}
          className="flex min-w-65 flex-1 flex-col gap-2"
        >
          <h1 className="text-hero leading-hero tracking-hero m-0 font-bold text-pretty">
            {homeQuestion(station.name, selection.crop)}
          </h1>
          <div className="text-15 text-ink-2/85 font-semibold">{view.meta}</div>
        </FlipItem>
        <AutoRotate selection={selection} />
      </div>

      <Grid min="card">
        <FlipItem flipKey={flipKey} order={1}>
          <SummaryCard
            href={href("/water")}
            icon="water"
            label="물"
            verdict={view.water.verdict}
            numbers={view.water.numbers}
            background={STATUS_CARD[view.water.tone]}
            badge={view.water.badge ?? undefined}
            grayBadge={view.water.grayBadge ?? undefined}
            gauge={view.water.gauge}
          />
        </FlipItem>
        <FlipItem flipKey={flipKey} order={2}>
          <SummaryCard
            href={href("/temperature")}
            icon="temperature"
            label="온도"
            verdict={view.growth.verdict}
            numbers={view.growth.numbers}
            background="bg-card"
            grayBadge={view.growth.missing ? "자료 없음" : undefined}
          />
        </FlipItem>
        <FlipItem flipKey={flipKey} order={3}>
          <SummaryCard
            href={href("/sunlight")}
            icon="sunlight"
            label="햇빛"
            verdict={view.sunlight.verdict}
            numbers={view.sunlight.numbers}
            background="bg-card"
            grayBadge={view.sunlight.missing ? "자료 없음" : undefined}
          />
        </FlipItem>
      </Grid>

      <Grid min="small">
        <FlipItem flipKey={flipKey} order={4}>
          <SoonCard
            href={href("/soil")}
            icon="soil"
            label="토양"
            question="어떤 흙이고 양분은 어떤가?"
          />
        </FlipItem>
        <FlipItem flipKey={flipKey} order={5}>
          <SoonCard
            href={href("/market")}
            icon="market"
            label="도매시장"
            question="지금 얼마에 팔리고, 앞으로 값은?"
          />
        </FlipItem>
      </Grid>

      <NationalList
        rows={view.rows}
        crop={selection.crop}
        soil={selection.soil}
      />
      <NationalTable
        rows={view.rows}
        crop={selection.crop}
        soil={selection.soil}
      />

      <FarmPromo href={href("/my-farm")} />
    </>
  );
}
