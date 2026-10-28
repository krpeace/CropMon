"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  nextInRotation,
  rotationPosition,
  withSelection,
  type Selection,
} from "@/domain/selection";
import { STATION_IDS } from "@/services/shell";

import { useSheet } from "../shell/sheet-context";
import { Icon } from "../ui/Icon";

const INTERVAL_MS = 5000;

/** 종합 화면 자동 전환: 고른 작물은 그대로 두고 5초마다 다음 대표 지역(10곳)으로 바꾼다. 창이 열리면 쉰다. */
export function AutoRotate({ selection }: { selection: Selection }) {
  const router = useRouter();
  const { sheet, popover } = useSheet();
  const [auto, setAuto] = useState(true);
  const pos = rotationPosition(selection, STATION_IDS);
  const running = auto && !sheet && !popover && pos !== null;
  const { stationId, crop, soil, kc } = selection;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      const next = nextInRotation({ stationId, crop, soil, kc }, STATION_IDS);
      router.replace(withSelection("/", next), { scroll: false });
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [running, stationId, crop, soil, kc, router]);

  const total = STATION_IDS.length;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2.5">
        <span className="text-14 text-ink-2/80 whitespace-nowrap">
          {pos === null ? "대표 지점 밖" : `${pos} / ${total}`}
        </span>
        <button
          type="button"
          onClick={() => setAuto(!auto)}
          className={`text-16 flex h-11 cursor-pointer items-center gap-2 rounded-full pr-4.5 pl-3.5 font-bold whitespace-nowrap ${
            auto ? "bg-brand text-white" : "bg-fill/14 text-ink"
          }`}
        >
          <Icon name={auto ? "pause" : "play"} size={18} filled />
          {auto ? "자동 전환 중지" : "자동 전환 시작"}
        </button>
      </div>
      <div className="bg-fill/16 h-1 w-60 overflow-hidden rounded-full">
        {running && (
          <div
            key={`${stationId}|${crop}`}
            className="animate-progress bg-brand h-full rounded-full"
          />
        )}
      </div>
    </div>
  );
}
