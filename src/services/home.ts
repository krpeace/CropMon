import type { Selection } from "@/domain/selection";
import {
  todayBadge,
  type StatusBadge,
  type WaterStatus,
} from "@/domain/water-status";
import { MOCK_HOME, type MockHome } from "@/mocks/home";
import { STATIONS } from "@/infra/stations";

/**
 * 종합 화면에 필요한 값을 화면용 문구로 정리한다.
 * 지금은 src/mocks 의 예시 값을 읽는다. Supabase 로 바꿀 때는 이 파일만 고친다.
 */

export type Gauge = { status: WaterStatus; fillPct: number; rawPct: number };

export type HomeView = {
  water: {
    verdict: string;
    tone: WaterStatus;
    badge: StatusBadge;
    /** 숫자 줄. 작기가 아니면 안내 문구. */
    numbers: string;
    gauge: Gauge | null;
  };
  growth: { verdict: string; numbers: string };
  sunlight: { verdict: string; numbers: string; missing: boolean };
  rows: HomeRow[];
};

export type HomeRow = {
  id: number;
  name: string;
  selected: boolean;
  badge: StatusBadge;
  gauge: Gauge | null;
  drText: string;
  days: { label: string; status: WaterStatus }[];
  lead: string;
  /** 평년 대비 %. 일사를 재지 않으면 null. */
  sunlight: string | null;
};

/** 게이지가 너무 짧아 안 보이지 않게 하는 최소 길이(%). 시안 그대로. */
const MIN_FILL_PCT = 2;

const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");
const mm = (v: number) => Math.round(v);

function homeOf(stationId: number): MockHome {
  return MOCK_HOME.find((h) => h.stationId === stationId) ?? MOCK_HOME[0];
}

function gauge(water: MockHome["water"]["apple"]): Gauge | null {
  if (water.drMm == null) return null;
  return {
    status: water.status,
    fillPct: Math.max(MIN_FILL_PCT, (water.drMm / water.tawMm) * 100),
    rawPct: (water.rawMm / water.tawMm) * 100,
  };
}

/** "2026-08-13" → "8/13" */
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

export function getHomeView(selection: Selection): HomeView {
  const { crop } = selection;
  const home = homeOf(selection.stationId);
  const station = STATIONS.find((s) => s.id === home.stationId);
  const w = home.water[crop];

  const rows = STATIONS.map((s): HomeRow => {
    const h = homeOf(s.id);
    const rw = h.water[crop];
    return {
      id: s.id,
      name: s.name,
      selected: s.id === home.stationId,
      badge: todayBadge(rw.status, rw.forecast[0].status, "short"),
      gauge: gauge(rw),
      drText: rw.drMm == null ? "—" : `${mm(rw.drMm)} / ${mm(rw.rawMm)} mm`,
      days: rw.forecast.map((f) => ({
        label: shortDate(f.date),
        status: f.status,
      })),
      lead: leadShort(h.leadDays),
      sunlight: h.sunlight ? `${h.sunlight.percentOfNormal}%` : null,
    };
  });

  return {
    water: {
      verdict: w.verdict.text,
      tone: w.verdict.tone,
      badge: todayBadge(w.status, w.forecast[0].status),
      numbers:
        w.drMm == null
          ? (w.note ?? "")
          : `부족한 물 ${mm(w.drMm)} mm / 관수 시작점 ${mm(w.rawMm)} mm`,
      gauge: gauge(w),
    },
    growth: {
      verdict: leadLong(home.leadDays),
      numbers: `적산온도 ${nf(home.gdd.thisYear)} / 평년 ${nf(home.gdd.normal)} ℃·일`,
    },
    sunlight: home.sunlight
      ? {
          verdict: `올해 햇빛은 평년의 ${home.sunlight.percentOfNormal}%`,
          numbers: `적산일사 ${nf(home.sunlight.thisYear)} / 평년 ${nf(home.sunlight.normal)} MJ/m²`,
          missing: false,
        }
      : {
          verdict: "자료 없음",
          numbers: `${station?.name ?? ""} 관측소는 햇빛(일사)을 재지 않아요`,
          missing: true,
        },
    rows,
  };
}
