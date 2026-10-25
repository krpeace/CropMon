import { koreanClock } from "@/domain/datetime";
import type { Selection } from "@/domain/selection";
import { koreanDate, observedBasis } from "@/domain/water-outlook";
import {
  todayBadge,
  type StatusBadge,
  type WaterStatus,
} from "@/domain/water-status";
import { waterVerdict } from "@/domain/water-verdict";
import { STATIONS } from "@/infra/stations";
import { MOCK_HOME, type MockHome } from "@/mocks/home";

import type { StationBoard, StationWater } from "./station-status";

/**
 * 종합 화면에 필요한 값을 화면용 문구로 정리한다 (결정 0011).
 * 물 판정은 DB(지점 판정 표), 온도·햇빛은 아직 DB 에 없어 시안 예시 값을 "예시" 표시와 함께 쓴다.
 */

export type Gauge = { status: WaterStatus; fillPct: number; rawPct: number };

export type HomeView = {
  /** 첫 줄 아래 "갱신 · 지점 · 자료" 한 줄. */
  meta: string;
  water: {
    verdict: string;
    tone: WaterStatus;
    /** 판정 배지. 자료가 없으면 null 이고 grayBadge 를 쓴다. */
    badge: StatusBadge | null;
    grayBadge: string | null;
    /** 숫자 줄. 작기가 아니면 안내 문구. */
    numbers: string;
    gauge: Gauge | null;
  };
  growth: { verdict: string; numbers: string; example: true };
  sunlight: {
    verdict: string;
    numbers: string;
    missing: boolean;
    example: boolean;
  };
  rows: HomeRow[];
};

export type HomeRow = {
  id: number;
  name: string;
  selected: boolean;
  /** 자료가 없으면 null ("자료 없음"). */
  badge: StatusBadge | null;
  gauge: Gauge | null;
  drText: string;
  /** 앞으로 3일. 예보가 없는 지점은 null ("예보 준비 중"). */
  days: { label: string; status: WaterStatus }[] | null;
  /** 생육 (예시 값). */
  lead: string;
  /** 평년 대비 % (예시 값). 일사를 재지 않으면 null. */
  sunlight: string | null;
};

/** 게이지가 너무 짧아 안 보이지 않게 하는 최소 길이(%). 시안 그대로. */
const MIN_FILL_PCT = 2;
const NO_DATA = "자료 없음";

const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");
const mm = (v: number) => Math.round(v);

function mockOf(stationId: number): MockHome {
  return MOCK_HOME.find((h) => h.stationId === stationId) ?? MOCK_HOME[0];
}

function gauge(w: StationWater): Gauge | null {
  if (w.drMm == null || w.status === "dormant" || w.tawMm <= 0) return null;
  return {
    status: w.status,
    fillPct: Math.max(MIN_FILL_PCT, (w.drMm / w.tawMm) * 100),
    rawPct: (w.rawMm / w.tawMm) * 100,
  };
}

/** "2026-10-26" → "10/26" */
function shortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function leadLong(days: number) {
  if (days > 0) return `평년보다 생육 ${days}일 빠름`;
  if (days < 0) return `평년보다 생육 ${-days}일 늦음`;
  return "생육이 평년과 비슷해요";
}

function leadShort(days: number) {
  if (days > 0) return `${days}일 빠름`;
  if (days < 0) return `${-days}일 늦음`;
  return "비슷";
}

function tomorrowStatus(w: StationWater, today: string): WaterStatus {
  const t = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return w.forecast?.days.find((d) => d.date === t)?.status ?? w.status;
}

function waterCard(
  w: StationWater | null,
  selection: Selection,
  today: string,
  ok: boolean,
): HomeView["water"] {
  if (!w) {
    return {
      verdict: NO_DATA,
      tone: "dormant",
      badge: null,
      grayBadge: NO_DATA,
      numbers: ok
        ? "이 지역의 물 판정 자료가 아직 없어요"
        : "DB에서 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
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
  now: () => Date = () => new Date(),
): HomeView {
  const today = koreanDate(now().toISOString());
  const { crop } = selection;
  const station =
    STATIONS.find((s) => s.id === selection.stationId) ?? STATIONS[0];
  const mock = mockOf(station.id);

  const rows = STATIONS.map((s): HomeRow => {
    const w = board.water[crop][s.id];
    const m = mockOf(s.id);
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
      lead: leadShort(m.leadDays),
      sunlight: m.sunlight ? `${m.sunlight.percentOfNormal}%` : null,
    };
  });

  return {
    meta: metaLine(board, station),
    water: waterCard(board.water[crop][station.id], selection, today, board.ok),
    growth: {
      verdict: leadLong(mock.leadDays),
      numbers: `적산온도 ${nf(mock.gdd.thisYear)} / 평년 ${nf(mock.gdd.normal)} ℃·일`,
      example: true,
    },
    sunlight: mock.sunlight
      ? {
          verdict: `올해 햇빛은 평년의 ${mock.sunlight.percentOfNormal}%`,
          numbers: `적산일사 ${nf(mock.sunlight.thisYear)} / 평년 ${nf(mock.sunlight.normal)} MJ/m²`,
          missing: false,
          example: true,
        }
      : {
          verdict: NO_DATA,
          numbers: `${station.name} 관측소는 햇빛(일사)을 재지 않아요`,
          missing: true,
          example: false,
        },
    rows,
  };
}
