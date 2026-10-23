import Link from "next/link";

import { CROP_LABEL, withSelection, type Crop } from "@/domain/selection";
import { WATER_STATUSES, WATER_STATUS_LABEL } from "@/domain/water-status";
import type { HomeRow } from "@/services/home";

import { Gauge } from "../ui/Gauge";
import { StatusBadge } from "../ui/StatusBadge";
import { STATUS_DOT } from "../ui/status";

const COLS = "grid grid-cols-(--national-cols) gap-4";

/** 전국 물·환기상·생육 종합 표. 줄을 누르면 그 지역으로 바뀐다. 데스크톱에서만 보인다. */
export function NationalTable({ rows, crop }: { rows: HomeRow[]; crop: Crop }) {
  return (
    <section
      aria-labelledby="national-title"
      className="rounded-card bg-card desktop:flex hidden flex-col gap-1 px-6 pt-6 pb-3"
    >
      <div className="flex flex-wrap items-baseline gap-3 pb-3">
        <h2 id="national-title" className="text-22 m-0 font-bold">
          전국 물·환기상·생육 종합
        </h2>
        <span className="text-15 text-ink-2/80">
          오늘 {CROP_LABEL[crop]} 기준 · 줄을 누르면 그 지역으로 바뀌어요
        </span>
      </div>
      <div
        className={`${COLS} border-ink-2/20 text-14 text-ink-2/80 border-b-(length:--hairline) px-3 py-2.5 font-semibold`}
      >
        <span>지점</span>
        <span>오늘</span>
        <span>
          부족한 물 / 관수 시작점{" "}
          <span className="text-ink-2/60 font-normal">Dr / RAW</span>
        </span>
        <span>앞으로 3일</span>
        <span>생육 (적산온도)</span>
        <span>생육 (적산일사)</span>
      </div>
      {rows.map((row) => (
        <Link
          key={row.id}
          href={withSelection("/", { stationId: row.id, crop })}
          scroll={false}
          aria-current={row.selected ? "true" : undefined}
          className={`${COLS} rounded-row border-ink-2/10 text-ink hover:bg-fill/8 items-center border-b-(length:--hairline) p-3 ${
            row.selected ? "bg-emerald/10" : ""
          }`}
        >
          <span className="text-17 font-bold">
            {row.name}{" "}
            <span className="text-13 text-ink-2/70 font-normal">{row.id}</span>
          </span>
          <StatusBadge badge={row.badge} className="justify-self-start" />
          <div className="flex items-center gap-3">
            {row.gauge ? (
              <Gauge gauge={row.gauge} size="row" className="flex-1" />
            ) : (
              <div className="bg-fill/14 h-2.5 flex-1 rounded-full" />
            )}
            <span className="text-15 w-21 text-right">{row.drText}</span>
          </div>
          <div className="flex gap-1.5">
            {row.days.map((day) => (
              <span
                key={day.label}
                title={WATER_STATUS_LABEL[day.status]}
                className="text-12 text-ink-2/75 flex w-11.5 flex-col items-center gap-0.75"
              >
                <span
                  className={`h-2.5 w-7 rounded-full ${STATUS_DOT[day.status]}`}
                />
                {day.label}
              </span>
            ))}
          </div>
          <span className="text-16 font-semibold">{row.lead}</span>
          <span
            className={`text-16 font-semibold ${row.sunlight ? "text-ink" : "text-gray-ink"}`}
          >
            {row.sunlight ?? "자료 없음"}
          </span>
        </Link>
      ))}
      <div className="text-13 text-ink-2/80 flex flex-wrap gap-4 px-3 pt-3.5 pb-1.5">
        {WATER_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`h-2 w-4 rounded-full ${STATUS_DOT[status]}`} />
            {WATER_STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </section>
  );
}
