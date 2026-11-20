import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { LEGAL_DOCS } from "@/domain/legal";
import { encodeIntent } from "@/domain/withdraw-intent";

import { GET } from "./route";

// 탈퇴 재인증 콜백 (이슈 #197, 결정 0068). 가장 중요한 것: 다른 계정으로 재로그인하면 **아무것도 지우지 않는다** (delete_my_account 호출 0).

vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const makeClient = vi.mocked(createSupabaseServerClient);

const ORIGIN = "http://localhost:3000";
const USER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-8888-7777-6666-555555555555";
const EMAIL = "someone@example.com";
const TOKEN = "SECRET-PROVIDER-TOKEN";
const ADMIN_KEY = "SECRET-ADMIN-KEY";
const NAVER_ID = "naver-client-id";
const NAVER_SECRET = "SECRET-NAVER-CLIENT-SECRET";
const who = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);

const calls: string[] = [];
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select }));
const fetchMock = vi.fn();

const identity = (provider: string, id = "i1", data: object = {}) => ({
  provider,
  id,
  identity_data: data,
});
const userOf = (id: string, identities: unknown[]) => ({
  data: { user: { id, email: EMAIL, app_metadata: {}, identities } },
  error: null,
});

const intentFor = (provider: "google" | "naver", id = USER_ID) =>
  `cm_wd=${encodeIntent({ who: who(id), provider, nowMs: Date.now() })}`;

const call = (qs: string, cookie?: string) =>
  GET(
    new Request(`${ORIGIN}/auth/callback${qs}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
const withdrawCall = (cookie?: string, extra = "") =>
  call(`?flow=withdraw&code=abc${extra}`, cookie);

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const clearsIntent = (res: Response) => {
  const header = res.headers.get("set-cookie") ?? "";
  return (
    /cm_wd=;/.test(header) &&
    header.includes("Path=/auth/callback") &&
    /Max-Age=0/i.test(header) &&
    /Expires=Thu, 01 Jan 1970/i.test(header)
  );
};
const deleted = () =>
  rpc.mock.calls.filter(([name]) => name === "delete_my_account").length;

beforeEach(() => {
  calls.length = 0;
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockImplementation(async () => {
    calls.push("exchange");
    return {
      data: { session: { provider_token: TOKEN }, user: { id: USER_ID } },
      error: null,
    };
  });
  getUser.mockReset();
  getUser.mockImplementation(async () => {
    calls.push("getUser");
    return userOf(USER_ID, [identity("google")]);
  });
  signOut.mockReset();
  signOut.mockImplementation(async () => {
    calls.push("signOut");
    return { error: null };
  });
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    calls.push(name === "delete_my_account" ? "delete" : `rpc:${name}`);
    return { data: null, error: null };
  });
  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({
    data: {
      terms_version: LEGAL_DOCS.terms.version,
      privacy_version: LEGAL_DOCS.privacy.version,
    },
    error: null,
  });
  select.mockClear();
  from.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    calls.push(
      String(url).includes("/revoke")
        ? "google-revoke"
        : String(url).includes("oauth2.0")
          ? "naver-delete"
          : "kakao-unlink",
    );
    return new Response(JSON.stringify({ result: "success", id: 1 }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  makeClient.mockReset();
  makeClient.mockResolvedValue({
    auth: { exchangeCodeForSession, getUser, signOut },
    rpc,
    from,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("MEMBERS_ENABLED", "true");
  vi.stubEnv("GOOGLE_API_BASE", "http://127.0.0.1:54321");
  vi.stubEnv("NAVER_API_BASE", "http://127.0.0.1:54321");
  vi.stubEnv("KAKAO_API_BASE", "http://127.0.0.1:54321");
  vi.stubEnv("KAKAO_ADMIN_KEY", ADMIN_KEY);
  vi.stubEnv("NAVER_CLIENT_ID", NAVER_ID);
  vi.stubEnv("NAVER_CLIENT_SECRET", NAVER_SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("스위치를 끄면", () => {
  it("flow=withdraw 도 404 — 코드 교환 · 탈퇴 호출 0", async () => {
    vi.stubEnv("MEMBERS_ENABLED", "");
    const res = await withdrawCall(intentFor("google"));
    expect(res.status).toBe(404);
    expect(makeClient).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(deleted()).toBe(0);
  });
});

describe("같은 계정으로 다시 로그인하면 — 지우고 끊는다", () => {
  it("순서: 교환 → 로그인 정보 읽기 → delete_my_account → 구글 취소 → 로그아웃, /?account=withdrawn, 의도 쿠키 지움", async () => {
    const res = await withdrawCall(intentFor("google"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
    expect(calls).toEqual([
      "exchange",
      "getUser",
      "delete",
      "google-revoke",
      "signOut",
    ]);
    expect(clearsIntent(res)).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("구글 취소 요청: 방금 받은 공급자 토큰을 본문으로 (주소에는 없음)", async () => {
    await withdrawCall(intentFor("google"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:54321/revoke");
    expect(String(init.body)).toBe(`token=${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });

  it("일반 로그인 일(ensure_my_member · 동의 읽기 · login=ok)은 하지 않는다", async () => {
    const res = await withdrawCall(intentFor("google"));
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["delete_my_account"]);
    expect(from).not.toHaveBeenCalled();
    expect(res.headers.get("location")).not.toContain("login=");
  });

  it("next 같은 주소 값은 읽지 않는다 (남의 사이트로 보낼 수 없음)", async () => {
    const res = await withdrawCall(
      intentFor("google"),
      "&next=https%3A%2F%2Fevil.example",
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
  });

  it("구글 취소가 실패해도 탈퇴는 끝 — withdrawn-unlinked", async () => {
    fetchMock.mockImplementation(async () => {
      calls.push("google-revoke");
      return new Response("{}", { status: 400 });
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(deleted()).toBe(1);
    expect(calls).toEqual([
      "exchange",
      "getUser",
      "delete",
      "google-revoke",
      "signOut",
    ]);
  });

  it("공급자 토큰이 응답에 없으면(예: 사용자 지정 공급자) 끊기는 실패로 보고 탈퇴는 진행 — 취소 요청도 안 보낸다", async () => {
    exchangeCodeForSession.mockImplementation(async () => {
      calls.push("exchange");
      return { data: { session: {}, user: { id: USER_ID } }, error: null };
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(deleted()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("카카오 + 구글: 구글 취소와 카카오 어드민 키 끊기를 둘 다 하면 안내 없이 끝", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(USER_ID, [
        identity("kakao", "k1", { provider_id: "777" }),
        identity("google"),
      ]);
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
    expect(calls).toEqual([
      "exchange",
      "getUser",
      "delete",
      "google-revoke",
      "kakao-unlink",
      "signOut",
    ]);
    const kakao = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/v1/user/unlink"),
    )!;
    expect(String((kakao[1] as RequestInit).body)).toBe(
      "target_id_type=user_id&target_id=777",
    );
  });

  it("카카오 + 구글인데 구글만 실패하면 안내 한 줄", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(USER_ID, [
        identity("kakao", "k1", { provider_id: "777" }),
        identity("google"),
      ]);
    });
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(
        String(url).includes("/revoke") ? "google-revoke" : "kakao-unlink",
      );
      return new Response("{}", {
        status: String(url).includes("/revoke") ? 400 : 200,
      });
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
  });

  it("네이버: 토큰 삭제 요청에 클라이언트 아이디 · 시크릿 · 토큰이 본문으로 간다 → withdrawn", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(USER_ID, [identity("custom:naver")]);
    });
    const res = await withdrawCall(intentFor("naver"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
    expect(calls).toEqual([
      "exchange",
      "getUser",
      "delete",
      "naver-delete",
      "signOut",
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:54321/oauth2.0/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "delete",
      client_id: NAVER_ID,
      client_secret: NAVER_SECRET,
      access_token: TOKEN,
      service_provider: "NAVER",
    });
    expect(url).not.toContain(NAVER_SECRET);
  });

  it("네이버 클라이언트 아이디 · 시크릿 변수가 없으면 끊기를 건너뛰고(실패 취급) 탈퇴는 진행", async () => {
    vi.stubEnv("NAVER_CLIENT_SECRET", "");
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(USER_ID, [identity("custom:naver")]);
    });
    const res = await withdrawCall(intentFor("naver"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdrawn-unlinked`,
    );
    expect(deleted()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("다른 계정으로 로그인했으면 — 아무것도 지우지 않는다 (핵심)", () => {
  beforeEach(() => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(OTHER_ID, [identity("google", "other")]);
    });
  });

  it("delete_my_account 호출 0 · 끊기 호출 0 · 이 기기 쿠키만 지움 · /?account=withdraw-other", async () => {
    const res = await withdrawCall(intentFor("google"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdraw-other`,
    );
    expect(deleted()).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(calls).toEqual(["exchange", "getUser", "signOut"]);
    expect(clearsIntent(res)).toBe(true);
  });

  it("카카오 + 구글 회원이라도 마찬가지 (카카오 어드민 키 끊기도 안 부른다)", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(OTHER_ID, [
        identity("kakao", "k1", { provider_id: "888" }),
        identity("google"),
      ]);
    });
    await withdrawCall(intentFor("google"));
    expect(deleted()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("해시가 한 글자만 달라도 다른 계정이다", async () => {
    const real = who(USER_ID);
    const off = `${real.slice(0, 15)}${real.endsWith("0") ? "1" : "0"}`;
    const cookie = `cm_wd=${encodeIntent({ who: off, provider: "google", nowMs: Date.now() })}`;
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(USER_ID, [identity("google")]);
    });
    const res = await withdrawCall(cookie);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/?account=withdraw-other`,
    );
    expect(deleted()).toBe(0);
  });
});

describe("의도 표시가 없거나 만료 · 깨짐이면 — 코드 교환도 하지 않는다", () => {
  const expiredCookie = `cm_wd=${encodeIntent({
    who: who(USER_ID),
    provider: "google",
    nowMs: Date.now() - 3_600_000,
  })}`;

  for (const [name, cookie] of [
    ["쿠키 없음", undefined],
    ["깨진 값", "cm_wd=broken!!"],
    ["만료", expiredCookie],
  ] as const) {
    it(`${name}: 원래 세션을 그대로 두고(교환 · 로그아웃 0) /account/withdraw?withdraw=expired`, async () => {
      const res = await withdrawCall(cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `${ORIGIN}/account/withdraw?withdraw=expired`,
      );
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(deleted()).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(clearsIntent(res)).toBe(true);
    });
  }
});

describe("취소 · 오류 · 실패 — 원래 세션은 그대로", () => {
  it("공급자 화면에서 취소(access_denied) → 말 없이 /account/withdraw (교환 · 로그아웃 0)", async () => {
    for (const qs of [
      "?flow=withdraw&error=access_denied",
      "?flow=withdraw&error=server_error&error_code=access_denied",
      "?flow=withdraw&error_description=User+denied+access_denied",
    ]) {
      const res = await call(qs, intentFor("google"));
      expect(res.headers.get("location"), qs).toBe(
        `${ORIGIN}/account/withdraw`,
      );
      expect(clearsIntent(res), qs).toBe(true);
    }
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(deleted()).toBe(0);
  });

  it("그 밖의 공급자 오류 → /account/withdraw?withdraw=failed (교환 · 로그아웃 0)", async () => {
    const res = await call(
      "?flow=withdraw&error=server_error",
      intentFor("google"),
    );
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearsIntent(res)).toBe(true);
  });

  it("코드가 없으면(오류가 # 뒤로 옴) ?withdraw=failed", async () => {
    const res = await call("?flow=withdraw", intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("코드 교환이 실패하면(오류 · 던짐) 원래 세션 그대로 ?withdraw=failed — 로그아웃도 안 한다", async () => {
    exchangeCodeForSession.mockImplementationOnce(async () => ({
      data: { session: null, user: null },
      error: { code: "flow_state_not_found" },
    }));
    let res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    exchangeCodeForSession.mockImplementationOnce(async () => {
      throw new Error(`boom ${EMAIL}`);
    });
    res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(deleted()).toBe(0);
    expect(logged()).toContain("flow_state_not_found");
    expect(logged()).not.toContain(EMAIL);
  });

  it("서버 클라이언트를 못 만들어도 던지지 않고 ?withdraw=failed", async () => {
    makeClient.mockRejectedValueOnce(new Error("no env"));
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(clearsIntent(res)).toBe(true);
  });

  it("새 세션의 로그인 정보를 못 읽으면 알 수 없는 세션이므로 이 기기 쿠키를 지우고 ?withdraw=failed — 아무것도 안 지움", async () => {
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return { data: { user: null }, error: null };
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(deleted()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delete_my_account 가 실패하면 아무것도 끊지 않고 ?withdraw=failed — 로그아웃도 안 한다 (같은 회원의 새 세션이라 다시 시도할 수 있게)", async () => {
    rpc.mockImplementation(async () => {
      calls.push("delete");
      return { data: null, error: { code: "42501", message: `x ${EMAIL}` } };
    });
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearsIntent(res)).toBe(true);
    expect(logged()).toContain("42501");
    expect(logged()).not.toContain(EMAIL);
  });

  it("delete_my_account 가 던져도 같다", async () => {
    rpc.mockRejectedValueOnce(new Error("boom"));
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/account/withdraw?withdraw=failed`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("로그아웃이 던져도 탈퇴 결과는 그대로", async () => {
    signOut.mockRejectedValueOnce(new Error("later"));
    const res = await withdrawCall(intentFor("google"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?account=withdrawn`);
  });
});

describe("서버 기록", () => {
  it("공급자 토큰 · 비밀 · 회원 번호 · 해시 · 메일이 어디에도 없다 (실패 갈래를 모두 지나게 해서)", async () => {
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 400 }),
    );
    await withdrawCall(intentFor("google"));
    getUser.mockImplementation(async () => {
      calls.push("getUser");
      return userOf(OTHER_ID, [identity("google")]);
    });
    await withdrawCall(intentFor("google"));
    await withdrawCall(undefined);
    for (const secret of [
      TOKEN,
      ADMIN_KEY,
      NAVER_SECRET,
      USER_ID,
      OTHER_ID,
      who(USER_ID),
      EMAIL,
    ]) {
      expect(logged(), secret).not.toContain(secret);
    }
  });
});

describe("일반 로그인 콜백은 남은 의도 쿠키를 지운다 (탈퇴하려다 그만두고 그냥 로그인한 경우)", () => {
  it("flow 가 없는 콜백이 cm_wd 를 가진 요청이면 응답에서 지운다, 로그인은 평소대로", async () => {
    const res = await call("?code=abc&next=%2Fwater", intentFor("google"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/water?login=ok`);
    expect(clearsIntent(res)).toBe(true);
    expect(deleted()).toBe(0);
  });

  it("cm_wd 가 없는 일반 콜백은 쿠키를 건드리지 않는다", async () => {
    const res = await call("?code=abc&next=%2Fwater");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("cm_wd");
  });
});
