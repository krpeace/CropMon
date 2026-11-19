import type { APIRequestContext } from "@playwright/test";

import { expect, test, type Page } from "./fixtures";

// 회원제 스위치 "켬" — 로그인 → 누르기 전에 보던 화면으로 돌아옴 → 로그아웃 (이슈 #182, 결정 0061).
// 이 서버(3101)는 MEMBERS_ENABLED=true 이고, 로그인은 가짜 Supabase(e2e/fake-supabase.mjs)의 흉내다.
// 가짜의 시나리오 · 호출 횟수는 전역 값이라 이 파일은 차례로(serial) 돈다. 화면(로그인 시트)은 L3 이므로 길 자체만 본다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const BASE = "http://localhost:3101";
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

const setScenario = (
  request: APIRequestContext,
  body: { scenario?: string; ensure?: string },
) => request.post(`${FAKE}/scenario`, { data: body });
const fakeCalls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<{
    auth: number;
    ensure: number;
  }>;
const authCookies = async (page: Page) =>
  (await page.context().cookies()).filter((c) => AUTH_COOKIE.test(c.name));

const enc = encodeURIComponent;
const loginUrl = (provider: string, next?: string) =>
  `/auth/login?provider=${enc(provider)}${next === undefined ? "" : `&next=${enc(next)}`}`;
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test.describe("로그인 시작 · 콜백", () => {
  test("로그인 시작은 공급자 화면으로 보내며 코드 검증값 쿠키를 심는다", async ({
    request,
  }) => {
    const res = await request.get(loginUrl("kakao", "/water?st=105"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toContain(
      "http://127.0.0.1:54321/auth/v1/authorize",
    );
    expect(res.headers()["location"]).toContain("provider=kakao");
    expect(res.headers()["set-cookie"]).toContain("code-verifier");
  });

  test("카카오로 로그인 → 누르기 전에 보던 화면(검색어 포함)으로 돌아오고, 세션 쿠키가 생기고, ensure_my_member 를 한 번 부른다", async ({
    page,
    request,
  }) => {
    await page.goto(loginUrl("kakao", "/water?st=105&crop=apple"));
    await page.waitForURL(/\/water\?/);
    expect(here(page)).toBe("/water?st=105&crop=apple");
    expect((await authCookies(page)).length).toBeGreaterThan(0);
    expect((await fakeCalls(request)).ensure).toBe(1);
    // 돌아온 화면은 로그인 시트를 여는 표시가 없다
    expect(page.url()).not.toContain("login=");
  });

  test("구글 · 네이버(custom:naver)도 같은 길로 돌아온다", async ({
    page,
    request,
  }) => {
    for (const provider of ["google", "custom:naver"]) {
      await page.context().clearCookies();
      await request.post(`${FAKE}/reset`);
      await page.goto(loginUrl(provider, "/temperature?st=108&crop=apple"));
      await page.waitForURL(/\/temperature\?/);
      expect(here(page), provider).toBe("/temperature?st=108&crop=apple");
      expect((await authCookies(page)).length, provider).toBeGreaterThan(0);
    }
  });

  test("ensure_my_member 가 실패해도 로그인은 계속된다 (돌아오고 세션 쿠키가 있음)", async ({
    page,
    request,
  }) => {
    await setScenario(request, { ensure: "fail" });
    await page.goto(loginUrl("google", "/water?st=105"));
    await page.waitForURL(/\/water\?/);
    expect(here(page)).toBe("/water?st=105"); // login=failed 가 붙지 않는다
    expect((await authCookies(page)).length).toBeGreaterThan(0);
    expect((await fakeCalls(request)).ensure).toBe(1);
  });

  test("공급자 화면에서 취소하면 login=cancelled 가 붙어 돌아오고, 세션도 ensure 호출도 없다", async ({
    page,
    request,
  }) => {
    await setScenario(request, { scenario: "cancel" });
    await page.goto(loginUrl("kakao", "/water?st=105&crop=apple"));
    await page.waitForURL(/login=cancelled/);
    expect(here(page)).toBe("/water?st=105&crop=apple&login=cancelled");
    expect(await authCookies(page)).toHaveLength(0);
    expect((await fakeCalls(request)).ensure).toBe(0);
  });

  test("실패(공급자 오류 · 주소의 # 뒤 오류로 코드 없이 돌아옴 · 코드 교환 실패)는 login=failed", async ({
    page,
    request,
  }) => {
    for (const scenario of ["provider-error", "no-code", "exchange-fail"]) {
      await page.context().clearCookies();
      await setScenario(request, { scenario });
      await page.goto(loginUrl("google", "/water?st=105"));
      await page.waitForURL(/login=failed/);
      expect(here(page), scenario).toBe("/water?st=105&login=failed");
      expect(await authCookies(page), scenario).toHaveLength(0);
    }
    expect((await fakeCalls(request)).ensure).toBe(0);
  });

  test("나쁜 돌아갈 주소(남의 사이트 · 이중 슬래시 · 역슬래시)는 / 로 돌아온다 — 우리 사이트를 벗어나지 않는다", async ({
    page,
  }) => {
    for (const next of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/auth/login?provider=kakao",
    ]) {
      await page.context().clearCookies();
      await page.goto(loginUrl("kakao", next));
      await page.waitForURL(`${BASE}/`);
      expect(new URL(page.url()).origin, next).toBe(BASE);
      expect(here(page), next).toBe("/");
    }
  });

  test("모르는 공급자는 400 이고 쿠키를 심지 않는다", async ({ request }) => {
    for (const provider of ["github", "KAKAO", "naver", ""]) {
      const res = await request.get(loginUrl(provider, "/"), {
        maxRedirects: 0,
      });
      expect(res.status(), provider).toBe(400);
      expect(res.headers()["set-cookie"], provider).toBeUndefined();
    }
  });
});

test.describe("로그인 필요 주소", () => {
  test("로그인하지 않고 열면 /?login=1&next=<원래 주소> 로 가고, 로그인하면 그 주소가 그냥 열린다", async ({
    page,
  }) => {
    await page.goto("/farm/settings?st=105");
    expect(here(page)).toBe(`/?login=1&next=${enc("/farm/settings?st=105")}`);

    await page.goto(loginUrl("kakao", "/farm/settings?st=105"));
    await page.waitForURL(/\/farm\/settings/);
    // 아직 화면이 없어 404 쪽이 열리지만(F1 이 만든다), 로그인 창으로 되돌려 보내지는 않는다
    expect(here(page)).toBe("/farm/settings?st=105");
    await page.goto("/account");
    expect(new URL(page.url()).pathname).toBe("/account");
    expect(page.url()).not.toContain("login=1");
  });

  test("/my-farm 미리보기 · 공개 화면은 로그인하지 않아도 열린다", async ({
    page,
  }) => {
    for (const path of ["/my-farm", "/water?st=105&crop=apple", "/more"]) {
      const res = await page.goto(path);
      expect(res!.status(), path).toBe(200);
      expect(here(page), path).toBe(path);
    }
  });

  test("인코딩으로 가려도 비켜 가지 못한다", async ({ page }) => {
    await page.goto("/%61ccount");
    expect(here(page)).toContain("login=1");
  });
});

test.describe("로그인 쿠키가 없는 방문은 Supabase 를 부르지 않는다", () => {
  test("공개 화면을 쿠키 없이 열면 /auth/v1/* 호출 0 — 로그인한 뒤에는 세션 확인이 생긴다 (대조)", async ({
    page,
    request,
  }) => {
    for (const path of ["/", "/water?st=105&crop=apple", "/my-farm", "/more"]) {
      await page.goto(path);
    }
    expect((await fakeCalls(request)).auth).toBe(0);

    await page.goto(loginUrl("kakao", "/water?st=105"));
    await page.waitForURL(/\/water\?/);
    await request.post(`${FAKE}/reset`);
    await page.goto("/water?st=105&crop=apple");
    expect((await fakeCalls(request)).auth).toBeGreaterThan(0);
  });
});

test.describe("로그아웃", () => {
  const signIn = async (page: Page) => {
    await page.goto(loginUrl("kakao", "/water?st=105"));
    await page.waitForURL(/\/water\?/);
    expect((await authCookies(page)).length).toBeGreaterThan(0);
  };

  test("같은 사이트의 POST(브라우저 폼)로 로그아웃하면 쿠키가 없어지고 next 로 돌아온다", async ({
    page,
  }) => {
    await signIn(page);
    await page.evaluate(() => {
      const f = document.createElement("form");
      f.method = "POST";
      f.action = "/auth/signout?next=%2Fwater%3Fst%3D105%26crop%3Dapple";
      document.body.append(f);
      f.submit();
    });
    await page.waitForURL(/crop=apple/);
    expect(here(page)).toBe("/water?st=105&crop=apple");
    expect(await authCookies(page)).toHaveLength(0);
  });

  test("Origin 헤더가 없는 POST 는 막지 않고 통과한다", async ({ page }) => {
    await signIn(page);
    const res = await page.context().request.post("/auth/signout", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(await authCookies(page)).toHaveLength(0);
  });

  test("다른 사이트의 Origin 이면 403 이고 로그아웃되지 않는다", async ({
    page,
  }) => {
    await signIn(page);
    const res = await page.context().request.post("/auth/signout", {
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
    expect((await authCookies(page)).length).toBeGreaterThan(0);
  });

  test("GET 은 로그아웃시키지 않는다 (405)", async ({ page }) => {
    await signIn(page);
    const res = await page.context().request.get("/auth/signout", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(405);
    expect((await authCookies(page)).length).toBeGreaterThan(0);
  });
});
