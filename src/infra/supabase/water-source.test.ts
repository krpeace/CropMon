import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { COLUMNS, createWaterSource } from "./water-source";

const SQL = readdirSync(join(process.cwd(), "supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .map((n) =>
    readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8"),
  )
  .join("\n");

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
    "gte",
    "lte",
    "order",
    "limit",
    "abortSignal",
    "retry",
    "maybeSingle",
  ]) {
    chain[m] = (...args: unknown[]) => {
      if (m !== "abortSignal" && m !== "retry")
        calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
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

describe("water-source", () => {
  it("공개하지 않는 열(raw_path, error)은 읽지 않는다", () => {
    expect(COLUMNS.forecast_runs).not.toMatch(/raw_path|error/);
  });

  it("읽는 열은 모두 마이그레이션에 있다", () => {
    for (const cols of Object.values(COLUMNS)) {
      for (const c of cols.split(",")) {
        expect(SQL, c).toMatch(new RegExp(`\\b${c}\\b`));
      }
    }
  });

  it("최근 회차는 서버 수집 중 실패가 아닌 것을 새것부터", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    expect(await createWaterSource(client).recentRuns("101", 4)).toEqual([]);
    expect(calls).toEqual([
      "from(forecast_runs)",
      `select(${JSON.stringify(COLUMNS.forecast_runs)})`,
      'eq("stn_id","101")',
      'eq("collector","actions")',
      'neq("result","실패")',
      'order("run_at",{"ascending":false})',
      "limit(4)",
    ]);
  });

  it("numeric 이 문자로 와도 수로 바꾸고, 날짜·이름은 그대로 둔다", async () => {
    const { client } = fakeClient({
      data: [
        {
          date: "2026-10-24",
          dr_mm: "50.7",
          rain_mm: null,
          status: "caution",
          filled: false,
        },
      ],
      error: null,
    });
    expect(await createWaterSource(client).balance("s", "2026-10-25")).toEqual([
      {
        date: "2026-10-24",
        dr_mm: 50.7,
        rain_mm: null,
        status: "caution",
        filled: false,
      },
    ]);
  });

  it("DB 오류는 표 이름과 함께 던진다 (서비스가 잡아 '자료 없음'으로 바꾼다)", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(createWaterSource(client).kcSets("apple")).rejects.toThrow(
      "crop_kc_sets 읽기 실패: permission denied",
    );
  });

  it("토성 12종(soil_types)을 sort_order 순으로 읽고, 작물 공통 토양 물 상태(soil_water_daily)를 읽는다", async () => {
    const { client, calls } = fakeClient({
      data: [
        {
          date: "2026-10-24",
          eto_mm: "3.2",
          rain_mm: "0",
          eto_7d_mm: "24.1",
          rain_7d_mm: "3.0",
          dp_mm: "0",
          dr_mm: "33.8",
          taw_mm: "65",
          raw_mm: "26",
          aw_pct: "48",
          status: "fair",
          days_to_dry: "4",
          filled: false,
        },
      ],
      error: null,
    });
    const db = createWaterSource(client);
    await db.soilTypes();
    const rows = await db.soilWater("101", "loam", "2026-03-01", "2026-10-25");
    expect(rows).toEqual([
      {
        date: "2026-10-24",
        eto_mm: 3.2,
        rain_mm: 0,
        eto_7d_mm: 24.1,
        rain_7d_mm: 3,
        dp_mm: 0,
        dr_mm: 33.8,
        taw_mm: 65,
        raw_mm: 26,
        aw_pct: 48,
        status: "fair",
        days_to_dry: 4,
        filled: false,
      },
    ]);
    expect(calls).toEqual([
      "from(soil_types)",
      `select(${JSON.stringify(COLUMNS.soil_types)})`,
      'order("sort_order")',
      "from(soil_water_daily)",
      `select(${JSON.stringify(COLUMNS.soil_water_daily)})`,
      'eq("stn_id","101")',
      'eq("soil_code","loam")',
      'gte("date","2026-03-01")',
      'lte("date","2026-10-25")',
      'order("date")',
      "limit(400)",
    ]);
  });
});
