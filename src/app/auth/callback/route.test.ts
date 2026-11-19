import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

import { GET } from "./route";

// connection() 은 Next.js 요청 안에서만 동작한다. 시험에서는 "요청 때 스위치를 읽는다"만 흉내 낸다(판단은 진짜 membersEnabled).
vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const makeClient = vi.mocked(createSupabaseServerClient);

const exchangeCodeForSession = vi.fn();
const rpc = vi.fn();
const ORIGIN = "http://localhost:3000";

const call = (qs: string, headers: Record<string, string> = {}) =>
  GET(new Request(`${ORIGIN}/auth/callback${qs}`, { headers }));

let errorLog: ReturnType<typeof vi.spyOn>;
/** 서버 기록에 남은 모든 것을 한 문자열로 */
const logged = () => JSON.stringify(errorLog.mock.calls);

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { exchangeCodeForSession },
    rpc,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /auth/callback — 스위치를 끄면", () => {
  it("404 이고 Supabase 를 건드리지 않는다 (코드가 와도 교환하지 않고 쿠키도 안 심음)", async () => {
    const res = await call("?code=abc&next=%2F");
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
  });
});

describe("GET /auth/callback — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("성공: 코드를 세션으로 바꾸고 ensure_my_member 를 한 번 부른 뒤 검사한 next 로 돌려보낸다", async () => {
    const res = await call(
      `?code=abc&next=${encodeURIComponent("/water?st=105&crop=apple")}`,
      { "user-agent": "Mozilla/5.0 (phone)" },
    );
    expect(res.status).toBe(302);
    // 성공은 login=ok 를 붙인다 — 화면이 "로그인했어요" 알림을 한 번 띄우고 주소에서 지운다 (결정 0064)
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&crop=apple&login=ok`,
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ensure_my_member");
    // 코드 교환은 서버가 하므로 사람의 브라우저 정보를 넘긴다
    expect(makeClient).toHaveBeenCalledWith({
      userAgent: "Mozilla/5.0 (phone)",
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("ensure_my_member 가 실패해도(오류 · 던짐) 로그인은 계속한다 — next 로 돌아가고 서버 기록에는 코드만", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for someone@example.com",
      },
    });
    let res = await call(`?code=abc&next=${encodeURIComponent("/water?st=1")}`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water?st=1&login=ok`);
    expect(logged()).toContain("42501");
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("permission denied");

    rpc.mockRejectedValueOnce(
      new Error("socket hang up for someone@example.com"),
    );
    res = await call("?code=abc&next=%2F");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=ok`);
    expect(res.status).toBe(302);
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("hang up");
  });

  it("next 가 없거나 위험하면 / 로 돌려보낸다", async () => {
    for (const next of [
      null,
      "",
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "/%5cevil.example",
      "/auth/login",
    ]) {
      const qs =
        next === null
          ? "?code=abc"
          : `?code=abc&next=${encodeURIComponent(next)}`;
      const res = await call(qs);
      expect(res.headers.get("location"), String(next)).toBe(
        `${ORIGIN}/?login=ok`,
      );
    }
  });

  it("성공의 next 에 # 가 있으면 살린다", async () => {
    const res = await call(
      `?code=abc&next=${encodeURIComponent("/water?st=105#top")}`,
    );
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&login=ok#top`,
    );
  });

  it("사용자가 취소하면 돌아갈 화면에 login=cancelled (교환 · ensure 호출 없음, 오류 문장은 기록하지 않음)", async () => {
    const res = await call(
      `?error=access_denied&error_code=access_denied&error_description=${encodeURIComponent("User someone@example.com denied")}&next=${encodeURIComponent("/water?st=105&crop=apple")}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&crop=apple&login=cancelled`,
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("denied");
  });

  it("그 밖의 오류는 login=failed — next 가 없으면 / 에 붙인다", async () => {
    const res = await call(
      `?error=server_error&error_description=${encodeURIComponent("boom someone@example.com")}`,
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=failed`);
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("boom");
  });

  it("코드 교환이 실패하면(오류 · 던짐) login=failed, ensure_my_member 는 부르지 않고, 코드 값은 기록하지 않는다", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: null,
      error: {
        code: "flow_state_not_found",
        message: "secretcode123 not found",
      },
    });
    let res = await call(
      `?code=secretcode123&next=${encodeURIComponent("/water?st=105")}`,
    );
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&login=failed`,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(logged()).toContain("flow_state_not_found");
    expect(logged()).not.toContain("secretcode123");

    exchangeCodeForSession.mockRejectedValueOnce(
      new Error("fetch failed secretcode123"),
    );
    res = await call("?code=secretcode123");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=failed`);
    expect(logged()).not.toContain("secretcode123");
    expect(logged()).not.toContain("fetch failed");

    makeClient.mockRejectedValueOnce(new Error("no env"));
    res = await call("?code=abc");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=failed`);
  });

  it("코드도 오류도 없이 돌아오면(오류가 # 뒤로 온 경우) login=failed", async () => {
    const res = await call(`?next=${encodeURIComponent("/water?st=105")}`);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&login=failed`,
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("실패한 돌아가기 주소의 next 도 검사한다 (위험하면 /)", async () => {
    const res = await call(
      `?error=access_denied&next=${encodeURIComponent("//evil.example")}`,
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=cancelled`);
  });
});
