import type { Crop } from "@/domain/selection";
import { dayLabel } from "@/domain/water-outlook";
import type { MonthRow } from "@/domain/water-verdict";
import type { SeasonDay } from "@/services/water";

import { ChartClick } from "./ChartClick";
import { seasonChart } from "./season-chart";

const LINE = "[vector-effect:non-scaling-stroke] [stroke-linejoin:round]";

/** ③ 작기 돌아보기 (시안 그대로): 위 ETo·ETc·비, 아래 부족한 물·관수 시작점, 월별 요약. */
export function SeasonCard({
  season,
  months,
  raw,
  taw,
  selected,
  crop,
  base,
  today,
}: {
  season: SeasonDay[];
  months: MonthRow[];
  raw: number;
  taw: number;
  selected: string;
  crop: Crop;
  base: string;
  today: string;
}) {
  if (season.length === 0) return null;
  const ch = seasonChart(season, raw, taw, selected);
  const first = season[0].date;
  const last = season.at(-1)!.date;
  const year = first.slice(0, 4);
  const off = crop === "apple" ? "휴면기" : "작기 아님";
  const sel = season.find((d) => d.date === selected) ?? season.at(-1)!;
  const view = `0 0 ${ch.n} 100`;

  return (
    <section
      aria-label={`${year} 작기 돌아보기`}
      className="rounded-card bg-card flex flex-col gap-3.5 p-5"
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-15 text-ink-2/85 font-bold">
          ③ {year} 작기 돌아보기
        </span>
        <span className="text-14 text-ink-2/80">
          {dayLabel(first).replace(/ \(.\)$/, "")} ~{" "}
          {dayLabel(last).replace(/ \(.\)$/, "")} · 그래프를 누르면 그날로 가요
        </span>
      </div>
      <div className="text-13 text-ink-2/88 flex flex-wrap gap-x-3.5 gap-y-1.5">
        <Legend swatch="h-0.5 w-4 bg-ink-2/55">기준 증발산 ETo</Legend>
        <Legend swatch="h-0.75 w-4 bg-emerald">작물이 쓴 물 ETc</Legend>
        <Legend swatch="h-3 w-2 bg-[rgb(0_170_220/0.6)]">비</Legend>
        <Legend swatch="h-0.75 w-4 bg-brand-ink">부족한 물 Dr</Legend>
        <Legend swatch="h-0 w-4 border-t-2 border-dashed border-warn">
          관수 시작점 RAW
        </Legend>
        <Legend swatch="size-3 bg-fill/16">{off}</Legend>
      </div>

      <ChartClick base={base} dates={season.map((d) => d.date)} today={today}>
        <div className="text-12 text-ink-2/75 -mx-6.5 flex justify-between">
          <span>mm/일</span>
          <span>비 mm</span>
        </div>
        <div className="relative h-37.5">
          <svg
            viewBox={view}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={ch.off}
              fill="color-mix(in oklab, var(--color-fill) 12%, transparent)"
            />
            <path
              d={ch.grid}
              fill="none"
              stroke="color-mix(in oklab, var(--color-ink-2) 12%, transparent)"
              className={LINE}
            />
            <path d={ch.rain} fill="rgb(0 170 220 / 0.55)" />
            <path
              d={ch.eto}
              fill="none"
              stroke="color-mix(in oklab, var(--color-ink-2) 50%, transparent)"
              strokeWidth={1.4}
              className={LINE}
            />
            <path
              d={ch.etc}
              fill="none"
              stroke="#37b77c"
              strokeWidth={2}
              className={LINE}
            />
          </svg>
          {ch.etoTicks.map((t) => (
            <Tick key={t.t} side="left" top={t.top}>
              {t.t}
            </Tick>
          ))}
          {ch.rainTicks.map((t) => (
            <Tick
              key={t.t}
              side="right"
              top={t.top}
              className="text-[rgb(0_120_170/0.9)]"
            >
              {t.t}
            </Tick>
          ))}
          <Marker left={ch.sel} />
        </div>
        <div className="text-12 text-ink-2/75 -mx-6.5 mt-1">부족한 물 mm</div>
        <div className="relative h-32.5">
          <svg
            viewBox={view}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={ch.off}
              fill="color-mix(in oklab, var(--color-fill) 12%, transparent)"
            />
            <path d={ch.overRaw} fill="rgb(255 141 40 / 0.10)" />
            <path
              d={ch.drArea}
              fill="color-mix(in oklab, var(--color-brand-ink) 12%, transparent)"
            />
            <path
              d={ch.dr}
              fill="none"
              stroke="var(--color-brand-ink)"
              strokeWidth={2}
              className={LINE}
            />
            <path
              d={ch.rawLine}
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth={1.6}
              strokeDasharray="5 4"
              className={LINE}
            />
            <path
              d={ch.base}
              fill="none"
              stroke="color-mix(in oklab, var(--color-ink-2) 25%, transparent)"
              className={LINE}
            />
          </svg>
          {ch.drTicks.map((t) => (
            <Tick
              key={t.t + t.top}
              side="left"
              top={t.top}
              className={t.raw ? "text-warn font-bold" : ""}
            >
              {t.t}
            </Tick>
          ))}
          <Marker left={ch.sel} />
          <span
            className="text-12 bg-ink text-bg absolute -top-6 rounded-full px-1.75 py-0.5 font-bold whitespace-nowrap"
            style={{ left: ch.sel, transform: `translateX(${ch.selShift})` }}
          >
            {dayLabel(sel.date).replace(/ \(.\)$/, "")}
          </span>
        </div>
        <div className="relative h-4.5">
          {ch.months.map((m) => (
            <span
              key={m.label}
              className="text-12 text-ink-2/80 border-ink-2/20 absolute top-0 border-l pl-0.5 whitespace-nowrap"
              style={{ left: m.left }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </ChartClick>

      <div className="border-ink-2/18 flex flex-col border-t-(length:--hairline) pt-2">
        <div className="text-16 pt-1 pb-2 font-bold">
          월별 요약{" "}
          <span className="text-13 text-ink-2/75 font-normal">단위 mm</span>
        </div>
        <table className="text-16 w-full table-fixed border-collapse tabular-nums">
          <thead>
            <tr className="text-13 text-ink-2/80 border-ink-2/18 border-b-(length:--hairline) font-semibold">
              <th className="w-[24%] py-2 text-left font-semibold">월</th>
              <Th label="기준 증발산" abbr="ETo" />
              <Th label="작물이 쓴 물" abbr="ETc" />
              <Th label="비" />
              <Th label="관수 필요" abbr="일수" />
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr
                key={m.month}
                className="border-ink-2/10 border-b-(length:--hairline)"
              >
                <td className="py-2.5 font-semibold">{m.month}</td>
                <td className="pl-2 text-right">{m.eto}</td>
                <td
                  className={`pl-2 text-right ${m.etc == null ? "text-14 text-gray-ink whitespace-nowrap" : ""}`}
                >
                  {m.etc ?? off}
                </td>
                <td className="pl-2 text-right">{m.rain}</td>
                <td
                  className={`pl-2 text-right font-bold ${
                    m.needDays ? "text-warn" : "text-ink-2/85"
                  }`}
                >
                  {m.needDays == null ? "—" : `${m.needDays}일`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Legend({
  swatch,
  children,
}: {
  swatch: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`flex-none ${swatch}`} />
      {children}
    </span>
  );
}

function Tick({
  side,
  top,
  className = "",
  children,
}: {
  side: "left" | "right";
  top: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`text-12 text-ink-2/75 absolute -translate-y-1/2 ${
        side === "left" ? "-left-6.5" : "-right-6.5"
      } ${className}`}
      style={{ top }}
    >
      {children}
    </span>
  );
}

function Marker({ left }: { left: string }) {
  return (
    <div
      aria-hidden="true"
      className="bg-ink absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-full"
      style={{ left }}
    />
  );
}

function Th({ label, abbr }: { label: string; abbr?: string }) {
  return (
    <th className="py-2 pl-2 text-right align-bottom font-semibold">
      {label}
      {abbr && (
        <>
          <br />
          <span className="text-ink-2/60 font-normal">{abbr}</span>
        </>
      )}
    </th>
  );
}
