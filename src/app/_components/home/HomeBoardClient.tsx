"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  homeQuestion,
  withSelection,
  type Selection,
} from "@/domain/selection";
import type { HomeView } from "@/services/home";
import { getStation } from "@/services/shell";

import { Grid } from "../ui/Grid";
import { STATUS_CARD } from "../ui/status";
import { AutoRotate } from "./AutoRotate";
import { shouldRefreshData } from "./auto-rotate-state";
import { FarmPromo } from "./FarmPromo";
import { FlipItem } from "./FlipItem";
import { NationalList } from "./NationalList";
import { NationalTable } from "./NationalTable";
import { SoonCard, SummaryCard } from "./SummaryCard";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30분

export function HomeBoardClient({
  initialSelection,
  viewsByStation,
}: {
  initialSelection: Selection;
  viewsByStation: Record<number, HomeView>;
}) {
  const router = useRouter();
  const [prevInitialId, setPrevInitialId] = useState(
    initialSelection.stationId,
  );
  const [currentStationId, setCurrentStationId] = useState(
    initialSelection.stationId,
  );
  const lastRefreshedRef = useRef<number | null>(null);

  // URL 탐색이나 직접 클릭으로 initialSelection 이 바뀌면 렌더링 중 즉시 맞춘다 (React 공식 패턴)
  if (prevInitialId !== initialSelection.stationId) {
    setPrevInitialId(initialSelection.stationId);
    setCurrentStationId(initialSelection.stationId);
  }

  // 30분 주기 자료 갱신 (탭이 숨겨져 있으면 멈추고, 다시 보일 때 필요하면 갱신)
  useEffect(() => {
    if (lastRefreshedRef.current === null) {
      lastRefreshedRef.current = Date.now();
    }

    function checkAndRefresh() {
      const last = lastRefreshedRef.current ?? Date.now();
      if (
        shouldRefreshData({
          isHidden: typeof document !== "undefined" ? document.hidden : false,
          lastRefreshedAt: last,
          now: Date.now(),
          intervalMs: REFRESH_INTERVAL_MS,
        })
      ) {
        lastRefreshedRef.current = Date.now();
        router.refresh();
      }
    }

    const intervalId = setInterval(checkAndRefresh, 60_000);

    function handleVisibility() {
      checkAndRefresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  const handleRotate = useCallback((next: Selection) => {
    setCurrentStationId(next.stationId);
    window.history.replaceState(null, "", withSelection("/", next));
  }, []);

  const currentSelection: Selection = {
    ...initialSelection,
    stationId: currentStationId,
  };
  const station = getStation(currentStationId);
  if (!station) return null;

  const view =
    viewsByStation[currentStationId] ??
    viewsByStation[initialSelection.stationId];
  if (!view) return null;

  const flipKey = `${currentStationId}|${currentSelection.crop}`;
  const href = (path: string) => withSelection(path, currentSelection);

  return (
    <>
      <div className="flex flex-wrap items-end gap-4 pt-1.5 pb-0.5">
        <FlipItem
          flipKey={flipKey}
          order={0}
          className="flex min-w-65 flex-1 flex-col gap-2"
        >
          <h1 className="text-hero leading-hero tracking-hero m-0 font-bold text-pretty">
            {homeQuestion(station.name, currentSelection.crop)}
          </h1>
          <div className="text-15 text-ink-2/85 font-semibold">{view.meta}</div>
        </FlipItem>
        <AutoRotate selection={currentSelection} onRotate={handleRotate} />
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
            note={view.water.note ?? undefined}
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
            note={view.growth.note ?? undefined}
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
            note={view.sunlight.note ?? undefined}
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
        crop={currentSelection.crop}
        soil={currentSelection.soil}
        waterFilledScope={view.waterFilledScope}
        waterFilledNotice={view.waterFilledNotice}
        heatDateNote={view.heatDateNote}
        sunDateNote={view.sunDateNote}
      />
      <NationalTable
        rows={view.rows}
        crop={currentSelection.crop}
        soil={currentSelection.soil}
        waterFilledScope={view.waterFilledScope}
        waterFilledNotice={view.waterFilledNotice}
        heatDateNote={view.heatDateNote}
        sunDateNote={view.sunDateNote}
      />

      <FarmPromo href={href("/my-farm")} />
    </>
  );
}
