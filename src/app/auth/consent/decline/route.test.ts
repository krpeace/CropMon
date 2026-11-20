import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

import { GET, POST } from "./route";

// connection() 은 Next.js 요청 안에서만 동작한다. 시험에서는 "요청 때 스위치를 읽는다"만 흉내 낸다.
vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const makeClient = vi.mocked(createSupabaseServerClient);

const ORIGIN = "http://localhost:3000";
const KEY = "SECRET-ADMIN-KEY-VALUE";
const BASE = "http://127.0.0.1:54321";
const USER_ID = "11111111-2222-3333-4444-555555555555";

const calls: string[] = [];
const getUser = vi.fn();
const getSession = vi.fn();
const rpc = vi.fn();
const signOut = vi.fn();
const maybeSingle = vi.fn();
const fetchMock = vi.fn();

const userWith = (identities: unknown[], appProvider?: string) => ({
  data: {
    user: {
      id: USER_ID,
      email: "someone@example.com",
      app_metadata: appProvider ? { provider: appProvider } : {},
      identities,
    },
  },
  error: null,
});
const kakaoUser = userWith(
  [{ provider: "kakao", id: "777", identity_data: { provider_id: "777" } }],
  "kakao",
);
const googleUser = userWith([{ provider: "google", id: "g1" }], "google");

const noConsent = {
  data: { terms_version: null, privacy_version: null },
  error: null,
};
const oldConsent = {
  data: {
    terms_version: "terms-2026-01-01",
    privacy_version: "privacy-2026-01-01",
  },
  error: null,
};

const post = (qs = "", headers: Record<string, string> = {}) =>
  POST(
    new Request(`${ORIGIN}/auth/consent/decline${qs}`, {
      method: "POST",
      headers,
    }),
  );

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);

beforeEach(() => {
  calls.length = 0;
  getUser.mockReset();
  getUser.mockImplementation(async () => {
    calls.push("getUser");
    return kakaoUser;
  });
  getSession.mockReset();
  getSession.mockImplementation(async () => {
    calls.push("getSession");
    return {
      data: { session: { provider_token: "GOOGLE-TOKEN" } },
      error: null,
    };
  });
  maybeSingle.mockReset();
  maybeSingle.mockImplementation(async () => {
    calls.push("readConsent");
    return noConsent;
  });
  rpc.mockReset();
  rpc.mockImplementation(async () => {
    calls.push("rpc");
    return { data: null, error: null };
  });
  signOut.mockReset();
  signOut.mockImplementation(async () => {
    calls.push("signOut");
    return { error: null };
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    calls.push(String(url).includes("/revoke") ? "google" : "kakao");
    return new Response(JSON.stringify({ id: 777 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { getUser, getSession, signOut },
    from: () => ({ select: () => ({ maybeSingle }) }),
    rpc,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/auth/consent/decline — 스위치를 끄면", () => {
  it("POST · GET 모두 404 이고 아무것도 건드리지 않는다", async () => {
    expect((await post()).status).toBe(404);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/auth/consent/decline — 스위치를 켜면", () => {
  beforeEach(() => {
    vi.stubEnv("MEMBERS_ENABLED", "true");
    vi.stubEnv("KAKAO_ADMIN_KEY", KEY);
    vi.stubEnv("KAKAO_API_BASE", BASE);
    vi.stubEnv("GOOGLE_API_BASE", BASE);
  });

  it("GET(링크 미리 불러오기) 은 지우지 않고 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Origin 이 다른 사이트(또는 'null')이면 403 이고 아무것도 하지 않는다", async () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost:3001",
      "null",
    ]) {
      expect((await post("", { origin })).status, origin).toBe(403);
    }
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Origin 이 같거나 없으면 통과한다", async () => {
    expect((await post("", { origin: ORIGIN })).status).toBe(303);
    expect((await post()).status).toBe(303);
  });

  it("첫 동의 전: 로그인 정보 → 동의 읽기 → 삭제 → 카카오 끊기 → 이 기기 로그아웃 순서로, 보던 화면으로 303 (알림 없음)", async () => {
    const res = await post("?next=%2Fwater%3Fst%3D105");
    expect(calls).toEqual([
      "getUser",
      "readConsent",
      "rpc",
      "kakao",
      "signOut",
    ]);
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water?st=105`);
    // 알림 표시가 붙지 않는다
    expect(res.headers.get("location")).not.toMatch(/login=|account=/);
  });

  it("카카오 끊기에는 지우기 전에 읽어 둔 회원번호와 어드민 키를 쓴다", async () => {
    await post();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(BASE);
    expect(JSON.stringify(init)).toContain("777");
    expect(JSON.stringify(init)).toContain(KEY);
  });

  it("예전 판에 동의했던 회원은 지우지 않고 로그아웃만 한다", async () => {
    maybeSingle.mockResolvedValue(oldConsent);
    const res = await post("?next=%2Fwater");
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water`);
  });

  it("동의 기록을 읽지 못하면 지우지 않고 로그아웃만 한다", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    const res = await post();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
  });

  it("로그인 정보를 읽지 못하면 지우지 않고 로그아웃만 한다", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await post();
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
  });

  it("삭제가 실패하면 끊기는 하지 않고 로그아웃은 하고 보던 화면으로 간다 (남은 계정은 O2)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "SECRET-RAW-MESSAGE" },
    });
    const res = await post("?next=%2Fwater");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water`);
    expect(logged()).toContain("XX000");
    expect(logged()).not.toContain("SECRET-RAW-MESSAGE");
  });

  it("구글 회원 + 세션에 공급자 토큰이 있으면 구글 연결을 끊는다", async () => {
    getUser.mockResolvedValue(googleUser);
    await post();
    expect(calls).toContain("google");
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toContain("GOOGLE-TOKEN");
  });

  it("구글 회원 + 토큰이 없으면 끊기를 건너뛰고 나가기는 끝난다", async () => {
    getUser.mockResolvedValue(googleUser);
    getSession.mockResolvedValue({
      data: { session: { provider_token: null } },
      error: null,
    });
    const res = await post();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
  });

  it("끊기가 실패해도 알림은 늘지 않는다 (삭제는 이미 끝남)", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 500 }));
    const res = await post("?next=%2Fwater");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water`);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("위험한 next 는 / 로 바뀐다 (다른 사이트 · 동의 화면 자신)", async () => {
    for (const next of [
      "https://evil.example/",
      "//evil.example",
      "/consent?next=%2Fwater",
    ]) {
      const res = await post(`?next=${encodeURIComponent(next)}`);
      expect(res.headers.get("location"), next).toBe(`${ORIGIN}/`);
    }
  });

  it("서버 기록에 토큰 · 어드민 키 · 이메일 · 회원 번호가 없다", async () => {
    getUser.mockResolvedValue(googleUser);
    fetchMock.mockResolvedValue(new Response("no", { status: 400 }));
    await post();
    const text = logged();
    expect(text).not.toContain("GOOGLE-TOKEN");
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("someone@example.com");
    expect(text).not.toContain(USER_ID);
  });
});
