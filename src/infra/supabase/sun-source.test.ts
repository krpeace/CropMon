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
      'order("date")',
    ]);
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
