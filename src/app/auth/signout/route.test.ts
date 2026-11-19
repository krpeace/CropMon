import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

import { GET, POST } from "./route";

// connection() 은 Next.js 요청 안에서만 동작한다. 시험에서는 "요청 때 스위치를 읽는다"만 흉내 낸다(판단은 진짜 membersEnabled).
vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const makeClient = vi.mocked(createSupabaseServerClient);

const signOut = vi.fn();
const ORIGIN = "http://localhost:3000";

const post = (qs = "", headers: Record<string, string> = {}) =>
  POST(new Request(`${ORIGIN}/auth/signout${qs}`, { method: "POST", headers }));

beforeEach(() => {
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { signOut },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/auth/signout — 스위치를 끄면", () => {
  it("POST · GET 모두 404 이고 Supabase 를 건드리지 않는다", async () => {
    expect((await post()).status).toBe(404);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
  });
});

describe("/auth/signout — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("POST 로 로그아웃하고 303 으로 / 에 돌려보낸다", async () => {
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("GET(링크 미리 불러오기 · 미리보기) 은 로그아웃시키지 않고 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(makeClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("검사한 next 로 돌아간다 (검색어를 살림), 없거나 위험하면 /", async () => {
    let res = await post(
      `?next=${encodeURIComponent("/water?st=105&crop=apple")}`,
    );
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&crop=apple`,
    );
    for (const next of [
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "/auth/login",
    ]) {
      res = await post(`?next=${encodeURIComponent(next)}`);
      expect(res.headers.get("location"), next).toBe(`${ORIGIN}/`);
    }
  });

  it("Origin 이 같은 사이트이면 통과한다", async () => {
    const res = await post("", { origin: ORIGIN });
    expect(res.status).toBe(303);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("Origin 이 없는 요청은 막지 않고 통과시킨다 (오래된 브라우저 · 일부 앱 안 브라우저)", async () => {
    const res = await post("", {});
    expect(res.status).toBe(303);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("Origin 이 다른 사이트(또는 'null')이면 403 이고 로그아웃하지 않는다", async () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost:3001",
      "https://localhost:3000",
      "null",
    ]) {
      const res = await post("", { origin });
      expect(res.status, origin).toBe(403);
    }
    expect(makeClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("로그아웃하다 오류가 나도 돌려보낸다 (서버 기록에는 개인 값 없이)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockRejectedValueOnce(new Error("failed for someone@example.com"));
    const res = await post();
    expect(res.status).toBe(303);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("someone@example.com");

    makeClient.mockRejectedValueOnce(new Error("no env"));
    expect((await post()).status).toBe(303);
  });
});
