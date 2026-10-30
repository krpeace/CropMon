"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  CROP_LABEL,
  withSelection,
  type Crop,
  type SoilCode,
} from "@/domain/selection";
import { SOIL_WATER_LABEL, SOIL_WATER_STATUSES } from "@/domain/soil-water";
import {
  WATER_STATUSES,
  WATER_STATUS_LABEL,
  WATER_STATUS_SHORT,
} from "@/domain/water-status";
import type { HomeRow } from "@/services/home";

import { Badge as GrayBadge } from "../ui/Badge";
import { Gauge } from "../ui/Gauge";
import { StatusBadge } from "../ui/StatusBadge";
import { STATUS_DOT } from "../ui/status";
import {
  heatBar,
  NATIONAL_TAB_DEFAULT,
  NATIONAL_TAB_KEY,
  NATIONAL_TABS,
  parseSavedTab,
  SUN_BAR_NORMAL_LINE,
  sunBar,
  type NationalTab,
} from "./national-list";

const COLS = "grid grid-cols-[66px_86px_minmax(0,1fr)] items-center gap-2";

const TAB_LABEL: Record<NationalTab, string> = {
  water: "물",
  days: "3일",
  heat: "온도",
  sun: "햇빛",
};

const NO_DATA = "자료 없음";

/** 고른 탭은 localStorage 가 갖는다. 저장소가 막혀 있으면(사생활 보호 모드) 이번 화면 동안만 메모리에 둔다. */
const TAB_EVENT = "cropmon-national-tab-change";
let memoryTab: NationalTab | null = null;

function readTab(): NationalTab {
  if (memoryTab) return memoryTab;
  try {
    return parseSavedTab(localStorage.getItem(NATIONAL_TAB_KEY));
  } catch {
    return NATIONAL_TAB_DEFAULT;
  }
}

function saveTab(tab: NationalTab) {
  memoryTab = tab;
  try {
    localStorage.setItem(NATIONAL_TAB_KEY, tab);
  } catch {
    // 저장이 안 돼도 이번 화면은 바뀐다.
  }
  window.dispatchEvent(new Event(TAB_EVENT));
}

function subscribeTab(onChange: () => void) {
  window.addEventListener(TAB_EVENT, onChange);
  return () => window.removeEventListener(TAB_EVENT, onChange);
}

/** 전국 물·기상·생육 종합, 휴대폰 목록(1b). 지점·오늘은 늘 보이고 셋째 칸만 탭으로 바뀐다. 폭 1024 미만에서만 보인다. */
export function NationalList({
  rows,
  crop,
  soil,
}: {
  rows: HomeRow[];
  crop: Crop;
  soil?: SoilCode;
}) {
  const isCommon = crop === "common";
  const tab = useSyncExternalStore(
    subscribeTab,
    readTab,
    () => NATIONAL_TAB_DEFAULT,
  );
  const choose = saveTab;

  const dayDates = rows.find((r) => r.days)?.days?.map((d) => d.label) ?? [];

  return (
    <section
      aria-labelledby="national-list-title"
      className="rounded-card bg-card desktop:hidden flex flex-col gap-3 px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id="national-list-title" className="text-20 m-0 font-bold">
          전국 물·기상·생육 종합
        </h2>
        <span className="text-13 text-ink-2/80">
          대표 지점 10곳 · 오늘{" "}
          {isCommon ? "작물 공통(토양의 물)" : CROP_LABEL[crop]} 기준 · 줄을
          누르면 그 지역으로 바뀌어요
        </span>
      </div>

      <Legend isCommon={isCommon} />

      <div
        role="tablist"
        aria-label="보여 줄 항목"
        className="bg-fill/14 grid grid-cols-4 gap-0.5 rounded-full p-0.5"
      >
        {NATIONAL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`national-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="national-panel"
            onClick={() => choose(t)}
            className={`text-15 h-11 cursor-pointer rounded-full font-bold ${
              tab === t ? "bg-seg text-ink shadow-segment" : "text-ink-2/80"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="national-panel"
        aria-labelledby={`national-tab-${tab}`}
        className="flex flex-col"
      >
        <div
          className={`${COLS} text-12 text-ink-2/80 border-ink-2/20 border-b-(length:--hairline) px-2 py-2 font-semibold`}
        >
          <span>지점</span>
          <span>오늘</span>
          <ThirdHead tab={tab} isCommon={isCommon} dates={dayDates} />
        </div>
        {rows.map((row) => (
          <Link
            key={row.id}
            href={withSelection("/", { stationId: row.id, crop, soil })}
            scroll={false}
            aria-current={row.selected ? "true" : undefined}
            className={`${COLS} rounded-row border-ink-2/10 text-ink min-h-13 border-b-(length:--hairline) px-2 py-1.5 ${
              row.selected ? "bg-emerald/14" : ""
            }`}
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={`text-16 truncate ${row.selected ? "font-extrabold" : "font-semibold"}`}
              >
                {row.name}
              </span>
              <span className="text-12 text-ink-2/70">{row.id}</span>
            </span>
            {row.badge ? (
              <StatusBadge
                badge={row.badge}
                compact
                className="justify-self-start"
              />
            ) : (
              <GrayBadge className="justify-self-start">{NO_DATA}</GrayBadge>
            )}
            <ThirdCell row={row} tab={tab} isCommon={isCommon} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ThirdHead({
  tab,
  isCommon,
  dates,
}: {
  tab: NationalTab;
  isCommon: boolean;
  dates: string[];
}) {
  if (tab === "water") {
    return (
      <span>
        {isCommon ? "남은 물 / 담을 수 있는 물" : "부족한 물 / 관수 시작점"}
      </span>
    );
  }
  if (tab === "days") {
    if (isCommon) return <span>작물 공통은 3일 전망이 없어요</span>;
    return (
      <span className="flex gap-1">
        {["내일", "모레", "글피"].map((name, i) => (
          <span key={name} className="flex min-w-0 flex-1 flex-col text-center">
            {name}
            <span className="text-ink-2/70 font-normal">{dates[i] ?? ""}</span>
          </span>
        ))}
      </span>
    );
  }
  if (tab === "heat") return <span>생육 (적산온도 · 평년 대비)</span>;
  return <span>햇빛 (적산일사 · 평년 대비, 가운데 선 100%)</span>;
}

function ThirdCell({
  row,
  tab,
  isCommon,
}: {
  row: HomeRow;
  tab: NationalTab;
  isCommon: boolean;
}) {
  if (tab === "water") {
    if (!row.badge) return <Missing />;
    return (
      <div className="flex items-center gap-2">
        {row.gauge ? (
          <Gauge gauge={row.gauge} size="list" className="flex-1" />
        ) : (
          <div className="bg-fill/14 h-2 flex-1 rounded-full" />
        )}
        <span className="text-13 flex-none text-right font-semibold whitespace-nowrap">
          {row.drText}
        </span>
      </div>
    );
  }

  if (tab === "days") {
    if (!row.days) {
      return (
        <span className="text-13 text-gray-ink">
          {isCommon ? "—" : "예보 준비 중"}
        </span>
      );
    }
    return (
      <div className="flex gap-1">
        {row.days.map((day) => (
          <span
            key={day.label}
            title={WATER_STATUS_LABEL[day.status]}
            className="bg-tile text-12 flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full py-1 font-semibold"
          >
            <span
              aria-hidden="true"
              className={`size-2 flex-none rounded-full ${STATUS_DOT[day.status]}`}
            />
            {WATER_STATUS_SHORT[day.status]}
          </span>
        ))}
      </div>
    );
  }

  if (tab === "heat") {
    if (!row.heat) return <Missing />;
    const bar = heatBar(row.heatDiff);
    return (
      <div className="flex items-center gap-2">
        {bar ? (
          <div className="bg-fill/12 relative h-2 flex-1 rounded-full">
            <span className="bg-ink-2/40 absolute -top-0.75 -bottom-0.75 left-1/2 w-px" />
            <span
              className={`absolute inset-y-0 rounded-full ${
                bar.side === "right"
                  ? "bg-brand-ink left-1/2"
                  : "bg-ink-2/50 right-1/2"
              }`}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <span className="text-13 w-16.5 text-right font-semibold">
          {row.heat}
        </span>
      </div>
    );
  }

  if (!row.sunlight) return <Missing />;
  const width = sunBar(row.sunPct);
  return (
    <div className="flex items-center gap-2">
      <div className="bg-fill/12 relative h-2 flex-1 rounded-full">
        {width != null && (
          <span
            className="bg-brand-ink absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${width}%` }}
          />
        )}
        <span
          className="bg-ink-2/40 absolute -top-0.75 -bottom-0.75 w-px"
          style={{ left: `${SUN_BAR_NORMAL_LINE}%` }}
        />
      </div>
      <span className="text-13 w-16.5 text-right font-semibold">
        {row.sunlight}
      </span>
    </div>
  );
}

function Missing() {
  return <span className="text-13 text-gray-ink font-semibold">{NO_DATA}</span>;
}

function Legend({ isCommon }: { isCommon: boolean }) {
  const items = isCommon
    ? SOIL_WATER_STATUSES.map((st) => ({
        status: st,
        label: SOIL_WATER_LABEL[st],
      }))
    : WATER_STATUSES.map((st) => ({
        status: st,
        label: WATER_STATUS_LABEL[st],
      }));
  return (
    <div className="bg-tile text-12 text-ink-2/85 flex flex-wrap gap-x-3 gap-y-1 rounded-[12px] px-3 py-2">
      {items.map((it) => (
        <span key={it.status} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${STATUS_DOT[it.status]}`}
          />
          {it.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="border-gray-ink size-2.5 rounded-full border-[1.5px] border-dashed"
        />
        {NO_DATA}
      </span>
    </div>
  );
}
