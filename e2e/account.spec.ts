import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 회원 정보 · 로그아웃 · 회원탈퇴 · 카카오 연결 끊기 (이슈 #195, 결정 0067) — 스위치 "켬" 서버(3101), 데스크톱 1440.
// 가짜 Supabase(e2e/fake-supabase.mjs)가 로그인 · 탈퇴 함수 · 카카오 연결 끊기를 흉내 낸다. 이 서버는 KAKAO_API_BASE 를 그 가짜로 가리킨다
// (진짜 카카오 호출 0). 가짜의 시나리오는 전역 값이라 이 파일은 차례로(serial) 돈다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const ADMIN_KEY = "e2e-fake-admin-key"; // playwright.config.ts 가 3101 서버에 넣는 가짜 값
const enc = encodeURIComponent;

type Calls = {
  withdrawCalls: number;
  withdrawn: string[];
  kakaoUnlinkCalls: {
    authorization: string;
    contentType: string;
    body: string;
  }[];
  kakaoId: string;
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

async function login(page: Page, next = "/water?st=105&crop=apple") {
  await page.goto(`/auth/login?provider=kakao&next=${enc(next)}`);
  await page.waitForURL(/\/water\?/);
  await expect.poll(() => here(page)).toBe(next);
}
async function openAccount(page: Page) {
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "회원 정보", level: 1 }),
  ).toBeVisible();
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

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test.describe("내 계정 시트 → 회원 정보", () => {
  test("시트의 '회원 정보' 줄이 켜져 있고 누르면 회원 정보 화면으로 간다", async ({
    page,
  }) => {
    await login(page);
    await page
      .locator("header")
      .getByRole("button", { name: "내 계정" })
      .click();
    const sheet = page.getByRole("dialog", { name: "내 계정" });
    await sheet.getByRole("link", { name: "회원 정보" }).click();
    await page.waitForURL(/\/account(\?|$)/);
    await expect(
      page.getByRole("heading", { name: "회원 정보", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("회원 정보 화면", () => {
  test("로그인 방법 · 이름 · 메일 · 가입한 날 · 동의한 약관 두 줄이 보인다", async ({
    page,
  }) => {
    await login(page);
    await openAccount(page);
    const main = page.getByRole("main");
    await expect(main.getByText("로그인 방법")).toBeVisible();
    await expect(main.getByText("카카오", { exact: true })).toBeVisible();
    await expect(main.getByText("가짜별명")).toBeVisible();
    await expect(main.getByText("tester@example.invalid")).toBeVisible();
    await expect(
      main.getByText("2026년 8월 12일", { exact: true }),
    ).toBeVisible();
    await expect(main.getByText("2026년 8월 12일 동의 · 제1판")).toBeVisible();
    await expect(
      main.getByText("2026년 8월 12일 안내 확인 · 제1판"),
    ).toBeVisible();
  });

  test("메일이 없는 회원은 메일 줄을 통째로 뺀다", async ({
    page,
    request,
  }) => {
    await scenario(request, { email: null });
    await login(page);
    await openAccount(page);
    await expect(page.getByRole("main").getByText("메일")).toHaveCount(0);
    await expect(page.getByRole("main").getByText("가짜별명")).toBeVisible();
  });

  test("[보기]가 약관 · 개인정보처리방침 화면으로 이어진다", async ({
    page,
  }) => {
    await login(page);
    await openAccount(page);
    await page.getByRole("link", { name: "이용약관 보기" }).click();
    await page.waitForURL(/\/terms/);
    await page.goBack();
    await page.getByRole("link", { name: "개인정보처리방침 보기" }).click();
    await page.waitForURL(/\/privacy/);
  });

  test("회원 정보를 못 읽으면 안내 줄이 뜨고 화면은 무너지지 않는다", async ({
    page,
    request,
  }) => {
    await login(page);
    await scenario(request, { profileRead: "fail" });
    await page.goto("/account");
    await expect(
      page.getByText("회원 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요"),
    ).toBeVisible();
    // 그래도 로그아웃 · 회원탈퇴 길은 열려 있다
    await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
    await expect(page.getByRole("link", { name: "회원탈퇴" })).toBeVisible();
  });

  test("로그아웃 → 종합으로 가고 헤더가 '로그인'이 된다 (알림 없음)", async ({
    page,
  }) => {
    await login(page);
    await openAccount(page);
    await page
      .getByRole("main")
      .getByRole("button", { name: "로그아웃" })
      .click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(
      page.locator("header").getByRole("button", { name: "로그인" }),
    ).toBeVisible();
    await expect(toast(page)).toHaveCount(0);
  });

  test("동의 전 회원은 회원 정보 대신 동의 화면이 뜬다", async ({
    page,
    request,
  }) => {
    await scenario(request, { consentMode: "needed" });
    await page.goto(`/auth/login?provider=kakao&next=${enc("/account")}`);
    await expect(
      page.getByRole("dialog", {
        name: "CropMon을 시작하려면 동의가 필요해요",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "회원 정보", level: 1 }),
    ).toHaveCount(0);
  });

  test("로그인하지 않았으면 로그인 시트가 뜬다", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("dialog", { name: /로그인/ })).toBeVisible();
  });
});

test.describe("회원탈퇴 확인 화면", () => {
  test("확정 문구가 글자 그대로 보인다 (연결 해제 안내 줄은 늘 보임)", async ({
    page,
  }) => {
    await login(page);
    await openWithdraw(page);
    const main = page.getByRole("main");
    await expect(main.getByText("탈퇴하면 지워지는 것")).toBeVisible();
    for (const item of [
      "회원 정보",
      "내 농장",
      "작기",
      "관수 기록",
      "계산 결과",
      "화면 설정",
    ]) {
      await expect(
        main.getByRole("listitem").filter({ hasText: new RegExp(`^${item}$`) }),
        item,
      ).toBeVisible();
    }
    for (const text of [
      "바로 지워지고 되돌릴 수 없어요",
      "알아볼 수 없게 묶은 통계 자료와 최대 7일 보관 뒤 자동으로 지워지는 암호화 백업은 예외예요.",
      "카카오·네이버·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
      "같은 계정으로 다시 로그인하면 새 회원으로 시작해요",
    ]) {
      await expect(main.getByText(text, { exact: false }), text).toBeVisible();
    }
    await expect(agree(page)).not.toBeChecked();
  });

  test("확인 칸을 켜기 전에는 탈퇴하기가 눌리지 않고 안내 줄이 뜬다 (탈퇴 함수 호출 0)", async ({
    page,
    request,
  }) => {
    await login(page);
    await openWithdraw(page);
    await expect(withdrawButton(page)).toHaveAttribute("aria-disabled", "true");
    // aria-disabled 단추는 Playwright 가 "눌릴 수 없음"으로 보고 기다리므로, 사람이 누르듯 강제로 누른다
    await withdrawButton(page).click({ force: true });
    await expect(
      page.getByText("위 내용을 확인했다고 체크하면 탈퇴할 수 있어요"),
    ).toBeVisible();
    expect(here(page)).toBe("/account/withdraw");
    expect((await calls(request)).withdrawCalls).toBe(0);
    await agree(page).check();
    await expect(withdrawButton(page)).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("서버도 확인 칸을 본다 — 칸 없이 보낸 POST 는 탈퇴하지 않고 화면으로 돌려보낸다", async ({
    page,
    request,
  }) => {
    await login(page);
    const res = await page.request.post("/auth/withdraw", {
      form: {},
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toContain(
      "/account/withdraw?withdraw=confirm",
    );
    expect((await calls(request)).withdrawCalls).toBe(0);
  });
});

test.describe("탈퇴하기", () => {
  test("카카오 회원: 탈퇴 → 종합 + '탈퇴했어요', 카카오 연결 끊기를 실제로 불렀고, 헤더는 '로그인'", async ({
    page,
    request,
  }) => {
    await login(page);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText("탈퇴했어요");
    // 알림을 띄운 뒤 주소에서 account 표시를 지운다
    await expect.poll(() => here(page)).toBe("/");
    await expect(
      page.locator("header").getByRole("button", { name: "로그인" }),
    ).toBeVisible();

    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(1);
    expect(c.kakaoUnlinkCalls[0].authorization).toBe(`KakaoAK ${ADMIN_KEY}`);
    expect(c.kakaoUnlinkCalls[0].contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(c.kakaoUnlinkCalls[0].body).toBe(
      `target_id_type=user_id&target_id=${c.kakaoId}`,
    );
  });

  test("탈퇴 뒤 다시 /account 를 열면 로그인 시트가 뜬다 (세션이 지워짐)", async ({
    page,
  }) => {
    await login(page);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto("/account");
    await expect(page.getByRole("dialog", { name: /로그인/ })).toBeVisible();
  });

  test("두 번 눌러도 한 번만 탈퇴한다 (누르면 진행 표시)", async ({
    page,
    request,
  }) => {
    await login(page);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).dblclick();
    await page.waitForURL((u) => u.pathname === "/");
    expect((await calls(request)).withdrawCalls).toBe(1);
  });

  test("카카오 끊기가 실패해도 탈퇴는 끝난다 — 알림에 안내 한 줄이 더 붙는다", async ({
    page,
    request,
  }) => {
    await scenario(request, { kakaoUnlink: "fail" });
    await login(page);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toContainText("탈퇴했어요");
    await expect(toast(page)).toContainText(
      "연결된 서비스는 각 계정 설정에서 해제할 수 있어요",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(1);
  });

  test("구글 회원은 이슈 #197부터 구글로 한 번 더 로그인해 탈퇴한다 — 카카오 끊기는 안 부른다 (자세한 시험은 account-reauth.spec.ts)", async ({
    page,
    request,
  }) => {
    await scenario(request, { identities: ["google"], sameUser: true });
    await page.goto(
      `/auth/login?provider=google&next=${enc("/water?st=105&crop=apple")}`,
    );
    await page.waitForURL(/\/water\?/);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(toast(page)).toHaveText("탈퇴했어요");
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
  });

  test("탈퇴 함수가 실패하면 아무것도 끊지 않고 탈퇴 화면에 실패 줄이 뜬다 (로그인 그대로)", async ({
    page,
    request,
  }) => {
    await scenario(request, { withdrawMode: "fail" });
    await login(page);
    await openWithdraw(page);
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL(/\/account\/withdraw/);
    await expect(
      page.getByText("탈퇴를 마치지 못했어요. 잠시 뒤 다시 해 주세요"),
    ).toBeVisible();
    const c = await calls(request);
    expect(c.withdrawCalls).toBe(1);
    expect(c.withdrawn).toHaveLength(0);
    expect(c.kakaoUnlinkCalls).toHaveLength(0);
    // 로그인은 그대로 — 다시 시도할 수 있다
    await expect(
      page.locator("header").getByRole("button", { name: "내 계정" }),
    ).toBeVisible();
    await scenario(request, { withdrawMode: "ok" });
    await agree(page).check();
    await withdrawButton(page).click();
    await page.waitForURL((u) => u.pathname === "/");
    expect((await calls(request)).withdrawn).toHaveLength(1);
  });

  test("다른 사이트에서 온 POST(Origin 다름)는 403 이고 탈퇴하지 않는다", async ({
    page,
    request,
  }) => {
    await login(page);
    const res = await page.request.post("/auth/withdraw", {
      form: { confirm: "on" },
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
    expect((await calls(request)).withdrawCalls).toBe(0);
  });
});
