import { describe, expect, it, vi } from "vitest";

import type { Selection } from "@/domain/selection";
import { OBSERVED_DATE_COPY, type WaterQuery } from "@/domain/water-outlook";
import type { Station } from "@/services/shell";
import * as sunlightService from "@/services/sunlight";
import * as temperatureService from "@/services/temperature";
import * as waterService from "@/services/water";

import {
  fetchSunlight,
  fetchTemperature,
  fetchWater,
  loadSunlight,
  loadTemperature,
  loadWater,
} from "./detail-cache";

// Next.js 빌트인 모듈 모킹 (단위 테스트 환경)
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
}));

vi.mock("./board", () => ({
  fetchHomeHeat: vi.fn(async () => ({
    101: { date: "2026-11-08", cum: 3000, normal: 2900 },
    216: { date: "2026-11-08", cum: 2800, normal: 2750 },
    119: { date: "2026-11-06", cum: 2950, normal: 2900 },
  })),
  fetchHomeSun: vi.fn(async () => ({
    101: { date: "2026-11-08", cum: 4500, normal: 4400 },
    216: { date: "2026-11-08", cum: 4300, normal: 4200 },
    119: { date: "2026-11-06", cum: 4100, normal: 4200 },
  })),
}));

const mockStation: Station = {
  id: 101,
  name: "춘천",
  sido: "강원",
  isRepresentative: true,
  measuresSunlight: true,
};

const mockSelection: Selection = {
  stationId: 101,
  crop: "apple",
};

const mockWaterQuery: WaterQuery = {
  date: null,
  run: null,
};

describe("상세 화면 캐시 안전성 및 실패 캐시 방지 (#81)", () => {
  describe("Water 화면 (fetchWater & loadWater)", () => {
    it("DB 읽기 성공 시 물 화면 뷰를 정상 반환한다", async () => {
      const mockView = {
        meta: {
          source: "test",
          issue: "02시",
          updated: "02:00",
          short: "02시",
        },
        problem: null,
      } as unknown as waterService.WaterView;

      vi.spyOn(waterService, "getWaterView").mockResolvedValueOnce(mockView);

      const result = await fetchWater(
        mockSelection,
        mockStation,
        mockWaterQuery,
        "2026-11-09",
      );
      expect(result).toBe(mockView);
      expect(result.problem).toBeNull();
    });

    it("DB 읽기 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다", async () => {
      const failedView = {
        problem: "물 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as waterService.WaterView;

      vi.spyOn(waterService, "getWaterView").mockResolvedValueOnce(failedView);

      await expect(
        fetchWater(mockSelection, mockStation, mockWaterQuery, "2026-11-09"),
      ).rejects.toThrow("[water] DB 읽기 실패");
    });

    it("18:00 KST에 요청하면 오늘 17시 회차를 쓴다 (물 화면)", async () => {
      const kst1800 = new Date("2026-11-09T18:00:00+09:00");
      let capturedDeps: { now?: () => Date } | undefined;

      vi.spyOn(waterService, "getWaterView").mockImplementationOnce(
        async (_sel, _stn, _q, deps) => {
          capturedDeps = deps;
          return {
            meta: {
              source: "test",
              issue: "11월 9일 17시 단기예보",
              updated: "11월 9일 17:41",
              short: "17시 예보 · 17:41 갱신",
            },
            outlook: {
              basis: "17시 예보 기준",
              runs: [
                { hour: "02", available: true, selected: false },
                { hour: "17", available: true, selected: true },
              ],
              need: null,
              advice: null,
              days: [],
            },
            problem: null,
            failed: false,
          } as unknown as waterService.WaterView;
        },
      );

      const result = await fetchWater(
        mockSelection,
        mockStation,
        mockWaterQuery,
        "2026-11-09",
        { now: () => kst1800 },
      );

      // fetchWater가 now를 오늘 00:00으로 덮어쓰지 않고 실제 시각(18:00 KST)을 그대로 전달했는지 검증
      expect(capturedDeps?.now?.()).toEqual(kst1800);
      expect(result.outlook?.basis).toBe("17시 예보 기준");
      expect(result.outlook?.runs.find((r) => r.hour === "17")?.selected).toBe(
        true,
      );
    });

    it("정상적인 자료 없음(계산 조건 없음)은 에러가 아니므로 정상 반환되어 캐시된다", async () => {
      const normalNoDataView = {
        problem: "이 지역·작물의 2026 계산 조건이 아직 없어요.",
        failed: false,
      } as unknown as waterService.WaterView;

      vi.spyOn(waterService, "getWaterView").mockResolvedValueOnce(
        normalNoDataView,
      );

      const result = await fetchWater(
        mockSelection,
        mockStation,
        mockWaterQuery,
        "2026-11-09",
      );
      expect(result.problem).toBe(
        "이 지역·작물의 2026 계산 조건이 아직 없어요.",
      );
      expect(result.failed).toBe(false);
    });

    it("loadWater: 캐시 함수가 에러를 던져도 폴백 뷰를 반환하여 크래시되지 않는다", async () => {
      vi.spyOn(waterService, "getWaterView").mockResolvedValueOnce({
        problem: "물 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as waterService.WaterView);

      const result = await loadWater(
        mockSelection,
        mockStation,
        mockWaterQuery,
        "2026-11-09",
      );
      expect(result.problem).toBe(
        "물 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
      );
      expect(result.failed).toBe(true);
      expect(result.meta.issue).toBe("자료 없음");
    });
  });

  describe("Temperature 화면 (fetchTemperature & loadTemperature)", () => {
    it("DB 읽기 성공 시 온도 화면 뷰를 정상 반환한다", async () => {
      const mockView = {
        status: "normal",
        diffCelsius: 1.2,
        problem: null,
      } as unknown as temperatureService.TemperatureView;

      vi.spyOn(temperatureService, "getTemperatureView").mockResolvedValueOnce(
        mockView,
      );

      const result = await fetchTemperature(
        mockSelection,
        mockStation,
        "2026-11-09",
      );
      expect(result).toBe(mockView);
      expect(result.problem).toBeNull();
    });

    it("DB 읽기 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다", async () => {
      const failedView = {
        problem: "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as temperatureService.TemperatureView;

      vi.spyOn(temperatureService, "getTemperatureView").mockResolvedValueOnce(
        failedView,
      );

      await expect(
        fetchTemperature(mockSelection, mockStation, "2026-11-09"),
      ).rejects.toThrow("[temperature] DB 읽기 실패");
    });

    it("정상적인 자료 없음(적산온도 미계산)은 에러가 아니므로 정상 반환되어 캐시된다", async () => {
      const normalNoDataView = {
        problem: "이 지역·작물의 2026 적산온도가 아직 없어요.",
      } as unknown as temperatureService.TemperatureView;

      vi.spyOn(temperatureService, "getTemperatureView").mockResolvedValueOnce(
        normalNoDataView,
      );

      const result = await fetchTemperature(
        mockSelection,
        mockStation,
        "2026-11-09",
      );
      expect(result.problem).toBe(
        "이 지역·작물의 2026 적산온도가 아직 없어요.",
      );
    });

    it("loadTemperature: 캐시 함수가 에러를 던져도 폴백 뷰를 반환하여 크래시되지 않는다", async () => {
      vi.spyOn(temperatureService, "getTemperatureView").mockResolvedValueOnce({
        problem: "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as temperatureService.TemperatureView);

      const result = await loadTemperature(
        mockSelection,
        mockStation,
        "2026-11-09",
      );
      expect(result.problem).toBe(
        "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
      );
      expect(result.failed).toBe(true);
      expect(result.verdict).toBe("자료 없음");
      expect(result.today).toBe("2026-11-09");
      // 결정 0017: 단일 지점 읽기가 실패해도 지역 비교 10곳은 보여 줌
      expect(result.compare).toHaveLength(10);
      expect(result.compare.find((c) => c.id === 101)?.selected).toBe(true);
      expect(result.compareNote).toBe(
        `${OBSERVED_DATE_COPY.yesterdayValue} ${OBSERVED_DATE_COPY.mixedSuffix}`,
      );
      expect(result.compare.find((c) => c.id === 101)?.dateTag).toBeNull();
      expect(result.compare.find((c) => c.id === 119)?.dateTag).toBe("11/6");
    });
  });

  describe("Sunlight 화면 (fetchSunlight & loadSunlight)", () => {
    it("DB 읽기 성공 시 햇빛 화면 뷰를 정상 반환한다", async () => {
      const mockView = {
        kind: "data",
        totalMjm2: 4500,
        problem: null,
      } as unknown as sunlightService.SunlightView;

      vi.spyOn(sunlightService, "getSunlightView").mockResolvedValueOnce(
        mockView,
      );

      const result = await fetchSunlight(
        mockSelection,
        mockStation,
        "2026-11-09",
      );
      expect(result).toBe(mockView);
      expect(result.problem).toBeNull();
    });

    it("센서 없는 지점의 정상 '자료 없음'(notMeasured)은 에러를 던지지 않고 정상 캐시된다", async () => {
      const notMeasuredView = {
        kind: "notMeasured",
        problem: null,
      } as unknown as sunlightService.SunlightView;

      vi.spyOn(sunlightService, "getSunlightView").mockResolvedValueOnce(
        notMeasuredView,
      );

      // 태백 등 일사 미관측 지점
      const taebaekStation: Station = {
        id: 216,
        name: "태백",
        sido: "강원",
        isRepresentative: true,
        measuresSunlight: false,
      };

      const result = await fetchSunlight(
        mockSelection,
        taebaekStation,
        "2026-11-09",
      );
      expect(result.kind).toBe("notMeasured");
      expect(result.problem).toBeNull();
    });

    it("DB 읽기 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다", async () => {
      const failedView = {
        problem: "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as sunlightService.SunlightView;

      vi.spyOn(sunlightService, "getSunlightView").mockResolvedValueOnce(
        failedView,
      );

      await expect(
        fetchSunlight(mockSelection, mockStation, "2026-11-09"),
      ).rejects.toThrow("[sunlight] DB 읽기 실패");
    });

    it("loadSunlight: 캐시 함수가 에러를 던져도 폴백 뷰를 반환하여 크래시되지 않는다", async () => {
      vi.spyOn(sunlightService, "getSunlightView").mockResolvedValueOnce({
        problem: "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
        failed: true,
      } as unknown as sunlightService.SunlightView);

      const result = await loadSunlight(
        mockSelection,
        mockStation,
        "2026-11-09",
      );
      expect(result.problem).toBe(
        "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
      );
      expect(result.failed).toBe(true);
      expect(result.kind).toBe("error");
      expect(result.verdict).toBe("자료 없음");
      expect(result.today).toBe("2026-11-09");
      // 결정 0017: 단일 지점 읽기가 실패해도 지역 비교 10곳은 보여 줌
      expect(result.compare).toHaveLength(10);
      expect(result.compare.find((c) => c.id === 101)?.selected).toBe(true);
      expect(result.compareNote).toBe(
        `${OBSERVED_DATE_COPY.yesterdayValue} ${OBSERVED_DATE_COPY.mixedSuffix}`,
      );
      expect(result.compare.find((c) => c.id === 101)?.dateTag).toBeNull();
      expect(result.compare.find((c) => c.id === 119)?.dateTag).toBe("11/6");
    });
  });

  describe("Next.js SWR 캐시 라이프사이클 시뮬레이션 검증 (상세 화면 공통)", () => {
    it("1. 첫 읽기 실패 시: Error throw로 캐시되지 않고 다음 요청에서 다시 읽는다", async () => {
      let callCount = 0;
      const fakeFetchDetail = async (today: string) => {
        void today;
        callCount++;
        if (callCount === 1) {
          throw new Error("첫 요청 DB 일시 장애");
        }
        return { ok: true, data: "정상 상세 데이터", today };
      };

      // Next.js 'use cache' 컨테이너 시뮬레이터
      let cachedValue: { ok: boolean; data: string; today: string } | null =
        null;
      const getCached = async (today: string) => {
        if (cachedValue) return cachedValue;
        // 실패 시 에러가 밖으로 던져지며 cachedValue에 할당되지 않음 (미캐시)
        cachedValue = await fakeFetchDetail(today);
        return cachedValue;
      };

      // 1회차 요청: 실패
      await expect(getCached("2026-11-09")).rejects.toThrow(
        "첫 요청 DB 일시 장애",
      );
      expect(cachedValue).toBeNull(); // 캐시 안 됨

      // 2회차 요청: 다시 읽어 성공
      const secondResult = await getCached("2026-11-09");
      expect(secondResult).toEqual({
        ok: true,
        data: "정상 상세 데이터",
        today: "2026-11-09",
      });
      expect(callCount).toBe(2);
      expect(cachedValue).toEqual({
        ok: true,
        data: "정상 상세 데이터",
        today: "2026-11-09",
      });
    });

    it("2. 정상 값이 캐시된 뒤 백그라운드 갱신이 실패하면: 직전 정상 값(stale)을 계속 보여 준다", async () => {
      let fetchCount = 0;
      const mockDb = async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return { ok: true, version: 1 };
        }
        // 백그라운드 재검증 시 일시 DB 장애
        throw new Error("백그라운드 갱신 DB 실패");
      };

      // Next.js SWR 시뮬레이터
      let cacheEntry: {
        data: { ok: boolean; version: number };
        staleAt: number;
      } | null = null;

      const swrRequest = async (currentTime: number) => {
        if (!cacheEntry) {
          const data = await mockDb();
          cacheEntry = { data, staleAt: currentTime + 1800 };
          return data;
        }

        // 캐시 만료(stale) 상태인 경우 백그라운드 재검증 시도
        if (currentTime > cacheEntry.staleAt) {
          try {
            const fresh = await mockDb();
            cacheEntry = { data: fresh, staleAt: currentTime + 1800 };
          } catch {
            // 백그라운드 갱신 실패 시 기존 stale 데이터를 유지 (expire=86400 이전까지 서빙)
          }
        }
        return cacheEntry.data;
      };

      // 1) 첫 번째 요청: t=0, 정상 캐시 채움
      const initial = await swrRequest(0);
      expect(initial).toEqual({ ok: true, version: 1 });
      expect(fetchCount).toBe(1);

      // 2) 30분 이내 재요청: t=1000, 캐시 히트 (DB 호출 없음)
      const cached = await swrRequest(1000);
      expect(cached).toEqual({ ok: true, version: 1 });
      expect(fetchCount).toBe(1);

      // 3) 30분 초과 재요청: t=2000 (stale), 백그라운드 갱신 시도했으나 실패
      //    결과: 이전 정상 값(version 1)을 계속 서빙
      const staleServed = await swrRequest(2000);
      expect(staleServed).toEqual({ ok: true, version: 1 });
      expect(fetchCount).toBe(2); // 백그라운드 호출은 시도됨

      // 4) 이후에도 이전 정상 값 유지
      const stillStale = await swrRequest(2500);
      expect(stillStale).toEqual({ ok: true, version: 1 });
    });
  });
});
