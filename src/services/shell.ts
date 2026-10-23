import type { Crop } from "@/domain/selection";
import type { WaterStatus } from "@/domain/water-status";
import { MOCK_META } from "@/mocks/meta";
import { MOCK_STATIONS } from "@/mocks/stations";

/**
 * 공통 틀(헤더·쪽 제목·자료 상자)에 필요한 값을 화면용으로 정리한다.
 * 지금은 src/mocks 의 예시 값을 읽는다. Supabase 로 바꿀 때는 이 파일만 고친다.
 */

export type PageKey =
  "home" | "water" | "temperature" | "sunlight" | "soil" | "market" | "my-farm";

export type Station = { id: number; name: string; measuresSunlight: boolean };
export type StationChip = Station & { status: WaterStatus };

/** 자료·발표·갱신 세 줄과, 쪽 제목 옆 짧은 표시. */
export type PageMeta = {
  source: string;
  issue: string;
  updated: string;
  short: string;
};

const NO_DATA = "자료 없음";

export const STATION_IDS: readonly number[] = MOCK_STATIONS.map((s) => s.id);

function toStation(s: (typeof MOCK_STATIONS)[number]): Station {
  return { id: s.id, name: s.name, measuresSunlight: s.measuresSunlight };
}

export function getStation(id: number): Station | null {
  const found = MOCK_STATIONS.find((s) => s.id === id);
  return found ? toStation(found) : null;
}

/** 지역 칩 목록. 점 색은 고른 작물의 오늘 물 판정. */
export function listStationChips(crop: Crop): StationChip[] {
  return MOCK_STATIONS.map((s) => ({
    ...toStation(s),
    status: s.todayStatus[crop],
  }));
}

function asos(station: Station) {
  return `기상청 ASOS ${station.name}(${station.id})`;
}

function updatedShort(updated: string) {
  return `${updated} 갱신`;
}

export function getHomeMeta(station: Station) {
  return `${updatedShort(MOCK_META.updated)} · ${asos(station)} · 단기예보`;
}

export function getPageMeta(
  page: Exclude<PageKey, "home">,
  station: Station,
): PageMeta {
  const { forecastIssue, forecastIssueHour, updated } = MOCK_META;
  switch (page) {
    case "water":
      return {
        source: `${asos(station)} · 단기예보 · FAO-56 물수지`,
        issue: forecastIssue,
        updated,
        short: `${forecastIssueHour}시 예보 · ${updated.slice(-5)} 갱신`,
      };
    case "temperature":
      return {
        source: `${asos(station)} 일 관측 · 평년값 1991–2020`,
        issue: `${forecastIssue} (예상선)`,
        updated,
        short: updatedShort(updated),
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
        source: `${asos(station)} 일사 관측 · 평년값 1991–2020`,
        issue: "해당 없음 (관측 자료)",
        updated: MOCK_META.sunlightUpdated,
        short: updatedShort(MOCK_META.sunlightUpdated),
      };
    case "soil":
      return noData("농촌진흥청 흙토람");
    case "market":
      return noData("aT · KREI");
    case "my-farm": {
      const farmStation = getStation(MOCK_META.farmStationId) ?? station;
      return {
        source: `${asos(farmStation)} · 내 밭 기록(CSV)`,
        issue: forecastIssue,
        updated: `${updated} (미리보기)`,
        short: updatedShort(updated),
      };
    }
  }
}

function noData(source: string): PageMeta {
  return {
    source: `${source} · ${NO_DATA}`,
    issue: NO_DATA,
    updated: NO_DATA,
    short: NO_DATA,
  };
}
