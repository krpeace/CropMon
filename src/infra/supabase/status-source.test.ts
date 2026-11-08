import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createStatusSource } from "./status-source";

/** 가짜 Supabase: 부른 순서를 적어 두고, 정해 둔 답을 돌려준다. */
function fakeClient(answer: {
  data: unknown;
  error: { message: string } | null;
}) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "neq",
    "in",
    "gte",
    "order",
    "limit",
    "retry",
    "abortSignal",
  ]) {
    chain[m] = (...args: unknown[]) => {
      if (m !== "abortSignal" && m !== "retry") {
        calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      }
      return chain;
    };
  }
  chain.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve(answer).then(ok);
  const client = {
    from: (t: string) => (calls.push(`from(${t})`), chain),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("status-source", () => {
  it("기본 조건, 최근 회차(공개 열만), 요약(in), 최근 물수지를 읽는다", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const db = createStatusSource(client);
    await db.defaultScenarios(2026);
    await db.recentRuns(40);
    await db.summaries([9], ["a", "b"]);
    await db.recentBalance(["a"], "2026-10-18");
    await db.recentSoilWater("2026-10-18");
    expect(calls).toEqual([
      "from(scenarios)",
      'select("scenario_id,stn_id,crop_id,raw_mm,taw_mm,season_start,season_end")',
      'eq("is_default",true)',
      'eq("season_year",2026)',
      "from(forecast_runs)",
      'select("run_id,stn_id,run_at,run_name,finished_at")',
      'eq("collector","actions")',
      'neq("result","실패")',
      'order("run_at",{"ascending":false})',
      "limit(40)",
      "from(water_outlook_summary)",
      'select("run_id,scenario_id,status_start,start_date,dr_start_mm,need_center_in")',
      'in("run_id",[9])',
      'in("scenario_id",["a","b"])',
      "from(water_balance_daily)",
      'select("scenario_id,date,status,dr_mm")',
      'in("scenario_id",["a"])',
      'gte("date","2026-10-18")',
      'order("date",{"ascending":false})',
      "from(soil_water_daily)",
      'select("stn_id,soil_code,date,dr_mm,taw_mm,raw_mm,aw_pct,status")',
      'gte("date","2026-10-18")',
      'order("date",{"ascending":false})',
      "limit(1000)",
    ]);
  });

  it("오류는 표 이름과 함께 던진다", async () => {
    await expect(
      createStatusSource(
        fakeClient({ data: null, error: { message: "denied" } }).client,
      ).recentRuns(4),
    ).rejects.toThrow("forecast_runs 읽기 실패: denied");
  });

  describe("latestSoilWater (이슈 #82)", () => {
    it("지점 목록이 비어 있으면 DB를 부르지 않고 빈 배열을 돌려준다", async () => {
      const { client, calls } = fakeClient({ data: [], error: null });
      const db = createStatusSource(client);
      const rows = await db.latestSoilWater?.([]);
      expect(rows).toEqual([]);
      expect(calls).toEqual([]);
    });

    it("지점 목록이 있으면 stn_id in 조건과 range(0, 999)로 뷰를 읽는다", async () => {
      const calls: string[] = [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "range", "retry", "abortSignal"]) {
        chain[m] = (...args: unknown[]) => {
          if (m !== "abortSignal" && m !== "retry") {
            calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
          }
          return chain;
        };
      }
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok);
      const client = {
        from: (t: string) => (calls.push(`from(${t})`), chain),
      } as unknown as SupabaseClient;

      const db = createStatusSource(client);
      await db.latestSoilWater?.(["101", "216"]);
      expect(calls).toEqual([
        "from(soil_water_latest)",
        'select("stn_id,soil_code,date,dr_mm,taw_mm,raw_mm,aw_pct,status")',
        "range(0,999)",
        'in("stn_id",["101","216"])',
      ]);
    });

    it("97곳×12토성=1,164줄이 1,000줄 제한을 넘어도 range 페이징으로 하나도 빠지지 않고 읽힌다", async () => {
      const SOILS = [
        "clay",
        "silty_clay",
        "sandy_clay",
        "clay_loam",
        "silty_clay_loam",
        "sandy_clay_loam",
        "loam",
        "silt_loam",
        "silt",
        "sandy_loam",
        "loamy_sand",
        "sand",
      ];
      // 97개 지점 × 12개 토성 = 정확히 1,164줄 생성
      const mockRows: {
        stn_id: string;
        soil_code: string;
        date: string;
        dr_mm: number;
        taw_mm: number;
        raw_mm: number;
        aw_pct: number;
        status: string;
      }[] = [];
      for (let stn = 1; stn <= 97; stn++) {
        for (const soil of SOILS) {
          mockRows.push({
            stn_id: String(stn),
            soil_code: soil,
            date: "2026-11-08",
            dr_mm: 20,
            taw_mm: 65,
            raw_mm: 26,
            aw_pct: 69.2,
            status: "fair",
          });
        }
      }
      expect(mockRows).toHaveLength(1164);

      const rangeCalls: { from: number; to: number }[] = [];
      const client = {
        from: (table: string) => {
          expect(table).toBe("soil_water_latest");
          let curFrom = 0;
          let curTo = 999;
          const chain: Record<string, unknown> = {
            select: () => chain,
            in: () => chain,
            range: (from: number, to: number) => {
              curFrom = from;
              curTo = to;
              rangeCalls.push({ from, to });
              return chain;
            },
            retry: () => chain,
            abortSignal: () => chain,
            then: (resolve: (v: unknown) => unknown) => {
              const slice = mockRows.slice(curFrom, curTo + 1);
              return Promise.resolve({ data: slice, error: null }).then(
                resolve,
              );
            },
          };
          return chain;
        },
      } as unknown as SupabaseClient;

      const db = createStatusSource(client);
      const rows = await db.latestSoilWater?.();

      // 1. 페이징 2회 호출 확인: 0~999 (1000줄), 1000~1999 (164줄)
      expect(rangeCalls).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
      ]);

      // 2. 1,164줄이 하나도 빠지지 않고 반환되었는지 확인
      expect(rows).toHaveLength(1164);

      // 3. 지점별 12토성 모두 누락 없이 존재하는지 전수 검증
      const keySet = new Set(rows?.map((r) => `${r.stn_id}:${r.soil_code}`));
      for (let stn = 1; stn <= 97; stn++) {
        for (const soil of SOILS) {
          expect(keySet.has(`${stn}:${soil}`)).toBe(true);
        }
      }
    });
  });
});
