import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateProxySession } from "@/app/_lib/supabase/proxy-client";

import { proxy } from "./proxy";

// 세션 갱신(Supabase 를 부르는 곳)은 가짜로 바꾼다. 얼마나 불렸는지가 이 시험의 핵심이다.
vi.mock("@/app/_lib/supabase/proxy-client", () => ({
  updateProxySession: vi.fn(),
}));
const session = vi.mocked(updateProxySession);

beforeEach(() => {
  session.mockReset();
  session.mockImplementation(async () => ({
    response: NextResponse.next(),
    signedIn: false,
  }));
});
afterEach(() => vi.unstubAllEnvs());

// ── 아래 다섯 개는 middleware.test.ts 에서 옮긴 것이다. 기대값은 그대로이고, proxy 가 async 라서 await 만 붙었다. ──
describe("proxy — 폐지·휴지 지점 주소 이동 (결정 0037)", () => {
  it("폐지 지점(st=116 관악산)으로 들어오면 기본 지점(st=101)과 from=116 으로 이동한다", async () => {
    const req = new NextRequest(
      "http://localhost:3000/temperature?st=116&crop=apple",
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/temperature");
    expect(location.searchParams.get("st")).toBe("101");
    expect(location.searchParams.get("from")).toBe("116");
    expect(location.searchParams.get("crop")).toBe("apple");
  });

  it("폐지 지점(st=175 진도 첨찰산)으로 들어오면 101과 from=175 로 이동한다", async () => {
    const req = new NextRequest("http://localhost:3000/water?st=175");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/water");
    expect(location.searchParams.get("st")).toBe("101");
    expect(location.searchParams.get("from")).toBe("175");
  });

  it("운영 중인 지점(st=101 춘천, st=108 서울)은 이동 없이 통과한다", async () => {
    for (const st of ["101", "108"]) {
      const req = new NextRequest(`http://localhost:3000/temperature?st=${st}`);
      const res = await proxy(req);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("사전에 없는 번호(st=999)는 이동 없이 그대로 통과한다 (기존 처리 유지)", async () => {
    const req = new NextRequest("http://localhost:3000/temperature?st=999");
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("숫자가 아닌 값(st=abc)도 이동 없이 통과한다", async () => {
    const req = new NextRequest("http://localhost:3000/?st=abc");
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });
});

// ── 회원제 스위치와 로그인 필요 주소 (이슈 #182, 결정 0061) ──
const COOKIE = "sb-abcdefgh-auth-token=session-value";
const VERIFIER = "sb-abcdefgh-auth-token-code-verifier=pkce-value";
const get = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });

describe("proxy — 스위치를 끄면 지금 알파와 똑같다", () => {
  it("기본(스위치 없음)은 끔: 로그인 쿠키가 있어도 Supabase 를 부르지 않고, 로그인 필요 주소도 막지 않는다", async () => {
    for (const path of ["/account", "/farm/settings", "/water", "/"]) {
      const res = await proxy(get(path, COOKIE));
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(session).not.toHaveBeenCalled();
  });

  it('"true" 가 아닌 값은 끔', async () => {
    for (const v of ["", "false", "1", "True"]) {
      vi.stubEnv("MEMBERS_ENABLED", v);
      const res = await proxy(get("/account", COOKIE));
      expect(res.headers.get("location"), v).toBeNull();
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("폐지 지점 돌려보내기는 스위치와 상관없이 같다", async () => {
    for (const v of [undefined, "true"]) {
      if (v) vi.stubEnv("MEMBERS_ENABLED", v);
      const res = await proxy(get("/water?st=116"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).searchParams.get("st")).toBe(
        "101",
      );
    }
    expect(session).not.toHaveBeenCalled();
  });
});

describe("proxy — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("로그인 쿠키가 없는 요청은 Supabase 를 부르지 않고 그냥 통과한다 (방문자 대부분)", async () => {
    for (const path of [
      "/",
      "/water?st=105&crop=apple",
      "/my-farm",
      "/more",
      "/api/health",
      "/auth/login?provider=kakao",
    ]) {
      const res = await proxy(get(path));
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("콜백 + 코드 검증값 쿠키만 있는 요청도 Supabase 를 부르지 않는다 (로그인 쿠키가 아직 없음)", async () => {
    const res = await proxy(get("/auth/callback?code=abc&next=%2F", VERIFIER));
    expect(res.headers.get("location")).toBeNull();
    expect(session).not.toHaveBeenCalled();
  });

  it("쿠키가 없고 로그인 필요 주소이면 /?login=1&next=<원래 주소> 로 보낸다 (Supabase 호출 0)", async () => {
    const res = await proxy(get("/farm/settings?st=105&crop=apple"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("login")).toBe("1");
    expect(location.searchParams.get("next")).toBe(
      "/farm/settings?st=105&crop=apple",
    );
    for (const path of ["/farm/crop", "/account", "/account/withdraw"]) {
      const r = await proxy(get(path));
      expect(r.status, path).toBe(307);
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("검증값 쿠키만 있고 로그인 필요 주소이면 마찬가지로 로그인으로 보낸다 (호출 0)", async () => {
    const res = await proxy(get("/account", VERIFIER));
    expect(res.status).toBe(307);
    expect(
      new URL(res.headers.get("location")!).searchParams.get("login"),
    ).toBe("1");
    expect(session).not.toHaveBeenCalled();
  });

  it("/my-farm(비회원 미리보기)은 쿠키가 없어도 막지 않는다", async () => {
    const res = await proxy(get("/my-farm"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("로그인 쿠키가 있으면 세션을 한 번 갱신하고, 로그인돼 있으면 그 응답으로 통과한다", async () => {
    const refreshed = NextResponse.next();
    refreshed.cookies.set("sb-abcdefgh-auth-token", "new-session");
    session.mockResolvedValue({ response: refreshed, signedIn: true });
    const res = await proxy(get("/account", COOKIE));
    expect(session).toHaveBeenCalledTimes(1);
    expect(res).toBe(refreshed);
    expect(res.headers.get("location")).toBeNull();
  });

  it("로그인 쿠키가 있어도 로그인이 풀려 있으면(만료) 로그인 필요 주소는 로그인으로 보내고, 갱신된 쿠키를 같이 싣는다", async () => {
    const refreshed = NextResponse.next();
    refreshed.cookies.set("sb-abcdefgh-auth-token", "", { maxAge: 0 });
    session.mockResolvedValue({ response: refreshed, signedIn: false });
    const res = await proxy(get("/farm/crop?st=105", COOKIE));
    expect(session).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("login")).toBe("1");
    expect(location.searchParams.get("next")).toBe("/farm/crop?st=105");
    expect(res.headers.get("set-cookie")).toContain("sb-abcdefgh-auth-token");
  });

  it("로그인이 풀려 있어도 공개 주소는 그냥 통과한다", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: false,
    });
    const res = await proxy(get("/water?st=105", COOKIE));
    expect(session).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBeNull();
  });

  it("로그인 필요 주소를 인코딩 · 점으로 가려도 비켜 가지 못한다", async () => {
    for (const path of ["/%61ccount", "/water/../account", "//account"]) {
      const res = await proxy(get(path));
      expect(res.status, path).toBe(307);
    }
  });
});
