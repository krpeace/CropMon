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
    "range",
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
    await db.latestSoilWater(["101"]);
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
      "from(soil_water_latest)",
      'select("stn_id,soil_code,date,dr_mm,taw_mm,raw_mm,aw_pct,status")',
      'in("stn_id",["101"])',
      'order("stn_id",{"ascending":true})',
      'order("soil_code",{"ascending":true})',
      "range(0,999)",
    ]);
  });

  it("오류는 표 이름과 함께 던진다", async () => {
    await expect(
      createStatusSource(
        fakeClient({ data: null, error: { message: "denied" } }).client,
      ).recentRuns(4),
    ).rejects.toThrow("forecast_runs 읽기 실패: denied");
  });

  it("지점 목록이 비어 있으면 DB를 부르지 않고 빈 배열을 돌려준다", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const db = createStatusSource(client);
    const rows = await db.latestSoilWater([]);
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("recentRuns와 recentWeather에 지점 목록(stnIds)을 넘기면 in 조건을 건다", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const db = createStatusSource(client);
    await db.recentRuns(40, ["101", "102"]);
    await db.recentWeather("2026-10-18", ["101"]);
    expect(calls).toEqual([
      "from(forecast_runs)",
      'select("run_id,stn_id,run_at,run_name,finished_at")',
      'eq("collector","actions")',
      'neq("result","실패")',
      'in("stn_id",["101","102"])',
      'order("run_at",{"ascending":false})',
      "limit(40)",
      "from(weather_daily)",
      'select("stn_id,date,fetched_at")',
      'gte("date","2026-10-18")',
      'in("stn_id",["101"])',
      'order("stn_id",{"ascending":true})',
      'order("date",{"ascending":false})',
      "range(0,999)",
    ]);
  });

  it("recentRuns와 recentWeather는 빈 지점 목록([])을 넘기면 DB를 부르지 않고 빈 배열을 돌려준다", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const db = createStatusSource(client);
    expect(await db.recentRuns(40, [])).toEqual([]);
    expect(await db.recentWeather("2026-10-18", [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("latestSoilWater: 1,000줄 넘는 경우 고정 정렬(stn_id, soil_code)로 range 나눠 읽고 겹침·빠짐이 없다 (1,164줄)", async () => {
    // 97개 지점 × 12개 토성 = 1,164줄
    const mockRows = Array.from({ length: 1164 }, (_, i) => ({
      stn_id: String(100 + Math.floor(i / 12)),
      soil_code: `soil_${i % 12}`,
      date: "2026-10-25",
      dr_mm: 10,
      taw_mm: 50,
      raw_mm: 20,
      aw_pct: 80,
      status: "fair",
    }));

    const ranges: [number, number][] = [];
    const calls: string[] = [];
    const from = (table: string) => {
      calls.push(`from(${table})`);
      let cFrom = 0;
      let cTo = 0;
      const builder: Record<string, unknown> = {
        select: (cols: string) => (
          calls.push(`select(${JSON.stringify(cols)})`),
          builder
        ),
        in: (col: string, vals: unknown[]) => (
          calls.push(`in(${JSON.stringify(col)},${JSON.stringify(vals)})`),
          builder
        ),
        order: (col: string, opts: unknown) => (
          calls.push(`order(${JSON.stringify(col)},${JSON.stringify(opts)})`),
          builder
        ),
        range: (f: number, t: number) => {
          cFrom = f;
          cTo = t;
          ranges.push([f, t]);
          calls.push(`range(${f},${t})`);
          return builder;
        },
        retry: () => builder,
        abortSignal: () => builder,
        then: (resolve: (v: unknown) => unknown) => {
          const slice = mockRows.slice(cFrom, cTo + 1);
          return Promise.resolve({ data: slice, error: null }).then(resolve);
        },
      };
      return builder;
    };

    const client = { from } as unknown as SupabaseClient;
    const db = createStatusSource(client);
    const stnIds = Array.from(new Set(mockRows.map((r) => r.stn_id)));
    const result = await db.latestSoilWater(stnIds);

    // 1. 고정 정렬 확인 (stn_id asc, soil_code asc)
    expect(calls).toContain('order("stn_id",{"ascending":true})');
    expect(calls).toContain('order("soil_code",{"ascending":true})');

    // 2. 1,000줄 단위 range 호출 확인 ([0, 999], [1000, 1999])
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // 3. 총 1,164줄 빠짐 및 중복 없음
    expect(result).toHaveLength(1164);
    const keys = new Set(result.map((r) => `${r.stn_id}-${r.soil_code}`));
    expect(keys.size).toBe(1164);
  });

  it("recentWeather: 1,000줄 넘는 경우 고정 정렬(stn_id, date desc)로 range 나눠 읽고 겹침·빠짐이 없다 (1,164줄)", async () => {
    const mockRows = Array.from({ length: 1164 }, (_, i) => ({
      stn_id: String(100 + Math.floor(i / 12)),
      date: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
      fetched_at: "2026-10-25T10:00:00+09:00",
    }));

    const ranges: [number, number][] = [];
    const calls: string[] = [];
    const from = (table: string) => {
      calls.push(`from(${table})`);
      let cFrom = 0;
      let cTo = 0;
      const builder: Record<string, unknown> = {
        select: (cols: string) => (
          calls.push(`select(${JSON.stringify(cols)})`),
          builder
        ),
        gte: (col: string, val: unknown) => (
          calls.push(`gte(${JSON.stringify(col)},${JSON.stringify(val)})`),
          builder
        ),
        in: (col: string, vals: unknown[]) => (
          calls.push(`in(${JSON.stringify(col)},${JSON.stringify(vals)})`),
          builder
        ),
        order: (col: string, opts: unknown) => (
          calls.push(`order(${JSON.stringify(col)},${JSON.stringify(opts)})`),
          builder
        ),
        range: (f: number, t: number) => {
          cFrom = f;
          cTo = t;
          ranges.push([f, t]);
          calls.push(`range(${f},${t})`);
          return builder;
        },
        retry: () => builder,
        abortSignal: () => builder,
        then: (resolve: (v: unknown) => unknown) => {
          const slice = mockRows.slice(cFrom, cTo + 1);
          return Promise.resolve({ data: slice, error: null }).then(resolve);
        },
      };
      return builder;
    };

    const client = { from } as unknown as SupabaseClient;
    const db = createStatusSource(client);
    const result = await db.recentWeather("2026-10-18");

    // 1. 고정 정렬 확인 (stn_id asc, date desc)
    expect(calls).toContain('order("stn_id",{"ascending":true})');
    expect(calls).toContain('order("date",{"ascending":false})');

    // 2. 1,000줄 단위 range 호출 확인 ([0, 999], [1000, 1999])
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // 3. 총 1,164줄 빠짐 및 중복 없음
    expect(result).toHaveLength(1164);
    expect(result).toEqual(mockRows);
  });
});
