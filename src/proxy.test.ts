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

// ── 표시 쿠키 cm_m (이슈 #189, 결정 0064): 헤더가 "스위치 켬/끔 · 로그인함"을 알게 하는 값. 개인 값은 없다. ──
const STATE = "cm_m";
const withState = (value: string, extra = "") =>
  `${STATE}=${value}${extra ? `; ${extra}` : ""}`;

describe("proxy — 표시 쿠키 (스위치 끔: 지금 알파와 같다)", () => {
  it("쿠키 없는 방문자에게는 아무 쿠키도 안 심고 Supabase 를 안 부른다", async () => {
    for (const path of ["/", "/water?st=105", "/auth/login?provider=kakao"]) {
      const res = await proxy(get(path));
      expect(res.headers.get("set-cookie"), path).toBeNull();
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("켰다가 끈 뒤: 남아 있는 cm_m 은 첫 요청에서 지운다 (그 밖의 쿠키는 안 건드림)", async () => {
    for (const value of ["a", "i", "in", "an", "zzz"]) {
      const res = await proxy(get("/", withState(value, COOKIE)));
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie, value).toContain(`${STATE}=;`);
      expect(setCookie.toLowerCase(), value).toMatch(/max-age=0|expires=/);
      expect(setCookie).not.toContain("sb-abcdefgh");
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("로그인 필요 주소도 안 막고, 로그인 쿠키가 있어도 Supabase 를 안 부른다", async () => {
    const res = await proxy(get("/account", withState("i", COOKIE)));
    expect(res.headers.get("location")).toBeNull();
    expect(session).not.toHaveBeenCalled();
  });
});

describe("proxy — 표시 쿠키 (스위치 켬)", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));
  const valueOf = (res: Response) => {
    const raw = res.headers.get("set-cookie") ?? "";
    return new RegExp(`${STATE}=([^;]*)`).exec(raw)?.[1] ?? null;
  };

  it("쿠키 없는 방문자: a 를 심는다 — Supabase 호출 0", async () => {
    const res = await proxy(get("/water?st=105"));
    expect(valueOf(res)).toBe("a");
    expect(session).not.toHaveBeenCalled();
  });

  it("심는 쿠키는 자바스크립트가 읽을 수 있고(HttpOnly 없음) 경로 / · SameSite=Lax · 만료 없음", async () => {
    const raw = (await proxy(get("/"))).headers.get("set-cookie") ?? "";
    expect(raw.toLowerCase()).not.toContain("httponly");
    expect(raw).toMatch(/Path=\//i);
    expect(raw).toMatch(/SameSite=lax/i);
    expect(raw.toLowerCase()).not.toContain("max-age");
    expect(raw.toLowerCase()).not.toContain("expires");
  });

  it("https 로 오면 Secure, http(로컬)에서는 Secure 없음", async () => {
    const https = await proxy(new NextRequest("https://cropmon.example/water"));
    expect(https.headers.get("set-cookie")).toMatch(/Secure/i);
    const http = await proxy(get("/water"));
    expect(http.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("이미 같은 값이면 다시 쓰지 않는다", async () => {
    const res = await proxy(get("/water", withState("a")));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(session).not.toHaveBeenCalled();
  });

  it("로그인 쿠키가 없는데 cm_m=i 가 남아 있으면(로그아웃 뒤) a 로 고친다 — 호출 0", async () => {
    const res = await proxy(get("/", withState("i")));
    expect(valueOf(res)).toBe("a");
    expect(session).not.toHaveBeenCalled();
  });

  it("로그인함: 세션 확인 결과로 i 를 심는다 (확인은 지금처럼 한 번)", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    const res = await proxy(get("/water", withState("a", COOKIE)));
    expect(valueOf(res)).toBe("i");
    expect(session).toHaveBeenCalledTimes(1);
  });

  it("로그인함 + 이미 i 이면 다시 쓰지 않는다", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    const res = await proxy(get("/water", withState("i", COOKIE)));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("로그인이 풀려 있으면(만료) i 를 a 로 고친다 — 갱신된 세션 쿠키도 같이 간다", async () => {
    const refreshed = NextResponse.next();
    refreshed.cookies.set("sb-abcdefgh-auth-token", "", { maxAge: 0 });
    session.mockResolvedValue({ response: refreshed, signedIn: false });
    const res = await proxy(get("/water", withState("i", COOKIE)));
    expect(valueOf(res)).toBe("a");
    expect(res.headers.get("set-cookie")).toContain("sb-abcdefgh-auth-token");
  });

  it("로그인 필요 주소를 비로그인으로 열어 보내는 응답에도 쿠키를 싣는다", async () => {
    const res = await proxy(get("/farm/settings?st=105"));
    expect(res.status).toBe(307);
    expect(valueOf(res)).toBe("a");
  });

  it("네이버 스위치를 켜면 뒤에 n (an · in)", async () => {
    vi.stubEnv("NAVER_LOGIN_ENABLED", "true");
    expect(valueOf(await proxy(get("/")))).toBe("an");
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    expect(valueOf(await proxy(get("/", COOKIE)))).toBe("in");
  });

  it("네이버 스위치를 끄면 n 이 붙은 쿠키를 n 없는 값으로 고친다", async () => {
    const res = await proxy(get("/", withState("an")));
    expect(valueOf(res)).toBe("a");
  });

  it("폐지 지점 돌려보내기 응답은 쿠키를 만지지 않는다 (돌아간 요청에서 심는다)", async () => {
    const res = await proxy(get("/water?st=116"));
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

// ── 로그인 필요 쪽의 "지금 주소" 전달 (이슈 #191, 결정 0065): 공통 관문(requireMemberConsent)이 동의 뒤 돌아올 곳을 안다 ──
describe("proxy — 로그인함 + 로그인 필요 주소: x-cm-next 요청 머리", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));
  const seenHeader = () =>
    (session.mock.calls[0][0] as NextRequest).headers.get("x-cm-next");

  it("세션 확인에 넘기는 요청에 지금 주소(경로 + 검색어)를 실어 준다", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    await proxy(get("/farm/settings?st=105&crop=apple", COOKIE));
    expect(seenHeader()).toBe("/farm/settings?st=105&crop=apple");
  });

  it("밖에서 보낸 같은 이름의 머리는 믿지 않고 덮어쓴다", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    await proxy(
      new NextRequest("http://localhost:3000/account", {
        headers: { cookie: COOKIE, "x-cm-next": "https://evil.example" },
      }),
    );
    expect(seenHeader()).toBe("/account");
  });

  it("로그인 필요 주소가 아니면 머리를 지운다(밖에서 보낸 값도)", async () => {
    session.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
    });
    await proxy(
      new NextRequest("http://localhost:3000/water?st=105", {
        headers: { cookie: COOKIE, "x-cm-next": "/account" },
      }),
    );
    expect(seenHeader()).toBeNull();
  });

  it("스위치를 끄면 아무것도 안 한다 (세션 확인도 없음)", async () => {
    vi.stubEnv("MEMBERS_ENABLED", "");
    await proxy(get("/account", COOKIE));
    expect(session).not.toHaveBeenCalled();
  });
});

// ── 스위치 끔: 로그인 필요 목록의 주소는 "없는 주소"(404)로 돌린다 (이슈 #191, 결정 0065) ──
// /account(임시 쪽) · /consent 가 생겨도 끄면 지금 알파와 똑같이 404 여야 한다. 스트리밍 쪽에서 notFound() 를 부르면 상태가 200 이 되므로
// 프록시가 없는 주소로 다시 쓴다(rewrite) — 이동(redirect)이 아니라서 주소창은 그대로이고 로그인으로도 보내지 않는다.
describe("proxy — 스위치 끔: 로그인 필요 목록은 없는 주소로 다시 쓴다", () => {
  const rewritten = (res: Response) =>
    res.headers.get("x-middleware-rewrite") ?? "";

  it("/account · /consent · /farm/settings · /farm/crop 은 다시 쓴다 (location 없음 · Supabase 호출 없음)", async () => {
    for (const path of [
      "/account",
      "/account/x",
      "/consent?next=%2Fwater",
      "/farm/settings",
      "/farm/crop",
      "/%61ccount",
    ]) {
      const res = await proxy(get(path, COOKIE));
      expect(rewritten(res), path).not.toBe("");
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("공개 주소는 그대로 통과한다 (다시 쓰지 않음)", async () => {
    for (const path of ["/", "/water?st=105", "/my-farm", "/more", "/terms"]) {
      const res = await proxy(get(path));
      expect(rewritten(res), path).toBe("");
    }
  });

  it("스위치를 켜면 다시 쓰지 않는다 (로그인 필요 주소는 지금처럼 로그인으로 보냄)", async () => {
    vi.stubEnv("MEMBERS_ENABLED", "true");
    const res = await proxy(get("/account"));
    expect(rewritten(res)).toBe("");
    expect(res.status).toBe(307);
  });

  it("다시 쓰는 응답에도 남은 표시 쿠키는 지운다 (켰다가 끈 뒤)", async () => {
    const res = await proxy(get("/account", withState("in")));
    expect(rewritten(res)).not.toBe("");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${STATE}=;`);
  });
});
