import { expect, test, type Page } from "./fixtures";

// 회원제 스위치 "끔" (이슈 #182, 결정 0061). 이 서버(3100)는 MEMBERS_ENABLED 가 없다 — 지금 알파와 똑같아야 한다.
// 기존 e2e 가 모두 이 서버에서 그대로 통과하는 것이 "끄면 똑같다"의 가장 큰 증거이고, 여기서는 /auth/* 를 따로 확인한다.

const FAKE = "http://127.0.0.1:54321/__fake";

test.describe("회원제 스위치 끔", () => {
  test.skip(({ isMobile }) => isMobile);

  test("/auth/login · /auth/callback · /auth/signout 은 없는 주소(404)이고 쿠키를 심지 않는다", async ({
    request,
  }) => {
    const calls = [
      await request.get("/auth/login?provider=kakao&next=%2F", {
        maxRedirects: 0,
      }),
      await request.get("/auth/callback?code=abc&next=%2F", {
        maxRedirects: 0,
      }),
      await request.get("/auth/callback?error=access_denied", {
        maxRedirects: 0,
      }),
      await request.get("/auth/signout", { maxRedirects: 0 }),
      await request.post("/auth/signout", { maxRedirects: 0 }),
    ];
    for (const res of calls) {
      expect(res.status(), res.url()).toBe(404);
      expect(res.headers()["set-cookie"], res.url()).toBeUndefined();
      expect(res.headers()["location"], res.url()).toBeUndefined();
    }
  });

  test("로그인 필요 목록도 막지 않는다 — /account · /farm/settings 는 원래대로 없는 쪽(로그인으로 보내지 않음)", async ({
    page,
  }) => {
    for (const path of ["/account", "/farm/settings", "/farm/crop"]) {
      const res = await page.goto(path);
      expect(res!.status(), path).toBe(404);
      expect(new URL(page.url()).pathname, path).toBe(path);
      expect(page.url(), path).not.toContain("login=1");
    }
  });

  test("로그인 쿠키 모양의 쿠키가 있어도 Supabase 를 부르지 않는다 (프록시가 세션을 건드리지 않음)", async ({
    page,
    request,
    context,
  }) => {
    await request.post(`${FAKE}/reset`);
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: "not-a-real-session",
        url: "http://localhost:3100",
      },
    ]);
    await page.goto("/water?st=105&crop=apple");
    await page.goto("/");
    const calls = await (await request.get(`${FAKE}/calls`)).json();
    expect(calls.auth).toBe(0);
    expect(calls.ensure).toBe(0);
    // 쿠키도 그대로(지우거나 바꾸지 않음)
    const cookie = (await context.cookies()).find(
      (c) => c.name === "sb-127-auth-token",
    );
    expect(cookie?.value).toBe("not-a-real-session");
  });
});

// ── 이슈 #189(결정 0064): 로그인 시트를 붙여도 스위치를 끄면 지금 알파와 같다 ──
test.describe("회원제 스위치 끔 — 로그인 시트 · 표시 쿠키", () => {
  test.skip(({ isMobile }) => isMobile);

  const header = (page: Page) => page.locator("header");

  test("쿠키 없는 방문자의 응답에는 Set-Cookie 가 없다 (표시 쿠키 · 세션 쿠키 모두)", async ({
    request,
  }) => {
    for (const path of ["/", "/water?st=105&crop=apple", "/my-farm", "/more"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["set-cookie"], path).toBeUndefined();
    }
  });

  test('헤더는 지금 알파 그대로 — "로그인 곧 열려요" 하나, 프로필 · 다른 "로그인" 없음', async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      header(page).getByRole("button", { name: /로그인/ }),
    ).toHaveCount(1);
    await expect(header(page)).toContainText("곧 열려요");
    await expect(page.getByRole("button", { name: "내 계정" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "다크 모드로 보기" }),
    ).toBeVisible();
  });

  test("로그인을 누르면 지금 안내 창(2027년 1월 1일부터 열려요)이 뜬다 — 공급자 버튼 없음", async ({
    page,
  }) => {
    await page.goto("/water?st=105");
    await page.waitForLoadState("networkidle");
    await header(page)
      .getByRole("button", { name: /로그인/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "로그인 안내" });
    await expect(dialog).toContainText("로그인은 2027년 1월 1일부터 열려요");
    await expect(dialog.locator("a[href^='/auth/login']")).toHaveCount(0);
  });

  test("/?login=1&next=… 가 있어도 로그인 시트가 아니라 지금 안내가 뜨고, 닫으면 주소에서 login · next 가 지워진다", async ({
    page,
  }) => {
    await page.goto("/?login=1&next=%2Ffarm%2Fsettings");
    const dialog = page.getByRole("dialog", { name: "로그인 안내" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "로그인", exact: true }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).search).toBe("");
  });

  test("켰다가 끈 뒤 남은 표시 쿠키(cm_m)가 있어도 알파와 같고, 쿠키는 첫 요청에서 지워진다", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "cm_m", value: "in", url: "http://localhost:3100" },
    ]);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // 프로필(내 계정)이 아니라 알파의 "로그인 곧 열려요"
    await expect(page.getByRole("button", { name: "내 계정" })).toHaveCount(0);
    await expect(header(page)).toContainText("곧 열려요");
    await expect(
      page.getByRole("button", { name: "다크 모드로 보기" }),
    ).toBeVisible();
    expect(
      (await context.cookies()).find((c) => c.name === "cm_m"),
    ).toBeUndefined();
  });

  test("네이버 로그인 시작은 스위치와 상관없이 끔이면 404", async ({
    request,
  }) => {
    const res = await request.get("/auth/login?provider=custom%3Anaver", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });
});

// ── 이슈 #191(결정 0065): 동의 화면을 붙여도 스위치를 끄면 지금 알파와 같다 ──
test.describe("회원제 스위치 끔 — 동의 화면", () => {
  test.skip(({ isMobile }) => isMobile);

  test("/consent 는 없는 주소(404)다 — 로그인 필요 목록에 있어도 로그인으로 보내지 않는다", async ({
    page,
  }) => {
    const res = await page.goto("/consent?next=%2Fwater");
    expect(res!.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe("/consent");
    expect(page.url()).not.toContain("login=1");
  });

  test("/auth/consent 는 POST · GET 모두 404 이고 쿠키를 심지 않는다", async ({
    request,
  }) => {
    const calls = [
      await request.post("/auth/consent?next=%2F", { maxRedirects: 0 }),
      await request.get("/auth/consent", { maxRedirects: 0 }),
    ];
    for (const res of calls) {
      expect(res.status(), res.url()).toBe(404);
      expect(res.headers()["set-cookie"], res.url()).toBeUndefined();
      expect(res.headers()["location"], res.url()).toBeUndefined();
    }
  });
});
