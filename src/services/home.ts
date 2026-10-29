import { koreanClock } from "@/domain/datetime";
import { gddNumbers, leadVerdict } from "@/domain/heat";
import {
  DEFAULT_SOIL,
  SOIL_LABEL,
  type SoilCode,
  sunlightStatusLabel,
  type Selection,
} from "@/domain/selection";
import { SOIL_WATER_DESC, SOIL_WATER_LABEL } from "@/domain/soil-water";
import { koreanDate, observedBasis } from "@/domain/water-outlook";
import { todayBadge, type WaterStatus } from "@/domain/water-status";
import { waterVerdict } from "@/domain/water-verdict";
import { sunPercent } from "@/domain/sun";
import { STATIONS } from "@/infra/stations";

import type { HeatLatest, HomeGrowth, SunLatest } from "./growth-latest";
import type {
  AnyWaterStatus,
  SoilStationWater,
  StationBoard,
  StationWater,
} from "./station-status";

/**
 * 종합 화면에 필요한 값을 화면용 문구로 정리한다 (결정 0011).
 * 물 판정은 DB 지점 판정 표, 온도·햇빛은 DB 의 마지막 관측일 적산온도·적산일사 (결정 0011·0017).
 */

export type AnyStatusBadge = { status: AnyWaterStatus; label: string };

export type Gauge = { status: AnyWaterStatus; fillPct: number; rawPct: number };

export type HomeView = {
  /** 첫 줄 아래 "갱신 · 지점 · 자료" 한 줄. */
  meta: string;
  water: {
    verdict: string;
    tone: AnyWaterStatus;
    /** 판정 배지. 자료가 없으면 null 이고 grayBadge 를 쓴다. */
    badge: AnyStatusBadge | null;
    grayBadge: string | null;
    /** 숫자 줄. 작기가 아니면 안내 문구. */
    numbers: string;
    gauge: Gauge | null;
  };
  /** missing 이면 회색 "자료 없음" 배지. */
  growth: { verdict: string; numbers: string; missing: boolean };
  sunlight: { verdict: string; numbers: string; missing: boolean };
  rows: HomeRow[];
};

export type HomeRow = {
  id: number;
  name: string;
  selected: boolean;
  /** 자료가 없으면 null ("자료 없음"). */
  badge: AnyStatusBadge | null;
  gauge: Gauge | null;
  drText: string;
  /** 앞으로 3일. 예보가 없는 지점은 null ("예보 준비 중", 작물 공통은 "—"). */
  days: { label: string; status: WaterStatus }[] | null;
  /** 생육 (적산온도): "3일 빠름". 자료가 없으면 null ("자료 없음"). */
  lead: string | null;
  /** 생육 (적산일사): 평년 대비 "96%". 자료가 없으면 null ("자료 없음"). */
  sunlight: string | null;
  /** 막대용: 적산온도가 평년보다 앞선 날 수(빠름 +, 늦음 −). 자료가 없거나 한 해 치를 넘으면 null. */
  leadDays: number | null;
  /** 막대용: 적산일사 평년 대비 %. 자료가 없으면 null. */
  sunPct: number | null;
};

/** 게이지가 너무 짧아 안 보이지 않게 하는 최소 길이(%). 시안 그대로. */
const MIN_FILL_PCT = 2;
const NO_DATA = "자료 없음";
const DB_FAILED = "DB에서 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.";
const NON_REP_GUIDE =
  "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요";

const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");
const mm = (v: number) => Math.round(v);

function gauge(w: StationWater): Gauge | null {
  if (w.drMm == null || w.status === "dormant" || w.tawMm <= 0) return null;
  return {
    status: w.status,
    fillPct: Math.max(MIN_FILL_PCT, (w.drMm / w.tawMm) * 100),
    rawPct: (w.rawMm / w.tawMm) * 100,
  };
}

function soilGauge(sw: SoilStationWater): Gauge | null {
  if (sw.awPct == null || sw.status === "winter" || sw.tawMm <= 0) return null;
  return {
    status: sw.status,
    fillPct: Math.max(MIN_FILL_PCT, Math.min(100, sw.awPct)),
    rawPct: 60,
  };
}

/** "2026-10-26" → "10/26" */
function shortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

/** 전국 표 생육 칸. 카드와 같은 판단(leadVerdict)을 짧게. 자료가 없으면 null. */
function leadShort(h: HeatLatest | undefined): string | null {
  if (!h) return null;
  if (h.lead == null) {
    return leadVerdict(null, h.cum, h.annualNormal) === "자료 없음"
      ? null
      : "한 해 치 넘음";
  }
  if (h.lead > 0) return `${h.lead}일 빠름`;
  if (h.lead < 0) return `${-h.lead}일 늦음`;
  return "비슷";
}

function sunPct(s: SunLatest | undefined): number | null {
  return sunPercent(s?.cum ?? null, s?.normal ?? null);
}

function sunShort(s: SunLatest | undefined): string | null {
  const pct = sunPct(s);
  return pct == null ? null : `${pct}%`;
}

/** 온도 카드 (온도 화면과 같은 문구 함수). */
function growthCard(
  h: HeatLatest | undefined,
  ok: boolean,
  isRepresentative: boolean,
): HomeView["growth"] {
  const verdict = h ? leadVerdict(h.lead, h.cum, h.annualNormal) : NO_DATA;
  if (!h || verdict === NO_DATA) {
    return {
      verdict: NO_DATA,
      numbers: !ok
        ? DB_FAILED
        : isRepresentative
          ? "이 지역의 적산온도 자료가 아직 없어요"
          : NON_REP_GUIDE,
      missing: true,
    };
  }
  const n =
    h.cum != null && h.normal != null ? gddNumbers(h.cum, h.normal) : null;
  return {
    verdict,
    numbers: n ? `적산온도 ${n.thisYear} / 평년 ${n.normal} ℃·일` : "",
    missing: false,
  };
}

/** 햇빛 카드. 자료가 없으면 회색 "자료 없음". */
function sunCard(
  s: SunLatest | undefined,
  ok: boolean,
  station: { name: string; measuresSunlight: boolean | null },
): HomeView["sunlight"] {
  const pct = sunPercent(s?.cum ?? null, s?.normal ?? null);
  if (!s || pct == null || s.cum == null || s.normal == null) {
    const note =
      station.measuresSunlight === true
        ? ""
        : ` (${sunlightStatusLabel(station.measuresSunlight)})`;
    return {
      verdict: NO_DATA,
      numbers: ok
        ? `${station.name} 관측소의 햇빛 자료가 없어요${note}`
        : DB_FAILED,
      missing: true,
    };
  }
  return {
    verdict: `올해 햇빛은 평년의 ${pct}%`,
    numbers: `적산일사 ${nf(s.cum)} / 평년 ${nf(s.normal)} MJ/m²`,
    missing: false,
  };
}

function tomorrowStatus(w: StationWater, today: string): WaterStatus {
  const t = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return w.forecast?.days.find((d) => d.date === t)?.status ?? w.status;
}

function soilWaterCard(
  sw: SoilStationWater | null | undefined,
  soil: SoilCode,
  ok: boolean,
  isRepresentative: boolean,
): HomeView["water"] {
  if (!sw) {
    return {
      verdict: NO_DATA,
      tone: "dormant",
      badge: null,
      grayBadge: NO_DATA,
      numbers: !ok
        ? DB_FAILED
        : isRepresentative
          ? "이 지역의 물 판정 자료가 아직 없어요"
          : NON_REP_GUIDE,
      gauge: null,
    };
  }
  const soilLabel = SOIL_LABEL[soil];
  if (sw.status === "winter") {
    return {
      verdict: SOIL_WATER_DESC.winter,
      tone: "winter",
      badge: { status: "winter", label: SOIL_WATER_LABEL.winter },
      grayBadge: null,
      numbers: `${soilLabel} 기준`,
      gauge: null,
    };
  }
  const verdict =
    sw.awPct != null
      ? `토양 속 남은 물 ${Math.round(sw.awPct)}%`
      : SOIL_WATER_DESC[sw.status];
  const numbers =
    sw.drMm != null
      ? `${soilLabel} 기준 · 남은 물 ${mm(sw.tawMm - sw.drMm)} / 담을 수 있는 물 ${mm(sw.tawMm)} mm`
      : `${soilLabel} 기준`;
  return {
    verdict,
    tone: sw.status,
    badge: { status: sw.status, label: SOIL_WATER_LABEL[sw.status] },
    grayBadge: null,
    numbers,
    gauge: soilGauge(sw),
  };
}

function waterCard(
  w: StationWater | null | undefined,
  selection: Selection & { crop: "apple" | "cabbage" },
  today: string,
  ok: boolean,
  isRepresentative: boolean,
): HomeView["water"] {
  if (!w) {
    return {
      verdict: NO_DATA,
      tone: "dormant",
      badge: null,
      grayBadge: NO_DATA,
      numbers: !ok
        ? DB_FAILED
        : isRepresentative
          ? "이 지역의 물 판정 자료가 아직 없어요"
          : NON_REP_GUIDE,
      gauge: null,
    };
  }
  const v = waterVerdict({
    status: w.status,
    needIn: w.forecast?.needIn ?? null,
    forecast: w.forecast != null,
    past: false,
    crop: selection.crop,
    seasonStart: w.seasonStart,
    seasonEnd: w.seasonEnd,
    date: today,
  });
  let numbers = v.sub ?? "";
  if (w.status !== "dormant" && w.drMm != null) {
    numbers = `부족한 물 ${mm(w.drMm)} mm / 관수 시작점 ${mm(w.rawMm)} mm`;
    if (!w.forecast && w.observedDate) {
      numbers += ` · ${observedBasis(w.observedDate, today)}`;
    }
  }
  return {
    verdict: v.text,
    tone: v.tone,
    badge: todayBadge(w.status, tomorrowStatus(w, today)),
    grayBadge: null,
    numbers,
    gauge: gauge(w),
  };
}

function metaLine(
  board: StationBoard,
  station: { id: number; name: string },
): string {
  const asos = `기상청 ASOS ${station.name}(${station.id})`;
  const u = board.updated[station.id];
  const c = koreanClock(u?.at);
  if (!u || !c) return `${NO_DATA} · ${asos}`;
  const at = `${c.month}월 ${c.day}일 ${c.hour}:${c.minute} 갱신`;
  return u.runHour
    ? `${at} · ${asos} · ${u.runHour}시 단기예보`
    : `${at} · ${asos} · 어제까지 관측`;
}

export function getHomeView(
  selection: Selection,
  board: StationBoard,
  growth: HomeGrowth,
  now: () => Date = () => new Date(),
): HomeView {
  const today = koreanDate(now().toISOString());
  const { crop } = selection;
  const soil = selection.soil ?? DEFAULT_SOIL;
  const repStations = STATIONS.filter((s) => s.isRepresentative);
  const activeStations = STATIONS.filter((s) => s.isActive);
  const station =
    activeStations.find((s) => s.id === selection.stationId) ?? repStations[0];

  const rows = repStations.map((s): HomeRow => {
    if (crop === "common") {
      const sw = board.soil[soil][s.id];
      return {
        id: s.id,
        name: s.name,
        selected: s.id === station.id,
        badge: sw
          ? { status: sw.status, label: SOIL_WATER_LABEL[sw.status] }
          : null,
        gauge: sw ? soilGauge(sw) : null,
        drText:
          sw?.drMm == null || sw.status === "winter"
            ? "—"
            : `${mm(sw.tawMm - sw.drMm)} / ${mm(sw.tawMm)} mm`,
        days: null,
        lead: leadShort(growth.heat[s.id]),
        sunlight: sunShort(growth.sun[s.id]),
        leadDays: growth.heat[s.id]?.lead ?? null,
        sunPct: sunPct(growth.sun[s.id]),
      };
    }
    const w = board.water[crop][s.id];
    return {
      id: s.id,
      name: s.name,
      selected: s.id === station.id,
      badge: w ? todayBadge(w.status, tomorrowStatus(w, today), "short") : null,
      gauge: w ? gauge(w) : null,
      drText:
        w?.drMm == null || w.status === "dormant"
          ? "—"
          : `${mm(w.drMm)} / ${mm(w.rawMm)} mm`,
      days: w?.forecast
        ? w.forecast.days.map((d) => ({
            label: shortDate(d.date),
            status: d.status,
          }))
        : null,
      lead: leadShort(growth.heat[s.id]),
      sunlight: sunShort(growth.sun[s.id]),
      leadDays: growth.heat[s.id]?.lead ?? null,
      sunPct: sunPct(growth.sun[s.id]),
    };
  });

  const water =
    crop === "common"
      ? soilWaterCard(
          board.soil[soil][station.id],
          soil,
          board.ok,
          station.isRepresentative,
        )
      : waterCard(
          board.water[crop][station.id],
          { ...selection, crop },
          today,
          board.ok,
          station.isRepresentative,
        );

  return {
    meta: metaLine(board, station),
    water,
    growth: growthCard(
      growth.heat[station.id],
      growth.heatOk,
      station.isRepresentative,
    ),
    sunlight: sunCard(growth.sun[station.id], growth.sunOk, station),
    rows,
  };
}
