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
    await db.recentRuns("2026-10-18", ["101"]);
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
      'in("stn_id",["101"])',
      'gte("run_at","2026-10-18T00:00:00+09:00")',
      'order("run_at",{"ascending":false})',
      'order("run_id",{"ascending":false})',
      "range(0,999)",
      "from(water_outlook_summary)",
      'select("run_id,scenario_id,status_start,start_date,dr_start_mm,need_center_in")',
      'in("run_id",[9])',
      'in("scenario_id",["a","b"])',
      "from(water_balance_daily)",
      'select("scenario_id,date,status,dr_mm,filled")',
      'in("scenario_id",["a"])',
      'gte("date","2026-10-18")',
      'order("scenario_id",{"ascending":true})',
      'order("date",{"ascending":false})',
      "range(0,999)",
      "from(soil_water_latest)",
      'select("stn_id,soil_code,date,dr_mm,taw_mm,raw_mm,aw_pct,status,filled")',
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
      ).recentRuns("2026-10-18", ["101"]),
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
    await db.recentRuns("2026-10-18", ["101", "102"]);
    await db.recentWeather("2026-10-18", ["101"]);
    expect(calls).toEqual([
      "from(forecast_runs)",
      'select("run_id,stn_id,run_at,run_name,finished_at")',
      'eq("collector","actions")',
      'neq("result","실패")',
      'in("stn_id",["101","102"])',
      'gte("run_at","2026-10-18T00:00:00+09:00")',
      'order("run_at",{"ascending":false})',
      'order("run_id",{"ascending":false})',
      "range(0,999)",
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
    expect(await db.recentRuns("2026-10-18", [])).toEqual([]);
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
      filled: i % 2 === 0,
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

  it("recentBalance: 빈 scenarioIds가 들어오면 DB를 부르지 않고 바로 빈 배열을 돌려준다", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const db = createStatusSource(client);
    const result = await db.recentBalance([], "2026-10-18");
    expect(result).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("recentBalance: 194개 조건 × 7일(1,358줄)을 100개 단위 청크로 나눠 읽고 고정 정렬로 빠짐없이 합친다 (#103)", async () => {
    // 194개 조건 × 7일 = 1,358줄 모의 데이터
    const mockRows = Array.from({ length: 1358 }, (_, i) => ({
      scenario_id: `scen-${String(Math.floor(i / 7) + 1).padStart(3, "0")}`,
      date: `2026-10-${String((i % 7) + 1).padStart(2, "0")}`,
      status: "fair",
      dr_mm: 12.5,
      filled: i % 3 === 0,
    }));

    const ranges: [number, number][] = [];
    const calls: string[] = [];
    const from = (table: string) => {
      calls.push(`from(${table})`);
      let cFrom = 0;
      let cTo = 0;
      let currentChunk: string[] = [];
      const builder: Record<string, unknown> = {
        select: (cols: string) => (
          calls.push(`select(${JSON.stringify(cols)})`),
          builder
        ),
        gte: (col: string, val: unknown) => (
          calls.push(`gte(${JSON.stringify(col)},${JSON.stringify(val)})`),
          builder
        ),
        in: (col: string, vals: unknown[]) => {
          calls.push(`in(${JSON.stringify(col)},${JSON.stringify(vals)})`);
          if (col === "scenario_id") {
            currentChunk = vals as string[];
          }
          return builder;
        },
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
          const chunkSet = new Set(currentChunk);
          const filtered = mockRows.filter((r) => chunkSet.has(r.scenario_id));
          const slice = filtered.slice(cFrom, cTo + 1);
          return Promise.resolve({ data: slice, error: null }).then(resolve);
        },
      };
      return builder;
    };

    const client = { from } as unknown as SupabaseClient;
    const db = createStatusSource(client);
    const scenarioIds = Array.from(new Set(mockRows.map((r) => r.scenario_id)));
    expect(scenarioIds).toHaveLength(194);

    const result = await db.recentBalance(scenarioIds, "2026-10-18");

    // 1. 고정 정렬 확인 (scenario_id asc, date desc)
    expect(calls).toContain('order("scenario_id",{"ascending":true})');
    expect(calls).toContain('order("date",{"ascending":false})');

    // 2. 100개 단위 청크 2개(700줄, 658줄)로 분할되어 각 청크가 [0, 999] 1회씩 호출됨
    expect(ranges).toEqual([
      [0, 999],
      [0, 999],
    ]);

    // 3. 총 1,358줄 빠짐 및 중복 없음
    expect(result).toHaveLength(1358);
    expect(result).toEqual(mockRows);
  });

  it("recentBalance: 한 묶음이 1,000줄 초과(1,200줄)에서도 range([0, 999], [1000, 1999])를 따라 빠짐없이 읽는다 (#103)", async () => {
    // 100개 조건 × 12일 = 1,200줄 모의 데이터 (한 묶음 100개 이하)
    const mock1200Rows = Array.from({ length: 1200 }, (_, i) => ({
      scenario_id: `scen-${String(Math.floor(i / 12) + 1).padStart(3, "0")}`,
      date: `2026-10-${String((i % 12) + 1).padStart(2, "0")}`,
      status: "fair",
      dr_mm: 12.5,
    }));

    const ranges: [number, number][] = [];
    const calls: string[] = [];
    let cFrom = 0;
    let cTo = 0;
    const from = (table: string) => {
      expect(table).toBe("water_balance_daily");
      calls.push(`from(${table})`);
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
          const slice = mock1200Rows.slice(cFrom, cTo + 1);
          return Promise.resolve({ data: slice, error: null }).then(resolve);
        },
      };
      return builder;
    };

    const client = { from } as unknown as SupabaseClient;
    const db = createStatusSource(client);
    const scenarioIds = Array.from(
      new Set(mock1200Rows.map((r) => r.scenario_id)),
    );
    expect(scenarioIds).toHaveLength(100);

    const result = await db.recentBalance(scenarioIds, "2026-10-18");

    // 1. 고정 정렬 확인 (scenario_id asc, date desc)
    expect(calls).toContain('order("scenario_id",{"ascending":true})');
    expect(calls).toContain('order("date",{"ascending":false})');

    // 2. 1,000줄 단위 range 호출 확인 ([0, 999], [1000, 1999])
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // 3. 총 1,200줄 빠짐 및 중복 없음
    expect(result).toHaveLength(1200);
    expect(result).toEqual(mock1200Rows);
  });

  it("recentRuns: 3일치 582줄(97곳×2회×3일) 및 1,000줄 초과(1,200줄)에서도 range 페이징으로 빠짐없이 읽는다 (#110)", async () => {
    // 97개 지점 × 하루 2회(02시, 17시) × 3일 = 582줄
    const mock582Rows = Array.from({ length: 582 }, (_, i) => ({
      run_id: 1000 - i,
      stn_id: String(100 + (i % 97)),
      run_at: new Date(
        Date.parse("2026-11-09T08:00:00Z") - i * 3600000,
      ).toISOString(),
      run_name: i % 2 === 0 ? "저녁" : "아침",
      finished_at: new Date(
        Date.parse("2026-11-09T08:40:00Z") - i * 3600000,
      ).toISOString(),
    }));

    // 1) 582줄 검증: 단일 페이지([0, 999])로 582줄 읽고 종료
    {
      const ranges: [number, number][] = [];
      let cFrom = 0;
      let cTo = 0;
      const from = (t: string) => {
        expect(t).toBe("forecast_runs");
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          neq: () => builder,
          in: () => builder,
          gte: () => builder,
          order: () => builder,
          range: (f: number, t: number) => {
            cFrom = f;
            cTo = t;
            ranges.push([f, t]);
            return builder;
          },
          retry: () => builder,
          abortSignal: () => builder,
          then: (resolve: (v: unknown) => unknown) => {
            const slice = mock582Rows.slice(cFrom, cTo + 1);
            return Promise.resolve({ data: slice, error: null }).then(resolve);
          },
        };
        return builder;
      };
      const client = { from } as unknown as SupabaseClient;
      const db = createStatusSource(client);
      const res = await db.recentRuns("2026-11-06", ["101"]);
      expect(ranges).toEqual([[0, 999]]);
      expect(res).toHaveLength(582);
      expect(res).toEqual(mock582Rows);
    }

    // 2) 1,000줄 초과(1,200줄) 검증: 2개 페이지([0, 999], [1000, 1999]) 분할 페이징
    {
      const mock1200Rows = Array.from({ length: 1200 }, (_, i) => ({
        run_id: 2000 - i,
        stn_id: String(100 + (i % 97)),
        run_at: new Date(
          Date.parse("2026-11-09T08:00:00Z") - i * 1800000,
        ).toISOString(),
        run_name: i % 2 === 0 ? "저녁" : "아침",
        finished_at: new Date(
          Date.parse("2026-11-09T08:40:00Z") - i * 1800000,
        ).toISOString(),
      }));
      const ranges: [number, number][] = [];
      const calls: string[] = [];
      let cFrom = 0;
      let cTo = 0;
      const from = (t: string) => {
        expect(t).toBe("forecast_runs");
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          neq: () => builder,
          in: () => builder,
          gte: () => builder,
          order: (col: string, opts: unknown) => {
            calls.push(`order(${JSON.stringify(col)},${JSON.stringify(opts)})`);
            return builder;
          },
          range: (f: number, t: number) => {
            cFrom = f;
            cTo = t;
            ranges.push([f, t]);
            return builder;
          },
          retry: () => builder,
          abortSignal: () => builder,
          then: (resolve: (v: unknown) => unknown) => {
            const slice = mock1200Rows.slice(cFrom, cTo + 1);
            return Promise.resolve({ data: slice, error: null }).then(resolve);
          },
        };
        return builder;
      };
      const client = { from } as unknown as SupabaseClient;
      const db = createStatusSource(client);
      const res = await db.recentRuns("2026-11-06", ["101"]);
      // 고정 정렬 확인 (run_at desc, run_id desc)
      expect(calls).toContain('order("run_at",{"ascending":false})');
      expect(calls).toContain('order("run_id",{"ascending":false})');
      // 2페이지 페이징 확인
      expect(ranges).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
      expect(res).toHaveLength(1200);
      expect(res).toEqual(mock1200Rows);
    }
  });

  describe("scenario_id 100개 단위 분할 조회 (chunkedByScenarios, #103)", () => {
    it("194개 ID 전달 시 summaries, recentBalance, outlookDays 가 100개, 94개로 2번 나누어 요청하고 결과를 합친다", async () => {
      const ids = Array.from({ length: 194 }, (_, i) => `scen-${i}`);
      const inCalls: unknown[][] = [];
      const client = {
        from: () => {
          let currentChunk: string[] = [];
          const chain: Record<string, unknown> = {};
          for (const m of [
            "select",
            "gte",
            "order",
            "range",
            "retry",
            "abortSignal",
          ]) {
            chain[m] = () => chain;
          }
          chain.in = (col: string, vals: unknown[]) => {
            if (col === "scenario_id") {
              currentChunk = vals as string[];
              inCalls.push(vals);
            }
            return chain;
          };
          chain.then = (ok: (v: unknown) => unknown) => {
            const mockData = currentChunk.map((id) => ({
              scenario_id: id,
              date: "2026-11-10",
              status: "normal",
              dr_mm: 10,
              run_id: 1,
              target_date: "2026-11-11",
              lead_day: 1,
              status_start: "normal",
              start_date: "2026-11-10",
              dr_start_mm: 10,
              need_center_in: null,
            }));
            return Promise.resolve({ data: mockData, error: null }).then(ok);
          };
          return chain;
        },
      } as unknown as SupabaseClient;

      const db = createStatusSource(client);

      // 1. summaries
      inCalls.length = 0;
      const sums = await db.summaries([1], ids);
      expect(inCalls).toHaveLength(2);
      expect(inCalls[0]).toHaveLength(100);
      expect(inCalls[1]).toHaveLength(94);
      expect(sums).toHaveLength(194);

      // 2. recentBalance
      inCalls.length = 0;
      const bals = await db.recentBalance(ids, "2026-11-03");
      expect(inCalls).toHaveLength(2);
      expect(inCalls[0]).toHaveLength(100);
      expect(inCalls[1]).toHaveLength(94);
      expect(bals).toHaveLength(194);

      // 3. outlookDays
      inCalls.length = 0;
      const days = await db.outlookDays([1], ids);
      expect(inCalls).toHaveLength(2);
      expect(inCalls[0]).toHaveLength(100);
      expect(inCalls[1]).toHaveLength(94);
      expect(days).toHaveLength(194);
    });

    it("분할된 묶음 중 하나라도 실패하면 전체 작업이 실패(reject)한다", async () => {
      const ids = Array.from({ length: 194 }, (_, i) => `scen-${i}`);
      let callCount = 0;
      const client = {
        from: () => {
          const chain: Record<string, unknown> = {};
          for (const m of [
            "select",
            "gte",
            "order",
            "range",
            "retry",
            "abortSignal",
          ]) {
            chain[m] = () => chain;
          }
          chain.in = () => chain;
          chain.then = (ok: (v: unknown) => unknown) => {
            callCount++;
            if (callCount === 2) {
              return Promise.resolve({
                data: null,
                error: { message: "connection timeout" },
              }).then(ok);
            }
            return Promise.resolve({ data: [], error: null }).then(ok);
          };
          return chain;
        },
      } as unknown as SupabaseClient;

      const db = createStatusSource(client);
      await expect(db.recentBalance(ids, "2026-11-03")).rejects.toThrow(
        "water_balance_daily 읽기 실패: connection timeout",
      );
    });
  });
});
