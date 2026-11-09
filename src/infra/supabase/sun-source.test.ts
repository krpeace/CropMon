import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { COLUMNS, createSunSource } from "./sun-source";

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
    "in",
    "not",
    "gte",
    "lte",
    "order",
    "limit",
    "range",
    "abortSignal",
    "retry",
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

describe("sun-source", () => {
  it("읽는 열은 모두 마이그레이션에 있다", () => {
    for (const cols of Object.values(COLUMNS)) {
      for (const c of cols.split(",")) {
        expect(SQL, c).toMatch(new RegExp(`\\b${c}\\b`));
      }
    }
  });

  it("그해 1월 1일 ~ 12월 31일, 날짜 순", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await createSunSource(client).year("101", 2026);
    expect(calls).toEqual([
      "from(sun_daily)",
      `select(${JSON.stringify(COLUMNS.sun_daily)})`,
      'eq("stn_id","101")',
      'gte("date","2026-01-01")',
      'lte("date","2026-12-31")',
      'order("date")',
      "limit(400)",
    ]);
  });

  it("지역 비교는 지점 여러 곳을 한 번에, 날짜 하나로", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await createSunSource(client).onDate(["101", "216"], "2026-10-24");
    expect(calls).toEqual([
      "from(sun_daily)",
      `select(${JSON.stringify(COLUMNS.sun_latest)})`,
      'in("stn_id",["101","216"])',
      'eq("date","2026-10-24")',
    ]);
  });

  it("빠진 지점은 최근 며칠 중 올해 값이 있는 줄로 보충", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await createSunSource(client).recent(["119"], "2026-10-11", "2026-10-24");
    expect(calls).toEqual([
      "from(sun_daily)",
      `select(${JSON.stringify(COLUMNS.sun_latest)})`,
      'in("stn_id",["119"])',
      'gte("date","2026-10-11")',
      'lte("date","2026-10-24")',
      'not("rs_cum_mj","is",null)',
      'order("date",{"ascending":true})',
      'order("stn_id",{"ascending":true})',
      "range(0,999)",
    ]);
  });

  it("1,000줄 넘는 경우 고정 정렬(date, stn_id)로 range 나눠 읽고 겹침·빠짐이 없다 (1,164줄)", async () => {
    // 97개 지점 × 12일 = 1,164줄
    const mockRows = Array.from({ length: 1164 }, (_, i) => ({
      stn_id: String(100 + Math.floor(i / 12)),
      date: `2026-10-${String((i % 12) + 1).padStart(2, "0")}`,
      rs_cum_mj: 1000 + i,
      rs_normal_cum_mj: 950 + i,
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
        gte: (col: string, val: unknown) => (
          calls.push(`gte(${JSON.stringify(col)},${JSON.stringify(val)})`),
          builder
        ),
        lte: (col: string, val: unknown) => (
          calls.push(`lte(${JSON.stringify(col)},${JSON.stringify(val)})`),
          builder
        ),
        not: (col: string, op: string, val: unknown) => (
          calls.push(
            `not(${JSON.stringify(col)},${JSON.stringify(op)},${JSON.stringify(val)})`,
          ),
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
    const db = createSunSource(client);
    const stnIds = Array.from(new Set(mockRows.map((r) => r.stn_id)));
    const result = await db.recent(stnIds, "2026-10-01", "2026-10-12");

    // 1. 고정 정렬 확인 (date asc, stn_id asc)
    expect(calls).toContain('order("date",{"ascending":true})');
    expect(calls).toContain('order("stn_id",{"ascending":true})');

    // 2. 1,000줄 단위 range 호출 확인 ([0, 999], [1000, 1999])
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // 3. 총 1,164줄 빠짐 및 중복 없음
    expect(result).toHaveLength(1164);
    const keys = new Set(result.map((r) => `${r.date}-${r.stn_id}`));
    expect(keys.size).toBe(1164);
  });

  it("numeric 이 문자로 와도 수로 바꾸고, 지점 번호·날짜는 그대로 둔다", async () => {
    const { client } = fakeClient({
      data: [
        {
          stn_id: "101",
          date: "2026-10-24",
          rs_cum_mj: "3218.4",
          rs_normal_cum_mj: "3352",
        },
      ],
      error: null,
    });
    expect(await createSunSource(client).onDate(["101"], "2026-10-24")).toEqual(
      [
        {
          stn_id: "101",
          date: "2026-10-24",
          rs_cum_mj: 3218.4,
          rs_normal_cum_mj: 3352,
        },
      ],
    );
  });

  it("마지막 계산 시각: 그 지점 줄 중 가장 늦은 updated_at 한 줄 (v1.8)", async () => {
    const { client, calls } = fakeClient({
      data: [{ updated_at: "2026-11-08T00:20:05.123+00:00" }],
      error: null,
    });
    expect(await createSunSource(client).lastUpdated("101")).toBe(
      "2026-11-08T00:20:05.123+00:00",
    );
    expect(calls).toEqual([
      "from(sun_daily)",
      `select(${JSON.stringify(COLUMNS.updated)})`,
      'eq("stn_id","101")',
      'order("updated_at",{"ascending":false})',
      "limit(1)",
    ]);
  });

  it("줄이 없으면(햇빛을 재지 않는 지점) 마지막 계산 시각은 null", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await createSunSource(client).lastUpdated("216")).toBeNull();
  });

  it("DB 오류는 표 이름과 함께 던진다 (서비스가 잡아 '자료 없음'으로 바꾼다)", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(createSunSource(client).year("101", 2026)).rejects.toThrow(
      "sun_daily 읽기 실패: permission denied",
    );
  });
});
