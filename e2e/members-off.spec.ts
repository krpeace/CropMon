import { expect, test } from "./fixtures";

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
