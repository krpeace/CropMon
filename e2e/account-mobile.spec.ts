import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 휴대폰 회원 정보 · 회원탈퇴 (이슈 #195, 결정 0067) — 스위치 "켬" 서버(3101), 390×844. 글씨 150%에서 버튼이 안 잘리고 두 번 누름이 막히는지.
// 실제 손가락 · 홈 막대는 이 시험으로 못 본다(실기 확인은 O3 — 스위치가 꺼져 있어 운영에서는 볼 것이 없다).

test.describe.configure({ mode: "serial" });
test.use({ baseURL: "http://localhost:3101" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;

const calls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<{
    withdrawCalls: number;
  }>;

async function login(page: Page, scale: "normal" | "xxlarge" = "normal") {
  await page.addInitScript((step) => {
    localStorage.setItem(
      "cropmon-font-scale",
      JSON.stringify({ v: 1, step, follow: false }),
    );
  }, scale);
  await page.goto(
    `/auth/login?provider=kakao&next=${enc("/water?st=105&crop=apple")}`,
  );
  await page.waitForURL(/\/water\?/);
  await page.waitForLoadState("networkidle");
}

/** 가로로 넘치지 않는다 (옆으로 밀리는 화면 없음). */
async function expectNoHorizontalScroll(page: Page) {
  const over = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test("회원 정보: 맥락 바 제목 '회원 정보' + 뒤로 화살표, 탭바 · 옆으로 밀림 없음", async ({
  page,
}) => {
  await login(page);
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "회원 정보", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "뒤로" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expect(page.getByRole("link", { name: "회원탈퇴" })).toBeVisible();
});

test("회원탈퇴: 맥락 바 제목 '회원 탈퇴' · 탈퇴하기 버튼이 화면 안에서 끝까지 보이고 누를 만큼 크다", async ({
  page,
}) => {
  await login(page);
  await page.goto("/account/withdraw");
  const button = page.getByRole("button", { name: "탈퇴하기" });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.height).toBeGreaterThanOrEqual(44 - 0.5);
  await expectNoHorizontalScroll(page);
});

test("글씨 150%: 탈퇴하기 버튼이 잘리지 않고, 확인 칸을 켜면 탈퇴된다 (두 번 눌러도 한 번)", async ({
  page,
  request,
}) => {
  await login(page, "xxlarge");
  await page.goto("/account/withdraw");
  await page.waitForLoadState("networkidle");
  const agree = page.getByRole("checkbox", { name: "위 내용을 확인했어요" });
  const button = page.getByRole("button", { name: "탈퇴하기" });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expectNoHorizontalScroll(page);
  // 버튼 글자가 줄 안에서 잘리지 않는다
  const clipped = await button.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 1,
  );
  expect(clipped).toBe(false);

  await agree.check();
  await button.dblclick();
  await page.waitForURL((u) => u.pathname === "/");
  expect((await calls(request)).withdrawCalls).toBe(1);
});

test("구글 회원: 글씨 150%에서 재로그인 안내 줄이 붙어도 탈퇴하기 버튼이 잘리지 않고, 두 번 눌러도 한 번 (이슈 #197)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE}/scenario`, { data: { sameUser: true } });
  await page.addInitScript(() => {
    localStorage.setItem(
      "cropmon-font-scale",
      JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
    );
  });
  await page.goto(
    `/auth/login?provider=google&next=${enc("/water?st=105&crop=apple")}`,
  );
  await page.waitForURL(/\/water\?/);
  await page.goto("/account/withdraw");
  await page.waitForLoadState("networkidle");
  const hint = page.getByText(
    "탈퇴하기를 누르면 연결을 끊기 위해 구글 로그인을 한 번 더 해요.",
  );
  await expect(hint).toBeVisible();
  const button = page.getByRole("button", { name: "탈퇴하기" });
  // 맨 아래까지 내렸을 때 버튼이 화면 안에서 끝까지 보이고, 탭바 같은 것이 위에서 덮지 않는다
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = (await button.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.y + box.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  const topmost = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toContain("탈퇴하기");
  const hintBox = (await hint.boundingBox())!;
  expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await expectNoHorizontalScroll(page);
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await button.dblclick();
  await page.waitForURL((u) => u.pathname === "/");
  const c = (await (await request.get(`${FAKE}/calls`)).json()) as {
    withdrawCalls: number;
    reauth: { authorizeCalls: unknown[] };
  };
  expect(c.withdrawCalls).toBe(1);
  expect(c.reauth.authorizeCalls.length).toBe(2); // 로그인 + 탈퇴 재로그인(두 번 눌러도 재로그인 한 번)
});
