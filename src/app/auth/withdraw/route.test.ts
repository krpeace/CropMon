import { createHash } from "node:crypto";

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

const calls: string[] = [];
const getUser = vi.fn();
const rpc = vi.fn();
const signOut = vi.fn();
const signInWithOAuth = vi.fn();
const fetchMock = vi.fn();

const kakaoUser = {
  data: {
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      email: "someone@example.com",
      identities: [
        { provider: "kakao", id: "777", identity_data: { provider_id: "777" } },
      ],
    },
  },
  error: null,
};

/** 폼 POST. 기본은 "위 내용을 확인했어요" 칸을 켠 채(confirm=on). */
const userWith = (identities: unknown[], appProvider?: string) => ({
  data: {
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      email: "someone@example.com",
      app_metadata: appProvider ? { provider: appProvider } : {},
      identities,
    },
  },
  error: null,
});
const who = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);
const USER_ID = "11111111-2222-3333-4444-555555555555";

const post = (
  headers: Record<string, string> = {},
  body: string | null = "confirm=on",
) =>
  POST(
    new Request(`${ORIGIN}/auth/withdraw`, {
      method: "POST",
      headers: {
        ...(body === null
          ? {}
          : { "content-type": "application/x-www-form-urlencoded" }),
        ...headers,
      },
      body,
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
  signInWithOAuth.mockReset();
  signInWithOAuth.mockImplementation(async () => {
    calls.push("signIn");
    return {
      data: { url: "http://127.0.0.1:54321/auth/v1/authorize?x=1" },
      error: null,
    };
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    calls.push("kakao");
    return new Response(JSON.stringify({ id: 777 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { getUser, signOut, signInWithOAuth },
    rpc,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/auth/withdraw — 스위치를 끄면", () => {
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

describe("/auth/withdraw — 스위치를 켜면", () => {
  beforeEach(() => {
    vi.stubEnv("MEMBERS_ENABLED", "true");
    vi.stubEnv("KAKAO_ADMIN_KEY", KEY);
    vi.stubEnv("KAKAO_API_BASE", BASE);
  });

  it("GET(링크 미리 불러오기) 은 탈퇴시키지 않고 405", async () => {
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
      expect((await post({ origin })).status, origin).toBe(403);
    }
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Origin 이 같거나 없으면 통과한다", async () => {
    expect((await post({ origin: ORIGIN })).status).toBe(303);
    expect((await post()).status).toBe(303);
  });

  it("확인 칸(confirm)이 없으면 아무것도 하지 않고 /account/withdraw?withdraw=confirm — 화면의 막기와 별개로 서버도 본다", async () => {
    for (const body of [null, "", "confirm=", "other=on", "confirm=yes"]) {
      const res = await post({}, body);
      expect(res.status, String(body)).toBe(303);
      expect(res.headers.get("location"), String(body)).toBe(
        `${ORIGIN}/account/withdraw?withdraw=confirm`,
      );
    }
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("카카오 회원: 지우기 전에 읽기 → delete_my_account → 카카오 끊기 → 로그아웃, 303 /?account=withdrawn", async () => {
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
    expect(calls).toEqual(["getUser", "rpc", "kakao", "signOut"]);
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/user/unlink`);
    expect(new Headers(init.headers).get("authorization")).toBe(
      `KakaoAK ${KEY}`,
    );
    expect(String(init.body)).toBe("target_id_type=user_id&target_id=777");
  });

  it("로그아웃은 이 기기 세션만 지운다 (이미 지워진 회원이라 서버에 묻지 않는다)", async () => {
    await post();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("카카오 끊기가 실패해도 탈퇴는 끝난 것 — /?account=withdrawn-unlinked", async () => {
    fetchMock.mockImplementation(async () => {
      calls.push("kakao");
      return new Response("{}", { status: 401 });
    });
    const res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(calls).toEqual(["getUser", "rpc", "kakao", "signOut"]);
  });

  it("어드민 키가 없으면 카카오를 부르지 않고 withdrawn-unlinked", async () => {
    vi.stubEnv("KAKAO_ADMIN_KEY", "");
    const res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual(["getUser", "rpc", "signOut"]);
  });

  it("네이버 회원인데 네이버 스위치가 꺼져 있으면 재로그인 없이 바로 탈퇴 + 안내 한 줄(withdrawn-unlinked), 카카오는 부르지 않는다", async () => {
    getUser.mockImplementationOnce(async () => {
      calls.push("getUser");
      return userWith([
        { provider: "custom:naver", id: "9", identity_data: {} },
      ]);
    });
    const res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(calls).toEqual(["getUser", "rpc", "signOut"]);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delete_my_account 가 실패하면 아무것도 끊지 않는다 — 로그아웃도 안 하고 /account/withdraw?withdraw=failed", async () => {
    rpc.mockImplementation(async () => {
      calls.push("rpc");
      return {
        data: null,
        error: { code: "42501", message: "x someone@example.com" },
      };
    });
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(calls).toEqual(["getUser", "rpc"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(logged()).toContain("withdraw");
    expect(logged()).toContain("42501");
    expect(logged()).not.toContain("someone@example.com");
  });

  it("delete_my_account 가 던져도 같다 (끊기 · 로그아웃 없음)", async () => {
    rpc.mockRejectedValueOnce(new Error("boom someone@example.com"));
    const res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(logged()).not.toContain("someone@example.com");
  });

  it("서버 클라이언트를 못 만들어도 실패 쪽으로 (던지지 않는다)", async () => {
    makeClient.mockRejectedValueOnce(new Error("no env"));
    const res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
  });

  it("로그인 정보를 못 읽으면(비로그인 · 오류) 아무것도 하지 않고 /account/withdraw?withdraw=failed — 카카오 회원번호를 모른 채 지우지 않는다", async () => {
    getUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: null,
    }));
    let res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    getUser.mockImplementationOnce(async () => {
      throw new Error("hang up");
    });
    res = await post();
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("로그아웃이 던져도 탈퇴 결과는 그대로 (303)", async () => {
    signOut.mockRejectedValueOnce(new Error("later"));
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
  });

  it("서버 기록 어디에도 키 · 메일 · 카카오 회원번호가 없다", async () => {
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 401 }),
    );
    await post();
    for (const secret of [KEY, "someone@example.com", "777"]) {
      expect(logged(), secret).not.toContain(secret);
    }
  });
});

describe("/auth/withdraw — 구글 · 네이버 회원은 재인증으로 시작한다 (이슈 #197, 결정 0068)", () => {
  const googleUser = () =>
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userWith(
        [{ provider: "google", id: "g1", identity_data: {} }],
        "google",
      );
    });
  beforeEach(() => {
    vi.stubEnv("MEMBERS_ENABLED", "true");
    vi.stubEnv("KAKAO_ADMIN_KEY", KEY);
    vi.stubEnv("KAKAO_API_BASE", BASE);
    googleUser();
  });

  it("아직 아무것도 지우지 않고 공급자 로그인 화면으로 303 — 탈퇴 함수 · 카카오 · 로그아웃 호출 0", async () => {
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://127.0.0.1:54321/auth/v1/authorize?x=1",
    );
    expect(calls).toEqual(["getUser", "signIn"]);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("구글: 계정 고르기(prompt=select_account), 돌아올 곳은 기존 콜백 + flow=withdraw", async () => {
    await post();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${ORIGIN}/auth/callback?flow=withdraw`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("탈퇴 의도 쿠키 cm_wd: HttpOnly · SameSite=Lax · Path=/auth/callback · Max-Age=300, 내용은 회원 번호의 해시 · 공급자 · 만료(회원 번호 자체는 없음)", async () => {
    const res = await post();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cm_wd=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toContain("Path=/auth/callback");
    expect(setCookie).toContain("Max-Age=300");
    // http 주소(내 컴퓨터)에서는 Secure 를 안 붙인다 — 붙이면 브라우저가 저장하지 않는다
    expect(setCookie).not.toMatch(/Secure/i);
    const value = /cm_wd=([^;]+)/.exec(setCookie)![1];
    const text = Buffer.from(value, "base64url").toString("utf8");
    const json = JSON.parse(text);
    expect(json).toMatchObject({ v: 1, who: who(USER_ID), p: "google" });
    expect(typeof json.exp).toBe("number");
    expect(setCookie).not.toContain(USER_ID);
    expect(text).not.toContain(USER_ID);
  });

  it("https 주소에서는 Secure 가 붙는다", async () => {
    const res = await POST(
      new Request("https://cropmon.example/auth/withdraw", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "confirm=on",
      }),
    );
    expect(res.headers.get("set-cookie") ?? "").toMatch(/Secure/i);
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "https://cropmon.example/auth/callback?flow=withdraw",
        }),
      }),
    );
  });

  it("네이버(스위치 켬): custom:naver, 재인증 옵션 auth_type=reauthenticate", async () => {
    vi.stubEnv("NAVER_LOGIN_ENABLED", "true");
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userWith(
        [{ provider: "custom:naver", id: "n1", identity_data: {} }],
        "custom:naver",
      );
    });
    const res = await post();
    expect(res.status).toBe(303);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "custom:naver",
      options: {
        redirectTo: `${ORIGIN}/auth/callback?flow=withdraw`,
        skipBrowserRedirect: true,
        queryParams: { auth_type: "reauthenticate" },
      },
    });
    const value = /cm_wd=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    expect(JSON.parse(Buffer.from(value, "base64url").toString("utf8")).p).toBe(
      "naver",
    );
  });

  it("카카오 + 구글 회원도 구글로 재인증한다 (카카오는 콜백에서 어드민 키로)", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userWith(
        [
          {
            provider: "kakao",
            id: "777",
            identity_data: { provider_id: "777" },
          },
          { provider: "google", id: "g1", identity_data: {} },
        ],
        "kakao",
      );
    });
    await post();
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("카카오만 있는 회원은 재로그인 없이 L6-1 그대로 (signInWithOAuth 호출 0, 쿠키 없음)", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return kakaoUser;
    });
    const res = await post();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie") ?? "").not.toContain("cm_wd");
  });

  it("공급자 시작에 실패하면(오류 · 주소 없음 · 던짐) 쿠키를 심지 않고 아무것도 지우지 않은 채 ?withdraw=failed", async () => {
    for (const impl of [
      async () => ({ data: { url: null }, error: { code: "boom" } }),
      async () => ({ data: { url: null }, error: null }),
      async () => {
        throw new Error("no network someone@example.com");
      },
    ]) {
      signInWithOAuth.mockImplementationOnce(impl);
      const res = await post();
      expect(res.headers.get("location")).toBe(
        `${ORIGIN}/account/withdraw?withdraw=failed`,
      );
      expect(res.headers.get("set-cookie") ?? "").not.toContain("cm_wd=");
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(logged()).not.toContain("someone@example.com");
  });

  it("확인 칸이 없으면 재인증도 시작하지 않는다", async () => {
    const res = await post({}, "");
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=confirm`,
    );
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
