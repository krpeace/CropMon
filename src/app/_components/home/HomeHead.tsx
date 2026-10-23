import { Suspense } from "react";

import { CROP_LABEL, parseSelection } from "@/domain/selection";
import { getHomeMeta, getStation, STATION_IDS } from "@/services/shell";

import { AutoRotate } from "./AutoRotate";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 종합 첫 줄: "오늘 춘천 사과는 어떤가요?", 갱신·자료 한 줄, 자동 전환. */
export function HomeHead({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="min-h-25" />}>
      <ResolvedHomeHead searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedHomeHead({ searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_IDS);
  const station = getStation(selection.stationId);
  if (!station) return null;

  return (
    <div className="flex flex-wrap items-end gap-4 pt-1.5 pb-0.5">
      <div className="flex min-w-65 flex-1 flex-col gap-2">
        <h1 className="text-hero leading-hero tracking-hero m-0 font-bold text-pretty">
          오늘 {station.name} {CROP_LABEL[selection.crop]}는 어떤가요?
        </h1>
        <div className="text-15 text-ink-2/85 font-semibold">
          {getHomeMeta(station)}
        </div>
      </div>
      <AutoRotate selection={selection} />
    </div>
  );
}
