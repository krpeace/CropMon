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
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    calls.push("kakao");
    return new Response(JSON.stringify({ id: 777 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { getUser, signOut },
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

  it("구글 · 네이버 회원은 카카오를 부르지 않고 안내 한 줄(withdrawn-unlinked)", async () => {
    for (const provider of ["google", "custom:naver"]) {
      calls.length = 0;
      getUser.mockImplementationOnce(async () => {
        calls.push("getUser");
        return {
          data: {
            user: {
              id: "u",
              email: null,
              identities: [{ provider, id: "9", identity_data: {} }],
            },
          },
          error: null,
        };
      });
      const res = await post();
      expect(res.headers.get("location"), provider).toBe(
        `${ORIGIN}/?account=withdrawn-unlinked`,
      );
      expect(calls, provider).toEqual(["getUser", "rpc", "signOut"]);
    }
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
