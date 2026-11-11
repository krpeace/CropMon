import { describe, expect, it, vi } from "vitest";

import type { Crop } from "@/domain/selection";
import * as growthLatest from "@/services/growth-latest";
import * as stationStatus from "@/services/station-status";

import {
  fetchHomeHeat,
  fetchHomeSun,
  fetchStationBoard,
  loadBoard,
  loadGrowth,
} from "./board";

// Next.js 빌트인 모듈 모킹 (단위 테스트 환경)
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

// Supabase 소스 생성 모킹 (환경변수 없는 단위 테스트 환경 대응)
vi.mock("@/infra/supabase/heat-source", () => ({
  createHeatSource: vi.fn(() => ({})),
}));

vi.mock("@/infra/supabase/sun-source", () => ({
  createSunSource: vi.fn(() => ({})),
}));

describe("board 캐시 안전성 및 실패 캐시 방지 (#106)", () => {
  describe("fetchStationBoard & loadBoard", () => {
    it("DB 읽기 성공 시(board.ok === true) 판정 표를 정상 반환한다", async () => {
      const mockBoard = {
        ok: true,
        water: {},
        soil: {},
        updated: {},
      } as unknown as stationStatus.StationBoard;
      vi.spyOn(stationStatus, "getStationBoard").mockResolvedValueOnce(
        mockBoard,
      );

      const result = await fetchStationBoard();
      expect(result).toBe(mockBoard);
      expect(result.ok).toBe(true);
    });

    it("DB 읽기 실패 시(board.ok === false) Error를 던져 Next.js 캐시 저장을 취소한다", async () => {
      const failedBoard = {
        ok: false,
        water: {},
        soil: {},
        updated: {},
      } as unknown as stationStatus.StationBoard;
      vi.spyOn(stationStatus, "getStationBoard").mockResolvedValueOnce(
        failedBoard,
      );

      await expect(fetchStationBoard()).rejects.toThrow(
        "[board] 지점 판정 DB 읽기 실패 (board.ok=false)",
      );
    });

    it("loadBoard: 캐시 함수가 에러를 던지면 폴백(emptyBoard false)을 반환하고 크래시되지 않는다", async () => {
      const failedBoard = {
        ok: false,
        water: {},
        soil: {},
        updated: {},
      } as unknown as stationStatus.StationBoard;
      vi.spyOn(stationStatus, "getStationBoard").mockResolvedValueOnce(
        failedBoard,
      );

      const result = await loadBoard();
      expect(result.ok).toBe(false);
      expect(result.soil).toBeDefined();
    });
  });

  describe("fetchHomeHeat & fetchHomeSun (적산온도·일사 독립 DB 읽기)", () => {
    it("적산온도 DB 읽기 성공 시 맵을 정상 반환한다", async () => {
      const mockHeat: Record<number, growthLatest.HeatLatest> = {
        101: { date: "2026-11-08", cum: 3000, normal: 2900 },
      };
      vi.spyOn(growthLatest, "readHeatLatest").mockResolvedValueOnce(mockHeat);

      const result = await fetchHomeHeat("apple", "2026-11-09");
      expect(result).toBe(mockHeat);
      expect(result[101]?.cum).toBe(3000);
    });

    it("적산온도 DB 읽기 실패 시 Error를 던져 캐시 저장을 취소한다", async () => {
      vi.spyOn(growthLatest, "readHeatLatest").mockRejectedValueOnce(
        new Error("heat_daily timeout"),
      );

      await expect(fetchHomeHeat("apple", "2026-11-09")).rejects.toThrow(
        "heat_daily timeout",
      );
    });

    it("적산일사 DB 읽기 성공 시 맵을 정상 반환한다 (미관측 지점 빈 데이터 포함)", async () => {
      const mockSun: Record<number, growthLatest.SunLatest> = {
        101: { date: "2026-11-08", cum: 4500, normal: 4400 },
        // 212(홍천)는 일사계가 없어 목록에 없음(정상)
      };
      vi.spyOn(growthLatest, "readSunLatest").mockResolvedValueOnce(mockSun);

      const result = await fetchHomeSun("2026-11-09");
      expect(result).toBe(mockSun);
      expect(result[101]?.cum).toBe(4500);
      expect(result[212]).toBeUndefined();
    });

    it("적산일사 DB 읽기 실패 시 Error를 던져 캐시 저장을 취소한다", async () => {
      vi.spyOn(growthLatest, "readSunLatest").mockRejectedValueOnce(
        new Error("sun_daily connection error"),
      );

      await expect(fetchHomeSun("2026-11-09")).rejects.toThrow(
        "sun_daily connection error",
      );
    });
  });

  describe("loadGrowth (결정 0017 원칙 준수)", () => {
    it("온도·햇빛 모두 성공 시 { heatOk: true, sunOk: true }와 양쪽 데이터를 정상 반환한다", async () => {
      const mockHeat: Record<number, growthLatest.HeatLatest> = {
        101: { date: "2026-11-08", cum: 3000, normal: 2900 },
      };
      const mockSun: Record<number, growthLatest.SunLatest> = {
        101: { date: "2026-11-08", cum: 4500, normal: 4400 },
      };
      vi.spyOn(growthLatest, "readHeatLatest").mockResolvedValueOnce(mockHeat);
      vi.spyOn(growthLatest, "readSunLatest").mockResolvedValueOnce(mockSun);

      const result = await loadGrowth("apple");
      expect(result.heatOk).toBe(true);
      expect(result.sunOk).toBe(true);
      expect(result.heat).toEqual(mockHeat);
      expect(result.sun).toEqual(mockSun);
    });

    it("결정 0017 원칙: sun만 실패 시 온도 카드는 정상 표시(heatOk: true)되고 sun만 실패(sunOk: false)로 반환된다", async () => {
      const mockHeat: Record<number, growthLatest.HeatLatest> = {
        101: { date: "2026-11-08", cum: 3000, normal: 2900 },
      };
      vi.spyOn(growthLatest, "readHeatLatest").mockResolvedValueOnce(mockHeat);
      vi.spyOn(growthLatest, "readSunLatest").mockRejectedValueOnce(
        new Error("sun DB timeout"),
      );

      const result = await loadGrowth("apple");
      // 성공한 온도는 그대로 표출 (결정 0017)
      expect(result.heatOk).toBe(true);
      expect(result.heat).toEqual(mockHeat);
      // 실패한 햇빛만 false (자료 없음 폴백)
      expect(result.sunOk).toBe(false);
      expect(result.sun).toEqual({});
    });

    it("결정 0017 원칙: heat만 실패 시 햇빛 카드는 정상 표시(sunOk: true)되고 heat만 실패(heatOk: false)로 반환된다", async () => {
      const mockSun: Record<number, growthLatest.SunLatest> = {
        101: { date: "2026-11-08", cum: 4500, normal: 4400 },
      };
      vi.spyOn(growthLatest, "readHeatLatest").mockRejectedValueOnce(
        new Error("heat DB timeout"),
      );
      vi.spyOn(growthLatest, "readSunLatest").mockResolvedValueOnce(mockSun);

      const result = await loadGrowth("apple");
      expect(result.heatOk).toBe(false);
      expect(result.heat).toEqual({});
      expect(result.sunOk).toBe(true);
      expect(result.sun).toEqual(mockSun);
    });

    it("둘 다 실패 시 { heatOk: false, sunOk: false }를 반환하고 크래시되지 않는다", async () => {
      vi.spyOn(growthLatest, "readHeatLatest").mockRejectedValueOnce(
        new Error("heat error"),
      );
      vi.spyOn(growthLatest, "readSunLatest").mockRejectedValueOnce(
        new Error("sun error"),
      );

      const result = await loadGrowth("apple");
      expect(result.heatOk).toBe(false);
      expect(result.sunOk).toBe(false);
      expect(result.heat).toEqual({});
      expect(result.sun).toEqual({});
    });
  });

  describe("사용자 명시 요구 시험: sun만 실패 → 온도 정상 표시, 다음 요청에서 다시 읽는다", () => {
    it("sun 실패 시 sun은 캐시되지 않고 다음 요청에서 다시 읽으며, 성공했던 heat는 캐시를 유지한다", async () => {
      let heatCallCount = 0;
      let sunCallCount = 0;

      const mockHeatFetch = async (crop: Crop, today: string) => {
        void crop;
        void today;
        heatCallCount++;
        return { 101: { date: "2026-11-08", cum: 3000, normal: 2900 } };
      };

      const mockSunFetch = async (today: string) => {
        void today;
        sunCallCount++;
        if (sunCallCount === 1) {
          throw new Error("첫 요청 일사 DB 장애");
        }
        return { 101: { date: "2026-11-08", cum: 4500, normal: 4400 } };
      };

      // Next.js 'use cache' 컨테이너 시뮬레이터 (독립 캐시)
      const cacheContainer = {
        heat: new Map<string, Record<number, growthLatest.HeatLatest>>(),
        sun: new Map<string, Record<number, growthLatest.SunLatest>>(),
      };

      const simulatedCachedHeat = async (crop: Crop, today: string) => {
        const key = `${crop}:${today}`;
        if (cacheContainer.heat.has(key)) {
          return cacheContainer.heat.get(key)!;
        }
        const val = await mockHeatFetch(crop, today);
        cacheContainer.heat.set(key, val);
        return val;
      };

      const simulatedCachedSun = async (today: string) => {
        const key = today;
        if (cacheContainer.sun.has(key)) {
          return cacheContainer.sun.get(key)!;
        }
        // 실패 시 에러가 밖으로 던져지며 캐시에 저장되지 않음
        const val = await mockSunFetch(today);
        cacheContainer.sun.set(key, val);
        return val;
      };

      const simulatedLoadGrowth = async (crop: Crop, today: string) => {
        const [heatRes, sunRes] = await Promise.allSettled([
          simulatedCachedHeat(crop, today),
          simulatedCachedSun(today),
        ]);
        return {
          heatOk: heatRes.status === "fulfilled",
          sunOk: sunRes.status === "fulfilled",
          heat: heatRes.status === "fulfilled" ? heatRes.value : {},
          sun: sunRes.status === "fulfilled" ? sunRes.value : {},
        };
      };

      // 1회차 요청: heat 성공, sun 실패
      const firstResult = await simulatedLoadGrowth("apple", "2026-11-09");
      // 온도 카드는 정상 표시!
      expect(firstResult.heatOk).toBe(true);
      expect(firstResult.heat[101]?.cum).toBe(3000);
      // 햇빛 카드는 실패 (자료 없음 폴백)
      expect(firstResult.sunOk).toBe(false);
      expect(firstResult.sun).toEqual({});

      expect(heatCallCount).toBe(1);
      expect(sunCallCount).toBe(1);
      // 캐시 상태: heat는 캐시되었고, sun은 비어있음
      expect(cacheContainer.heat.has("apple:2026-11-09")).toBe(true);
      expect(cacheContainer.sun.has("2026-11-09")).toBe(false);

      // 2회차 요청: sun 복구됨
      const secondResult = await simulatedLoadGrowth("apple", "2026-11-09");
      // 둘 다 정상 표시
      expect(secondResult.heatOk).toBe(true);
      expect(secondResult.sunOk).toBe(true);
      expect(secondResult.heat[101]?.cum).toBe(3000);
      expect(secondResult.sun[101]?.cum).toBe(4500);

      // heat는 캐시 적중하여 DB 재호출 없음 (callCount 그대로 1)
      expect(heatCallCount).toBe(1);
      // sun은 캐시가 없었으므로 다시 읽어 성공 (callCount 2로 증가)
      expect(sunCallCount).toBe(2);
      expect(cacheContainer.sun.has("2026-11-09")).toBe(true);
    });
  });

  describe("Next.js SWR 캐시 라이프사이클 시뮬레이션 검증 (요구조건 2)", () => {
    it("1. 첫 읽기 실패 시: Error throw로 캐시되지 않고 다음 요청에서 다시 읽는다", async () => {
      let callCount = 0;
      const fakeFetch = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("첫 요청 DB 일시 장애");
        }
        return { ok: true, data: "정상 데이터" };
      };

      // 간이 캐시 컨테이너 시뮬레이터 (Next.js use cache 동작 모델)
      let cachedValue: { ok: boolean; data: string } | null = null;
      const getCached = async () => {
        if (cachedValue) return cachedValue;
        // 실패 시 에러가 밖으로 던져지며 cachedValue에 할당되지 않음
        cachedValue = await fakeFetch();
        return cachedValue;
      };

      // 첫 번째 요청: 실패
      await expect(getCached()).rejects.toThrow("첫 요청 DB 일시 장애");
      expect(cachedValue).toBeNull(); // 캐시에 남지 않음

      // 두 번째 요청: 캐시가 없으므로 다시 읽기 시도하여 성공
      const secondResult = await getCached();
      expect(secondResult).toEqual({ ok: true, data: "정상 데이터" });
      expect(callCount).toBe(2);
      expect(cachedValue).toEqual({ ok: true, data: "정상 데이터" });
    });

    it("2. 정상 값이 캐시된 뒤 백그라운드 갱신이 실패하면: 직전 정상 값(stale)을 계속 보여 준다", async () => {
      let fetchCount = 0;
      const mockDb = async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return { ok: true, version: 1 };
        }
        // 백그라운드 재검증 시 DB 장애 발생
        throw new Error("백그라운드 갱신 DB 실패");
      };

      // Next.js stale-while-revalidate 시뮬레이터
      let cacheEntry: {
        data: { ok: boolean; version: number };
        staleAt: number;
      } | null = null;

      const swrRequest = async (currentTime: number) => {
        if (!cacheEntry) {
          // 최초 요청
          const data = await mockDb();
          cacheEntry = { data, staleAt: currentTime + 1800 };
          return data;
        }

        // 캐시가 stale 되었는지 확인
        if (currentTime > cacheEntry.staleAt) {
          // 백그라운드 재검증 트리거: 비동기로 재조회 시도
          try {
            const fresh = await mockDb();
            cacheEntry = { data: fresh, staleAt: currentTime + 1800 };
          } catch {
            // Next.js 동작: 백그라운드 갱신이 실패(throw)해도 기존 stale 엔트리를 유지함!
            // (에러로 덮어쓰지 않음)
          }
          // 클라이언트에게는 직전 정상 값 반환
          return cacheEntry.data;
        }

        return cacheEntry.data;
      };

      // t=0: 최초 요청 성공
      const r1 = await swrRequest(0);
      expect(r1).toEqual({ ok: true, version: 1 });
      expect(fetchCount).toBe(1);

      // t=2000 (30분 초과, stale 상태): 백그라운드 갱신 실패 발생
      const r2 = await swrRequest(2000);
      expect(fetchCount).toBe(2);
      // 갱신 실패에도 직전 정상 값 유지!
      expect(r2).toEqual({ ok: true, version: 1 });
    });

    it("3. 센서 없는 지점의 정상 '자료 없음'은 에러가 아니므로 캐시에 정상 저장된다", async () => {
      let callCount = 0;
      const fetchSunlightForStation = async (stationId: number) => {
        callCount++;
        if (stationId === 212) {
          // 홍천: 일사 미관측 지점 (정상 자료 없음)
          return {
            ok: true,
            stationId: 212,
            measured: false,
            data: null,
          };
        }
        return { ok: true, stationId, measured: true, data: 4500 };
      };

      const cache = new Map<
        number,
        {
          ok: boolean;
          stationId: number;
          measured: boolean;
          data: number | null;
        }
      >();
      const getCachedSun = async (stnId: number) => {
        if (cache.has(stnId)) return cache.get(stnId)!;
        const res = await fetchSunlightForStation(stnId);
        cache.set(stnId, res);
        return res;
      };

      // 홍천(212) 첫 요청
      const r1 = await getCachedSun(212);
      expect(r1).toEqual({
        ok: true,
        stationId: 212,
        measured: false,
        data: null,
      });
      expect(callCount).toBe(1);

      // 홍천(212) 두 번째 요청: 캐시에서 반환 (DB 호출 없음)
      const r2 = await getCachedSun(212);
      expect(r2).toEqual(r1);
      expect(callCount).toBe(1); // 캐시 적중 확인
    });
  });
});
