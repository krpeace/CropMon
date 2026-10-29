import type { Gauge as GaugeValue } from "@/services/home";

import { STATUS_DOT } from "./status";

const SIZE = {
  /** 종합 카드: 높이 12, 흰 바탕, 관수 시작점 표시 3px. */
  card: {
    track: "h-3 bg-white/90 dark:bg-white/12",
    marker: "-top-1 -bottom-1 w-0.75 -translate-x-1/2 rounded-full",
  },
  /** 전국 표: 높이 10, 회색 바탕, 관수 시작점 표시 2px. */
  row: {
    track: "h-2.5 bg-fill/14",
    marker: "-top-0.75 -bottom-0.75 w-0.5",
  },
};

/** 부족한 물 게이지. 막대 = 부족한 물, 주황 세로선 = 관수 시작점. */
export function Gauge({
  gauge,
  size,
  className = "",
}: {
  gauge: GaugeValue;
  size: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <div
      aria-hidden="true"
      className={`relative rounded-full ${s.track} ${className}`}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${STATUS_DOT[gauge.status]}`}
        style={{ width: `${gauge.fillPct}%` }}
      />
      <div
        className={`bg-warn absolute ${s.marker}`}
        style={{ left: `${gauge.rawPct}%` }}
      />
    </div>
  );
}
