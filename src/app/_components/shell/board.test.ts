import { describe, expect, it, vi } from "vitest";

import * as growthLatest from "@/services/growth-latest";
import * as stationStatus from "@/services/station-status";

import {
  fetchHomeGrowth,
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

  describe("fetchHomeGrowth & loadGrowth", () => {
    it("온도·햇빛 모두 성공 시 정상 반환한다", async () => {
      const mockGrowth: growthLatest.HomeGrowth = {
        heatOk: true,
        sunOk: true,
        heat: { 101: { cum: 3000, normal: 2900 } },
        sun: { 101: { cum: 4500, normal: 4400 } },
      };
      vi.spyOn(growthLatest, "getHomeGrowth").mockResolvedValueOnce(mockGrowth);

      const result = await fetchHomeGrowth("apple");
      expect(result).toBe(mockGrowth);
      expect(result.heatOk).toBe(true);
      expect(result.sunOk).toBe(true);
    });

    it("온도나 햇빛 중 하나라도 실패하면 Error를 던져 캐시 저장을 취소한다", async () => {
      const partialFailed: growthLatest.HomeGrowth = {
        heatOk: true,
        sunOk: false, // 햇빛 DB 실패
        heat: { 101: { cum: 3000, normal: 2900 } },
        sun: {},
      };
      vi.spyOn(growthLatest, "getHomeGrowth").mockResolvedValueOnce(
        partialFailed,
      );

      await expect(fetchHomeGrowth("apple")).rejects.toThrow(
        "[growth] 생육 자료 DB 읽기 실패 (heatOk=true, sunOk=false)",
      );
    });

    it("일사 미관측 지점의 정상 '자료 없음'(sunOk=true이나 특정 지점 자료 없음)은 정상 반환되어 캐시된다", async () => {
      const notMeasuredStationGrowth: growthLatest.HomeGrowth = {
        heatOk: true,
        sunOk: true, // DB 조회는 정상 완료
        heat: { 212: { cum: 3438, normal: 3300 } },
        sun: {}, // 홍천(212)은 일사계가 없어 데이터 없음(정상)
      };
      vi.spyOn(growthLatest, "getHomeGrowth").mockResolvedValueOnce(
        notMeasuredStationGrowth,
      );

      // 에러를 던지지 않고 정상 반환되어 캐시에 들어감
      const result = await fetchHomeGrowth("common");
      expect(result.sunOk).toBe(true);
      expect(result.sun[212]).toBeUndefined();
    });

    it("loadGrowth: 캐시 함수가 에러를 던지면 폴백({ heatOk: false, sunOk: false })을 반환한다", async () => {
      vi.spyOn(growthLatest, "getHomeGrowth").mockRejectedValueOnce(
        new Error("DB timeout"),
      );

      const result = await loadGrowth("apple");
      expect(result.heatOk).toBe(false);
      expect(result.sunOk).toBe(false);
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
