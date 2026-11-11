import Link from "next/link";

import {
  CROP_LABEL,
  withSelection,
  type Crop,
  type SoilCode,
} from "@/domain/selection";
import { SOIL_WATER_LABEL, SOIL_WATER_STATUSES } from "@/domain/soil-water";
import { FILLED_COPY } from "@/domain/water-outlook";
import { WATER_STATUSES, WATER_STATUS_LABEL } from "@/domain/water-status";
import type { HomeRow, HomeView } from "@/services/home";

import { Badge as GrayBadge } from "../ui/Badge";
import { Gauge } from "../ui/Gauge";
import { StatusBadge } from "../ui/StatusBadge";
import { STATUS_DOT } from "../ui/status";

const COLS = "grid grid-cols-(--national-cols) gap-4";

function growthDateNotice(
  heatDateNote: string | null,
  sunDateNote: string | null,
): string | null {
  if (heatDateNote && sunDateNote) {
    return heatDateNote === sunDateNote
      ? `적산온도·적산일사: ${heatDateNote}`
      : `적산온도: ${heatDateNote} · 적산일사: ${sunDateNote}`;
  }
  if (heatDateNote) return `적산온도: ${heatDateNote}`;
  if (sunDateNote) return `적산일사: ${sunDateNote}`;
  return null;
}

/** 전국 물·기상·생육 종합 표. 줄을 누르면 그 지역으로 바뀐다. 데스크톱에서만 보인다. */
export function NationalTable({
  rows,
  crop,
  soil,
  waterFilledScope,
  waterFilledNotice,
  heatDateNote,
  sunDateNote,
}: {
  rows: HomeRow[];
  crop: Crop;
  soil?: SoilCode;
  waterFilledScope: HomeView["waterFilledScope"];
  waterFilledNotice: string | null;
  heatDateNote: string | null;
  sunDateNote: string | null;
}) {
  const isCommon = crop === "common";
  const growthNotice = growthDateNotice(heatDateNote, sunDateNote);
  return (
    <section
      aria-labelledby="national-title"
      className="rounded-card bg-card desktop:flex hidden flex-col gap-1 px-6 pt-6 pb-3"
    >
      <div className="flex flex-wrap items-baseline gap-3 pb-3">
        <h2 id="national-title" className="text-22 m-0 font-bold">
          전국 물·기상·생육 종합
        </h2>
        <span className="text-15 text-ink-2/80">
          오늘 {CROP_LABEL[crop]} 기준 · 줄을 누르면 그 지역으로 바뀌어요
        </span>
      </div>
      {(waterFilledNotice || growthNotice) && (
        <div className="text-13 text-ink-2/80 flex flex-col gap-0.5 pb-2.5 leading-snug">
          {waterFilledNotice && <p className="m-0">{waterFilledNotice}</p>}
          {growthNotice && <p className="m-0">{growthNotice}</p>}
        </div>
      )}
      <div
        className={`${COLS} border-ink-2/20 text-14 text-ink-2/80 border-b-(length:--hairline) px-3 py-2.5 font-semibold`}
      >
        <span>지점</span>
        <span>오늘</span>
        {isCommon ? (
          <span>남은 물 / 담을 수 있는 물</span>
        ) : (
          <span>
            부족한 물 / 관수 시작점{" "}
            <span className="text-ink-2/60 font-normal">Dr / RAW</span>
          </span>
        )}
        <span>앞으로 3일</span>
        <span>생육 (적산온도)</span>
        <span>생육 (적산일사)</span>
      </div>
      {rows.map((row) => (
        <Link
          key={row.id}
          href={withSelection("/", { stationId: row.id, crop, soil })}
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
          {row.badge ? (
            <span className="flex flex-wrap items-center gap-1.5 justify-self-start">
              <StatusBadge badge={row.badge} />
              {waterFilledScope === "some" && row.waterFilled && (
                <span className="bg-fill/14 text-12 text-gray-ink rounded-full px-2 py-0.5 font-bold whitespace-nowrap">
                  {FILLED_COPY.rowTag}
                </span>
              )}
            </span>
          ) : (
            <GrayBadge className="justify-self-start">자료 없음</GrayBadge>
          )}
          <div className="flex items-center gap-3">
            {row.gauge ? (
              <Gauge gauge={row.gauge} size="row" className="flex-1" />
            ) : (
              <div className="bg-fill/14 h-2.5 flex-1 rounded-full" />
            )}
            <span className="text-15 w-21 text-right">{row.drText}</span>
          </div>
          <div className="flex gap-1.5">
            {!row.days && (
              <span className="text-14 text-gray-ink">
                {isCommon ? "—" : "예보 준비 중"}
              </span>
            )}
            {row.days?.map((day) => (
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
          <span
            className={`text-16 font-semibold ${row.heat ? "text-ink" : "text-gray-ink"}`}
          >
            {row.heat ?? "자료 없음"}
            {row.heatDateTag && (
              <span className="text-13 text-ink-2/70 ml-1 font-normal tabular-nums">
                ({row.heatDateTag})
              </span>
            )}
          </span>
          <span
            className={`text-16 font-semibold ${row.sunlight ? "text-ink" : "text-gray-ink"}`}
          >
            {row.sunlight ?? "자료 없음"}
            {row.sunDateTag && (
              <span className="text-13 text-ink-2/70 ml-1 font-normal tabular-nums">
                ({row.sunDateTag})
              </span>
            )}
          </span>
        </Link>
      ))}
      <div className="text-13 text-ink-2/80 flex flex-wrap gap-4 px-3 pt-3.5 pb-1.5">
        {isCommon
          ? SOIL_WATER_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-4 rounded-full ${STATUS_DOT[status]}`}
                />
                {SOIL_WATER_LABEL[status]}
              </span>
            ))
          : WATER_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-4 rounded-full ${STATUS_DOT[status]}`}
                />
                {WATER_STATUS_LABEL[status]}
              </span>
            ))}
      </div>
    </section>
  );
}
