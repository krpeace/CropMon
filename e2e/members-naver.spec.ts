import type { APIRequestContext } from "@playwright/test";

import { expect, test, type Page } from "./fixtures";

// 네이버 켬 (이슈 #189, 결정 0064). 이 서버(3102)는 MEMBERS_ENABLED=true · NAVER_LOGIN_ENABLED=true 다.
// 같은 빌드를 변수만 달리해 띄운 것 — 다시 빌드하지 않고 서버 변수만으로 네이버가 켜지는 것을 못 박는다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;

const reset = (request: APIRequestContext) => request.post(`${FAKE}/reset`);
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const loginButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "로그인", exact: true });

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test("표시 쿠키에 n 이 붙는다 (an)", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "cm_m",
  );
  expect(cookie?.value).toBe("an");
});

test("/auth/login?provider=custom:naver 는 공급자 화면으로 보낸다 (302)", async ({
  request,
}) => {
  const res = await request.get(
    "/auth/login?provider=custom%3Anaver&next=%2F",
    {
      maxRedirects: 0,
    },
  );
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toContain("provider=custom%3Anaver");
});

test("로그인 시트의 네이버 버튼이 링크가 되고, 누르면 로그인되어 보던 화면으로 돌아온다", async ({
  page,
}) => {
  await page.goto("/water?st=105&crop=apple");
  await page.waitForLoadState("networkidle");
  await loginButton(page).click();
  const dialog = page.getByRole("dialog", { name: "로그인" });
  const naver = dialog.getByRole("link", { name: "네이버 로그인" });
  await expect(naver).toHaveAttribute(
    "href",
    `/auth/login?provider=custom%3Anaver&next=${enc("/water?st=105&crop=apple")}`,
  );
  await expect(dialog.getByRole("button", { name: /준비 중/ })).toHaveCount(0);
  await naver.click();
  await expect(page.getByTestId("toast")).toHaveText("로그인했어요");
  await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
  await expect(
    page.locator("header").getByRole("button", { name: "내 계정" }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "cm_m",
  );
  expect(cookie?.value).toBe("in");
});
