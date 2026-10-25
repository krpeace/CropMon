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
    ]);
  });

  it("마지막 관측은 한 줄, 없으면 null. 오류는 표 이름과 함께 던진다", async () => {
    const row = { date: "2026-10-24", fetched_at: "2026-10-24T17:20:00+00:00" };
    expect(
      await createStatusSource(
        fakeClient({ data: [row], error: null }).client,
      ).lastObserved("101"),
    ).toEqual(row);
    expect(
      await createStatusSource(
        fakeClient({ data: [], error: null }).client,
      ).lastObserved("101"),
    ).toBeNull();
    await expect(
      createStatusSource(
        fakeClient({ data: null, error: { message: "denied" } }).client,
      ).recentRuns(4),
    ).rejects.toThrow("forecast_runs 읽기 실패: denied");
  });
});
