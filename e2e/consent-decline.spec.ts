import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 동의 화면의 "동의하지 않고 나가기" = 첫 동의 전이면 계정 바로 지우기 (이슈 #199, 결정 0069) — 스위치 "켬" 서버(3101), 데스크톱 1440.
// 가짜 Supabase 가 동의 상태 · 삭제 함수 · 카카오/구글 끊기를 흉내 낸다. 가짜의 시나리오는 전역 값이라 serial.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;
const NEXT = "/water?st=105&crop=apple";
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

type Calls = {
  withdrawCalls: number;
  withdrawn: string[];
  kakaoUnlinkCalls: unknown[];
  reauth: { googleRevokes: { token: string }[] };
};
const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const calls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<Calls>;
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const consentDialog = (page: Page) =>
  page.getByRole("dialog", { name: "CropMon을 시작하려면 동의가 필요해요" });
const leaveButton = (page: Page) =>
  consentDialog(page).getByRole("button", { name: "동의하지 않고 나가기" });
const toast = (page: Page) => page.getByTestId("toast");
const authCookies = async (page: Page) =>
  (await page.context().cookies()).filter((c) => AUTH_COOKIE.test(c.name));
const loginButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "로그인", exact: true });

/** 같은 회원 번호로 공급자 로그인 → 동의 화면(또는 동의가 끝났으면 보던 화면)까지. */
async function login(page: Page, provider: string) {
  await page.goto(`/auth/login?provider=${provider}&next=${enc(NEXT)}`);
}
async function loginToConsent(page: Page, provider = "kakao") {
  await login(page, provider);
  await expect(consentDialog(page)).toBeVisible();
}
async function pressLeave(page: Page) {
  await leaveButton(page).click();
  await page.waitForURL(/\/water\?/);
  await expect.poll(() => here(page)).toBe(NEXT);
  await expect(toast(page)).toHaveCount(0);
  await expect(loginButton(page)).toBeVisible();
  expect(await authCookies(page)).toHaveLength(0);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
  await scenario(request, { consentMode: "needed", sameUser: true });
});

test.describe("첫 로그인 → 나가기", () => {
  test("카카오: 계정 삭제 1회 · 카카오 끊기 1회 · 로그인 쿠키 없음 · 보던 화면 · 알림 없음", async ({
    page,
    request,
  }) => {
    await loginToConsent(page);
    await pressLeave(page);
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(1);
  });

  test("같은 계정으로 다시 로그인하면 새 회원이라 동의 화면이 다시 뜬다", async ({
    page,
    request,
  }) => {
    await loginToConsent(page);
    await pressLeave(page);
    await login(page, "kakao");
    await expect(consentDialog(page)).toBeVisible();
    expect(here(page)).toBe(`/consent?next=${enc(NEXT)}`);
    expect((await calls(request)).withdrawCalls).toBe(1);
  });
});

test.describe("지우지 않는 갈래", () => {
  test("예전 판에 동의했던 회원은 지우지 않고 로그아웃만 한다", async ({
    page,
    request,
  }) => {
    await scenario(request, { consentMode: "legacy" });
    await loginToConsent(page);
    await pressLeave(page);
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(0);
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
  });

  test("동의 기록을 읽지 못하면(동의 화면은 그려짐) 지우지 않고 로그아웃만 한다", async ({
    page,
    request,
  }) => {
    await loginToConsent(page);
    await scenario(request, { membersRead: "fail" });
    await leaveButton(page).click();
    await page.waitForURL(/\/water\?/);
    await expect.poll(() => here(page)).toBe(NEXT);
    expect((await calls(request)).withdrawCalls).toBe(0);
    expect(await authCookies(page)).toHaveLength(0);
  });
});

test.describe("삭제 실패", () => {
  test("지우기가 실패해도 로그아웃은 되고 보던 화면으로 간다", async ({
    page,
    request,
  }) => {
    await loginToConsent(page);
    await scenario(request, { withdrawMode: "fail" });
    await pressLeave(page);
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
  });
});

test.describe("구글 · 공급자 토큰", () => {
  test("구글 회원 + 공급자 토큰 있음 → 구글 연결 끊기 1회 (재인증 화면 없음)", async ({
    page,
    request,
  }) => {
    await loginToConsent(page, "google");
    await pressLeave(page);
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.reauth.googleRevokes).toHaveLength(1);
  });

  test('구글 회원 + 토큰 없음("off") → 끊기 0회, 나가기는 끝난다', async ({
    page,
    request,
  }) => {
    await scenario(request, { providerToken: "off" });
    await loginToConsent(page, "google");
    await pressLeave(page);
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.reauth.googleRevokes).toHaveLength(0);
  });
});

test.describe("내 계정 시트의 로그아웃", () => {
  test("동의가 끝난 회원의 로그아웃은 여전히 지우지 않는다 (delete_my_account 0회)", async ({
    page,
    request,
  }) => {
    await scenario(request, { consentMode: "done" });
    await login(page, "kakao");
    await page.waitForURL(/\/water\?/);
    await page.waitForLoadState("networkidle");
    const profile = page
      .locator("header")
      .getByRole("button", { name: "내 계정" });
    await expect(profile).toBeVisible();
    await profile.click();
    await page
      .getByRole("dialog", { name: "내 계정" })
      .getByRole("button", { name: "로그아웃" })
      .click();
    await expect(loginButton(page)).toBeVisible();
    expect(await authCookies(page)).toHaveLength(0);
    expect((await calls(request)).withdrawCalls).toBe(0);
  });
});

test.describe("휴대폰 폭 캡처", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("나가기를 누른 직후 화면", async ({ page, request }, testInfo) => {
    await loginToConsent(page);
    await leaveButton(page).click();
    await page.waitForURL(/\/water\?/);
    await expect(toast(page)).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: testInfo.outputPath("decline-after-mobile.png"),
    });
    await testInfo.attach("decline-after-mobile", {
      path: testInfo.outputPath("decline-after-mobile.png"),
      contentType: "image/png",
    });
    expect((await calls(request)).withdrawCalls).toBe(1);
  });
});
