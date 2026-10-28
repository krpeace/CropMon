import { koreanClock } from "@/domain/datetime";
import { CROP_LABEL, type Crop } from "@/domain/selection";
import type { WaterStatus } from "@/domain/water-status";
import { STATIONS } from "@/infra/stations";
import { MOCK_META } from "@/mocks/meta";

/**
 * 공통 틀(헤더·쪽 제목·자료 상자)에 필요한 값을 화면용으로 정리한다.
 * 지점 판정·관측 시각은 DB 값을 받아 쓰고(station-status.ts), 내 농장 미리보기는 아직 src/mocks 예시 값이다.
 */

export type PageKey =
  "home" | "water" | "temperature" | "sunlight" | "soil" | "market" | "my-farm";

export type Station = { id: number; name: string; measuresSunlight: boolean };
/** status 가 null 이면 "자료 없음". */
export type StationChip = Station & { status: WaterStatus | null };

/** 자료·발표·갱신 세 줄과, 쪽 제목 옆 짧은 표시. */
export type PageMeta = {
  source: string;
  issue: string;
  updated: string;
  short: string;
};

const NO_DATA = "자료 없음";

const REP_STATIONS = STATIONS.filter((s) => s.isRepresentative);

export const STATION_IDS: readonly number[] = REP_STATIONS.map((s) => s.id);

function toStation(s: (typeof STATIONS)[number]): Station {
  return {
    id: s.id,
    name: s.name,
    measuresSunlight: s.measuresSunlight === true,
  };
}

export function getStation(id: number): Station | null {
  const found = REP_STATIONS.find((s) => s.id === id);
  return found ? toStation(found) : null;
}

type Statuses = Record<Crop, Partial<Record<number, WaterStatus | null>>>;

/** 지역 칩 목록. 점 색은 고른 작물의 오늘 물 판정(DB). 판정을 아직 모르면 null. */
export function listStationChips(
  crop: Crop,
  statuses: Statuses | null,
): StationChip[] {
  return REP_STATIONS.map((s) => ({
    ...toStation(s),
    status: statuses?.[crop][s.id] ?? null,
  }));
}

export type Observed = { date: string; fetchedAt: string } | null;

/** ASOS 관측을 받은 시각: "10월 25일 02:20 (10월 24일까지 관측)". */
function observedTimes(observed: Observed) {
  const c = koreanClock(observed?.fetchedAt);
  if (!observed || !c) return { updated: NO_DATA, short: NO_DATA };
  const [, m, d] = observed.date.split("-").map(Number);
  const at = `${c.month}월 ${c.day}일 ${c.hour}:${c.minute}`;
  return { updated: `${at} (${m}월 ${d}일까지 관측)`, short: `${at} 갱신` };
}

function asos(station: Station) {
  return `기상청 ASOS ${station.name}(${station.id})`;
}

function updatedShort(updated: string) {
  return `${updated} 갱신`;
}

export function getPageMeta(
  // 물 화면은 DB 값으로 따로 만든다 (src/services/water.ts)
  page: Exclude<PageKey, "home" | "water">,
  station: Station,
  /** 그 지점의 마지막 ASOS 관측 (온도·햇빛). 모르면 null. */
  observed: Observed = null,
): PageMeta {
  const { forecastIssue, updated } = MOCK_META;
  switch (page) {
    case "temperature":
      return {
        source: `${asos(station)} 일 관측`,
        issue: "해당 없음 (관측 자료)",
        ...observedTimes(observed),
      };
    case "sunlight":
      if (!station.measuresSunlight) {
        return {
          source: `${asos(station)} 일사 관측 · ${NO_DATA}`,
          issue: NO_DATA,
          updated: NO_DATA,
          short: NO_DATA,
        };
      }
      return {
        source: `${asos(station)} 일사 관측`,
        issue: "해당 없음 (관측 자료)",
        ...observedTimes(observed),
      };
    case "soil":
      return noData("농촌진흥청 흙토람");
    case "market":
      return noData("aT · KREI");
    case "my-farm": {
      const farmStation = station ?? getStation(MOCK_META.farmStationId);
      return {
        source: `${asos(farmStation)} · 내 밭 기록(CSV)`,
        issue: forecastIssue,
        updated: `${updated} (미리보기)`,
        short: updatedShort(updated),
      };
    }
  }
}

/** 토양·도매시장 "준비 중" 본문의 글 (시안 sSoon 그대로). 질문은 쪽 정보(PAGE_INFO)에서 읽는다. */
export type ComingSoon = {
  /** 열리면 보여 줄 것 4개 */
  items: string[];
  /** 쓸 자료 이름 */
  source: string;
};

export function getComingSoon(page: "soil" | "market", crop: Crop): ComingSoon {
  if (page === "soil") {
    return {
      items: [
        "우리 밭 흙의 종류(토성)와 물 빠짐",
        "산도(pH)와 유기물이 알맞은지",
        "인산·칼리 같은 양분이 넉넉한지",
        "물 판정에 내 밭 토성을 바로 반영",
      ],
      source: "농촌진흥청 흙토람 (토양 정보)",
    };
  }
  return {
    items: [
      `오늘 ${CROP_LABEL[crop]} 도매 가격`,
      "지난해·평년 같은 때와 비교",
      "도매시장에 들어온 양(반입량) 흐름",
      "앞으로의 가격 전망",
    ],
    source: "aT 농산물유통정보 · 한국농촌경제연구원(KREI) 농업관측",
  };
}

function noData(source: string): PageMeta {
  return {
    source: `${source} · ${NO_DATA}`,
    issue: NO_DATA,
    updated: NO_DATA,
    short: NO_DATA,
  };
}
