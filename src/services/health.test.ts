import { describe, expect, it, vi } from "vitest";

import {
  checkSupabaseConnection,
  getHealthStatus,
  type HealthClient,
} from "./health";

const NOW = new Date("2026-10-22T06:00:00Z");
const now = () => NOW;

type QueryResult = Awaited<
  ReturnType<
    ReturnType<
      ReturnType<ReturnType<HealthClient["from"]>["select"]>["eq"]
    >["maybeSingle"]
  >
>;

/** app_health 를 읽으면 정해 둔 결과를 돌려주는 가짜 클라이언트. */
function fakeClient(result: () => Promise<QueryResult>): HealthClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: result }),
      }),
    }),
  };
}

describe("checkSupabaseConnection", () => {
  it("정상: 확인용 행을 읽으면 ok", async () => {
    const client = fakeClient(async () => ({
      data: { note: "ok" },
      error: null,
    }));
    expect(await checkSupabaseConnection(client, now)).toEqual({
      ok: true,
      message: "정상적으로 연결되었습니다.",
      checkedAt: "2026-10-22T06:00:00.000Z",
    });
  });

  it("행이 없음: 연결은 됐지만 확인용 자료가 없다고 알려 준다", async () => {
    const client = fakeClient(async () => ({ data: null, error: null }));
    const result = await checkSupabaseConnection(client, now);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("확인용 자료가 없습니다");
    expect(result.checkedAt).toBe("2026-10-22T06:00:00.000Z");
  });

  it("DB 오류 응답: 던지지 않고 ok:false, 원문 오류는 응답에 넣지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(async () => ({
      data: null,
      error: { message: 'relation "public.app_health" does not exist' },
    }));
    const result = await checkSupabaseConnection(client, now);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("데이터베이스가 오류를 돌려주었습니다");
    expect(result.message).not.toContain("relation");
    spy.mockRestore();
  });

  it("예외 발생: 던지지 않고 ok:false", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await checkSupabaseConnection(client, now);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("연결하지 못했습니다");
    expect(result.message).not.toContain("fetch failed");
    spy.mockRestore();
  });
});

describe("getHealthStatus", () => {
  it("연결 정보가 비어 있으면 던지지 않고 그 안내를 돌려준다", async () => {
    const result = await getHealthStatus(() => {
      throw new Error("Supabase 연결 정보가 비어 있습니다: X");
    }, now);
    expect(result).toEqual({
      ok: false,
      message: "Supabase 연결 정보가 비어 있습니다: X",
      checkedAt: "2026-10-22T06:00:00.000Z",
    });
  });
});
