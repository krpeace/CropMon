import type { TemperatureView } from "@/services/temperature";

import { heatChart } from "./heat-chart";

const LINE = "[vector-effect:non-scaling-stroke]";

/** 적산온도 누적 (시안 그대로): 올해(진초록 실선) · 평년(회색 점선) · 오늘 세로선 · 월 눈금. 예상 점선 없음. */
export function HeatChartCard({ view }: { view: TemperatureView }) {
  if (view.days.length === 0) return null;
  const ch = heatChart(view.days, view.today);

  return (
    <section
      aria-label="적산온도 누적"
      className="rounded-card bg-card flex flex-col gap-3 p-5"
    >
      <span className="text-17 font-bold">적산온도 누적</span>
      <div className="text-13 text-ink-2/88 flex flex-wrap gap-x-3.5 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span className="bg-brand h-0.75 w-4" />
          올해
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-ink-2/50 h-0 w-4 border-t-2 border-dashed" />
          평년{view.normalPeriod ? ` ${view.normalPeriod}` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 pl-10">
        <div className="relative h-50">
          <svg
            viewBox={`0 0 ${ch.n} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={ch.grid}
              fill="none"
              stroke="rgb(60 60 67 / 0.12)"
              className={LINE}
            />
            <path
              d={ch.normal}
              fill="none"
              stroke="rgb(60 60 67 / 0.5)"
              strokeWidth={1.6}
              strokeDasharray="5 4"
              className={LINE}
            />
            <path
              d={ch.year}
              fill="none"
              stroke="#144c33"
              strokeWidth={2.6}
              className={LINE}
            />
          </svg>
          {ch.yTicks.map((t) => (
            <span
              key={t.t}
              className="text-12 text-ink-2/75 absolute -left-10 -translate-y-1/2"
              style={{ top: t.top }}
            >
              {t.t}
            </span>
          ))}
          <div
            className="bg-ink absolute inset-y-0 w-0.5 -translate-x-1/2"
            style={{ left: ch.today }}
          />
          <span
            className="text-12 bg-ink absolute -top-0.5 rounded-full px-1.75 py-0.5 font-bold whitespace-nowrap text-white"
            style={{
              left: ch.today,
              transform: `translateX(${ch.todayShift}) translateY(-100%)`,
            }}
          >
            오늘
          </span>
        </div>
        <div className="relative h-4.5" aria-hidden="true">
          {ch.months.map((m) => (
            <span
              key={m.left}
              className="text-12 text-ink-2/80 border-ink-2/20 absolute top-0 border-l pl-0.5 whitespace-nowrap"
              style={{ left: m.left }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
