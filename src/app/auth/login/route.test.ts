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

const signInWithOAuth = vi.fn();
const ORIGIN = "http://localhost:3000";
const PROVIDER_URL = "https://provider.example/authorize?state=abc";

const call = (qs: string) => GET(new Request(`${ORIGIN}/auth/login${qs}`));

beforeEach(() => {
  signInWithOAuth.mockReset();
  signInWithOAuth.mockResolvedValue({
    data: { url: PROVIDER_URL },
    error: null,
  });
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { signInWithOAuth },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /auth/login — 스위치를 끄면", () => {
  it("404 이고 Supabase 를 건드리지 않는다 (쿠키도 안 심음)", async () => {
    const res = await call("?provider=kakao&next=%2F");
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("GET /auth/login — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("카카오 · 구글은 공급자 화면으로 보낸다 (네이버 스위치와 상관없이)", async () => {
    for (const provider of ["kakao", "google"]) {
      signInWithOAuth.mockClear();
      const res = await call(`?provider=${encodeURIComponent(provider)}`);
      expect(res.status, provider).toBe(302);
      expect(res.headers.get("location")).toBe(PROVIDER_URL);
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
      expect(signInWithOAuth.mock.calls[0][0].provider).toBe(provider);
    }
  });

  it("네이버는 NAVER_LOGIN_ENABLED 가 꺼져 있으면 모르는 공급자와 같이 400 (Supabase 를 부르지 않음)", async () => {
    for (const v of [undefined, "", "false", "1", "True"]) {
      if (v !== undefined) vi.stubEnv("NAVER_LOGIN_ENABLED", v);
      const res = await call("?provider=custom%3Anaver&next=%2F");
      expect(res.status, String(v)).toBe(400);
    }
    expect(makeClient).not.toHaveBeenCalled();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("네이버는 NAVER_LOGIN_ENABLED=true 이면 공급자 화면으로 보낸다", async () => {
    vi.stubEnv("NAVER_LOGIN_ENABLED", "true");
    const res = await call("?provider=custom%3Anaver&next=%2Fwater");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(PROVIDER_URL);
    expect(signInWithOAuth.mock.calls[0][0].provider).toBe("custom:naver");
  });

  it("누르기 전에 보던 화면(검색어 포함)을 콜백 주소에 실어 보낸다", async () => {
    await call(
      `?provider=kakao&next=${encodeURIComponent("/water?st=105&crop=apple")}`,
    );
    const arg = signInWithOAuth.mock.calls[0][0];
    expect(arg.options.skipBrowserRedirect).toBe(true);
    const redirectTo = new URL(arg.options.redirectTo);
    expect(redirectTo.origin).toBe(ORIGIN);
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe(
      "/water?st=105&crop=apple",
    );
  });

  it("next 가 없거나 위험하면 / 로 바꿔 실어 보낸다", async () => {
    for (const next of [
      "",
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "/%2f%2fevil.example",
      "/auth/login",
    ]) {
      signInWithOAuth.mockClear();
      await call(`?provider=google&next=${encodeURIComponent(next)}`);
      const redirectTo = new URL(
        signInWithOAuth.mock.calls[0][0].options.redirectTo,
      );
      expect(redirectTo.searchParams.get("next"), next).toBe("/");
    }
    signInWithOAuth.mockClear();
    await call("?provider=google");
    expect(
      new URL(
        signInWithOAuth.mock.calls[0][0].options.redirectTo,
      ).searchParams.get("next"),
    ).toBe("/");
  });

  it("모르는 공급자 · 빈 값은 400 이고 Supabase 를 부르지 않는다", async () => {
    for (const q of [
      "",
      "?provider=",
      "?provider=github",
      "?provider=KAKAO",
      "?provider=naver",
      "?provider=custom:other",
      "?provider=kakao,google",
    ]) {
      const res = await call(q);
      expect(res.status, q).toBe(400);
    }
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("공급자 주소를 못 받거나 오류가 나면 돌아갈 화면에 login=failed 를 붙여 돌려보낸다", async () => {
    signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { code: "provider_disabled", message: "x" },
    });
    let res = await call(
      `?provider=kakao&next=${encodeURIComponent("/water?st=105")}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&login=failed`,
    );

    signInWithOAuth.mockRejectedValueOnce(new Error("network down"));
    res = await call("?provider=google");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=failed`);

    makeClient.mockRejectedValueOnce(new Error("no env"));
    res = await call("?provider=google");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login=failed`);
  });
});
