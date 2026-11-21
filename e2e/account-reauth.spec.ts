import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 구글 · 네이버 연결 끊기 — 탈퇴 때 한 번 더 로그인 (이슈 #197, 결정 0068). 스위치 "켬" 서버(3101, 네이버 꺼짐), 데스크톱 1440.
// 가짜 Supabase 가 로그인 · 공급자 토큰 · 탈퇴 함수 · 가짜 구글 취소를 흉내 낸다(진짜 구글 호출 0). 가짜의 시나리오는 전역 값이라 serial.
// 네이버 켬(3102) 시험은 members-naver.spec.ts 에 있다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;
const NEXT = "/water?st=105&crop=apple";

type Calls = {
  withdrawCalls: number;
  withdrawn: string[];
  kakaoUnlinkCalls: unknown[];
  kakaoId: string;
  reauth: {
    lastProviderToken: string | null;
    googleRevokes: { token: string; contentType: string }[];
    naverDeletes: unknown[];
    authorizeCalls: {
      provider: string;
      prompt: string | null;
      authType: string | null;
      flow: string | null;
    }[];
  };
};
const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const calls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<Calls>;
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const toast = (page: Page) => page.getByTestId("toast");
const intentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "cm_wd");
const loginButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "로그인", exact: true });
const accountButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "내 계정" });

/** 같은 회원(재로그인해도 같은 번호)으로 공급자 로그인. */
async function login(page: Page, provider = "google") {
  await page.goto(`/auth/login?provider=${provider}&next=${enc(NEXT)}`);
  await page.waitForURL(/\/water\?/);
  await expect.poll(() => here(page)).toBe(NEXT);
}
async function openWithdraw(page: Page) {
  await page.goto("/account/withdraw");
  await expect(
    page.getByRole("heading", { name: "회원탈퇴", level: 1 }),
  ).toBeVisible();
}
const agree = (page: Page) =>
  page.getByRole("checkbox", { name: "위 내용을 확인했어요" });
const withdrawButton = (page: Page) =>
  page.getByRole("button", { name: "탈퇴하기" });
async function pressWithdraw(page: Page) {
  await agree(page).check();
  await withdrawButton(page).click();
}
const b64 = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
  await scenario(request, { sameUser: true });
});

test.describe("탈퇴 화면의 안내 줄", () => {
  test("구글 회원에게만 [탈퇴하기] 위에 재로그인 안내 한 줄이 보인다", async ({
    page,
  }) => {
    await login(page, "google");
    await openWithdraw(page);
    const hint = page.getByText(
      "탈퇴하기를 누르면 연결을 끊기 위해 구글 로그인을 한 번 더 해요.",
    );
    await expect(hint).toBeVisible();
    // 안내 줄은 버튼 바로 위
    const hintY = (await hint.boundingBox())!.y;
    const buttonY = (await withdrawButton(page).boundingBox())!.y;
    expect(hintY).toBeLessThan(buttonY);
    // 확정 문구의 연결 줄이 있다 (네이버 로그인이 열리지 않은 서버라 "네이버"를 뺀다, 이슈 #205)
    await expect(
      page.getByText("탈퇴하면 카카오·구글 연결도 함께 끊어요."),
    ).toBeVisible();
  });

  test("카카오 회원에게는 안내 줄이 없다 (재로그인 없음)", async ({ page }) => {
    await login(page, "kakao");
    await openWithdraw(page);
    await expect(page.getByText("한 번 더 해요")).toHaveCount(0);
  });
});

test.describe("같은 구글 계정으로 다시 로그인", () => {
  test("탈퇴하기 → 구글 계정 고르기로 이동(prompt=select_account) → 돌아오면 지워지고 구글 토큰이 취소된다 → '탈퇴했어요' 한 줄", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText("탈퇴했어요");
    await expect.poll(() => here(page)).toBe("/");
    await expect(loginButton(page)).toBeVisible();

    const c = await calls(request);
    const start = c.reauth.authorizeCalls.at(-1)!;
    expect(start).toEqual({
      provider: "google",
      prompt: "select_account",
      authType: null,
      flow: "withdraw",
    });
    expect(c.withdrawCalls).toBe(1);
    expect(c.withdrawn).toHaveLength(1);
    // 방금 받은 공급자 토큰이 취소 요청 본문으로 갔다 (가짜 서버가 받음)
    expect(c.reauth.googleRevokes).toHaveLength(1);
    expect(c.reauth.googleRevokes[0].token).toBe(c.reauth.lastProviderToken);
    expect(c.reauth.googleRevokes[0].contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
    // 의도 쿠키는 지워졌고 로그인 쿠키도 없다
    expect(await intentCookie(page)).toBeUndefined();
  });

  test("탈퇴 뒤 다시 /account 를 열면 로그인 시트가 뜬다", async ({ page }) => {
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto("/account");
    await expect(page.getByRole("dialog", { name: /로그인/ })).toBeVisible();
  });

  test("의도 쿠키는 콜백 경로에만, HttpOnly 로 심기고 공급자(가짜)로 가는 303 이다", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    // 브라우저가 따라가지 않도록 같은 문맥의 요청으로 첫 응답을 그대로 본다
    const res = await page.request.post("/auth/withdraw", {
      form: { confirm: "on" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toContain(
      "http://127.0.0.1:54321/auth/v1/authorize",
    );
    const header = res.headers()["set-cookie"] ?? "";
    expect(header).toContain("cm_wd=");
    expect(header).toContain("Path=/auth/callback");
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toContain("Max-Age=300");
    // 아직 아무것도 지우지 않았다
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(0);
    expect(c.reauth.googleRevokes).toHaveLength(0);
  });

  test("구글 취소가 실패해도 탈퇴는 끝나고 알림에 안내 한 줄이 더 붙는다", async ({
    page,
    request,
  }) => {
    await scenario(request, { googleRevoke: "fail" });
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText(
      "탈퇴했어요. 카카오·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.reauth.googleRevokes).toHaveLength(1);
  });

  test("공급자 토큰이 안 오면 끊기는 실패로 보고 탈퇴는 진행 + 안내 한 줄 (취소 요청 없음)", async ({
    page,
    request,
  }) => {
    await scenario(request, { providerToken: "off" });
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText(
      "탈퇴했어요. 카카오·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.reauth.googleRevokes).toHaveLength(0);
  });

  test("탈퇴 함수가 실패하면 아무것도 끊지 않고 탈퇴 화면에 실패 줄 — 로그인 그대로, 다시 하면 된다", async ({
    page,
    request,
  }) => {
    await scenario(request, { withdrawMode: "fail" });
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL(/\/account\/withdraw/);
    await expect(
      page.getByText("탈퇴를 마치지 못했어요. 잠시 뒤 다시 해 주세요"),
    ).toBeVisible();
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.withdrawn).toHaveLength(0);
    expect(c.reauth.googleRevokes).toHaveLength(0);
    await expect(accountButton(page)).toBeVisible();
    expect(await intentCookie(page)).toBeUndefined();
  });
});

test.describe("다른 계정으로 다시 로그인 — 아무것도 지우지 않는다 (핵심)", () => {
  test("탈퇴 함수 호출 0 · 구글 취소 0 · 이 기기는 로그아웃 · 알림 · 의도 쿠키 지움", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    await openWithdraw(page);
    await scenario(request, { reauthOther: true });
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toContainText(
      "다른 계정으로 로그인해서 탈퇴하지 않았어요. 원래 계정으로 다시 로그인해 주세요",
    );
    await expect(loginButton(page)).toBeVisible();

    const c = await calls(request);
    expect(c.withdrawCalls).toBe(0);
    expect(c.withdrawn).toHaveLength(0);
    expect(c.reauth.googleRevokes).toHaveLength(0);
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
    expect(await intentCookie(page)).toBeUndefined();
  });

  test("원래 회원은 그대로 — 같은 계정으로 다시 로그인하면 회원 정보가 그대로 열린다", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    await openWithdraw(page);
    await scenario(request, { reauthOther: true });
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await scenario(request, { reauthOther: false });
    await login(page, "google");
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "회원 정보", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByText("가짜별명")).toBeVisible();
    expect((await calls(request)).withdrawCalls).toBe(0);
  });
});

test.describe("취소 · 만료", () => {
  test("공급자 화면에서 취소하면 말 없이 탈퇴 화면으로, 원래 세션은 그대로, 아무것도 안 지움", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    await openWithdraw(page);
    await scenario(request, { scenario: "cancel" });
    await pressWithdraw(page);
    await page.waitForURL(
      (u) => u.pathname === "/account/withdraw" && u.search === "",
    );
    await expect(toast(page)).toHaveCount(0);
    await expect(
      page.getByText("시간이 지나 탈퇴하지 않았어요. 다시 해 주세요"),
    ).toHaveCount(0);
    await expect(accountButton(page)).toBeVisible();
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(0);
    expect(c.reauth.googleRevokes).toHaveLength(0);
    expect(await intentCookie(page)).toBeUndefined();
    // 다시 해 보면 된다
    await scenario(request, { scenario: "ok" });
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    expect((await calls(request)).withdrawn).toHaveLength(1);
  });

  test("의도 쿠키가 만료됐으면 코드 교환도 없이 만료 줄, 원래 세션 그대로, 아무것도 안 지움", async ({
    page,
    request,
    context,
  }) => {
    await login(page, "google");
    await context.addCookies([
      {
        name: "cm_wd",
        value: b64({
          v: 1,
          who: "0123456789abcdef",
          p: "google",
          exp: Date.now() - 60_000,
        }),
        domain: "localhost",
        path: "/auth/callback",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const before = (await calls(request)).reauth.authorizeCalls.length;
    await page.goto("/auth/callback?flow=withdraw&code=fake-not-used");
    await page.waitForURL(/\/account\/withdraw\?withdraw=expired/);
    await expect(
      page.getByText("시간이 지나 탈퇴하지 않았어요. 다시 해 주세요"),
    ).toBeVisible();
    await expect(accountButton(page)).toBeVisible();
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(0);
    expect(c.reauth.authorizeCalls.length).toBe(before);
    expect(await intentCookie(page)).toBeUndefined();
  });

  test("의도 쿠키가 아예 없는 재인증 콜백도 같다 (남이 만든 주소로 들어와도 지워지지 않는다)", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    await page.goto("/auth/callback?flow=withdraw&code=fake-not-used");
    await page.waitForURL(/\/account\/withdraw\?withdraw=expired/);
    await expect(accountButton(page)).toBeVisible();
    expect((await calls(request)).withdrawCalls).toBe(0);
  });
});

test.describe("그 밖의 갈래", () => {
  test("네이버 회원인데 네이버 스위치가 꺼져 있으면 재로그인 없이 바로 탈퇴 + 안내 한 줄", async ({
    page,
    request,
  }) => {
    await scenario(request, { identities: ["custom:naver"] });
    await login(page, "kakao"); // 로그인 흉내의 공급자 이름만 쓰고, 로그인 정보의 연결은 네이버로 둔다
    await openWithdraw(page);
    await expect(page.getByText("한 번 더 해요")).toHaveCount(0);
    const before = (await calls(request)).reauth.authorizeCalls.length;
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText(
      "탈퇴했어요. 카카오·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.reauth.authorizeCalls.length).toBe(before); // 재로그인 없음
    expect(c.reauth.naverDeletes).toHaveLength(0);
  });

  test("카카오 + 구글 회원: 구글로 재로그인한 뒤 구글 취소와 카카오 끊기를 둘 다 해서 '탈퇴했어요' 한 줄", async ({
    page,
    request,
  }) => {
    await scenario(request, { identities: ["kakao", "google"] });
    await login(page, "google");
    await openWithdraw(page);
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText("탈퇴했어요");
    const c = await calls(request);
    expect(c.reauth.googleRevokes).toHaveLength(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(1);
  });

  test("탈퇴 의도 쿠키는 일반 로그인 콜백이 지운다 (탈퇴하려다 그만두고 그냥 로그인)", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "cm_wd",
        value: b64({
          v: 1,
          who: "0123456789abcdef",
          p: "google",
          exp: Date.now() + 100_000,
        }),
        domain: "localhost",
        path: "/auth/callback",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(await intentCookie(page)).toBeDefined();
    await login(page, "google");
    expect(await intentCookie(page)).toBeUndefined();
  });
});

test.describe("공급자 토큰과 세션 쿠키 (현재 동작의 기록 — 이슈 #197, 결정 0068)", () => {
  test("로그인 직후 세션 쿠키 안에 공급자 토큰이 들어 있다 (바꾸지 않음 — 검토 채팅이 O3 점검 목록에 올림)", async ({
    page,
    request,
  }) => {
    await login(page, "google");
    const c = await calls(request);
    const cookies = (await page.context().cookies()).filter((x) =>
      /^sb-.+-auth-token(\.\d+)?$/.test(x.name),
    );
    expect(cookies.length).toBeGreaterThan(0);
    const joined = cookies
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => x.value)
      .join("");
    const raw = joined.startsWith("base64-")
      ? Buffer.from(joined.slice("base64-".length), "base64url").toString(
          "utf8",
        )
      : decodeURIComponent(joined);
    const token = c.reauth.lastProviderToken!;
    expect(token).toBeTruthy();
    // @supabase/ssr 가 세션 전체를 쿠키에 쓰므로 공급자 토큰도 함께 실린다. 탈퇴 갈래는 끝에서 이 쿠키를 지운다.
    expect(raw.includes(token)).toBe(true);
  });
});
