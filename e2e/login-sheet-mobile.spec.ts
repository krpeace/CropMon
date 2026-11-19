import type { APIRequestContext } from "@playwright/test";

import { expect, test, type Page } from "./fixtures";

// 휴대폰(390) 로그인 시트 · 내 계정 시트 (이슈 #189, 결정 0064). 스위치 "켬" 서버(3101)를 읽는다.
// 아래에서 올라오는 BottomSheet(결정 0050) · 낮은 화면에서 둘째 버튼이 가려지지 않음 · 글씨 150%에서 넘치지 않음.
// 실제 손가락 · 홈 막대는 이 시험으로 못 본다(실기 확인은 O3 — 스위치가 꺼져 있어 운영에서는 볼 것이 없다).
// 가짜의 시나리오는 전역 값이라 이 파일은 차례로 돈다.

test.describe.configure({ mode: "serial" });
test.use({ baseURL: "http://localhost:3101" });

const FAKE = "http://127.0.0.1:54321/__fake";
const reset = (request: APIRequestContext) => request.post(`${FAKE}/reset`);
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const bar = (page: Page) => page.locator("header");
const loginButton = (page: Page) =>
  bar(page).getByRole("button", { name: "로그인", exact: true });
const profileButton = (page: Page) =>
  bar(page).getByRole("button", { name: "내 계정" });
const loginSheet = (page: Page) => page.getByRole("dialog", { name: "로그인" });
const accountSheet = (page: Page) =>
  page.getByRole("dialog", { name: "내 계정" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('휴대폰 맥락 바 오른쪽은 처음부터 "로그인" 하나이고, 누르면 아래에서 올라오는 시트가 열린다 (끌기 손잡이 있음)', async ({
  page,
}) => {
  await open(page, "/water?st=105&crop=apple");
  await expect(page.getByRole("button", { name: /로그인/ })).toHaveCount(1);
  await loginButton(page).click();
  const sheet = loginSheet(page);
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("sheet-grip")).toBeVisible();
  const vh = page.viewportSize()!.height;
  // 올라오는 움직임이 끝나면 화면 아래에 붙는다
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return Math.round(b.y + b.height);
    })
    .toBe(vh);
  expect((await sheet.boundingBox())!.width).toBeCloseTo(390, 0);
  // 시트가 열린 동안 맥락 바의 "로그인"은 숨는다
  await expect(loginButton(page)).toBeHidden();
  // 닫으면 보던 화면 그대로
  await sheet.getByRole("button", { name: "닫기" }).click();
  await expect(sheet).toBeHidden();
  expect(here(page)).toBe("/water?st=105&crop=apple");
  await expect(loginButton(page)).toBeVisible();
});

test("덮개를 눌러도 닫힌다", async ({ page }) => {
  await open(page, "/");
  await loginButton(page).click();
  await expect(loginSheet(page)).toBeVisible();
  await page.mouse.click(195, 10); // 시트 위로 남는 덮개
  await expect(loginSheet(page)).toBeHidden();
});

test("버튼 셋: 높이 52 · 같은 너비 · 네이버는 준비 중 · 탭 대상 44 이상", async ({
  page,
}) => {
  await open(page, "/");
  await loginButton(page).click();
  const sheet = loginSheet(page);
  const targets = [
    sheet.getByRole("link", { name: "카카오 로그인" }),
    sheet.getByRole("button", { name: /네이버 로그인/ }),
    sheet.getByRole("link", { name: "Google 계정으로 로그인" }),
  ];
  const boxes = await Promise.all(
    targets.map(async (t) => (await t.boundingBox())!),
  );
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(52 - 0.5);
    expect(b.width).toBeCloseTo(boxes[0].width, 0);
  }
  await expect(targets[1]).toBeDisabled();
  const closeBox = (await sheet
    .getByRole("button", { name: "닫기" })
    .boundingBox())!;
  expect(closeBox.height).toBeGreaterThanOrEqual(44 - 0.5);
});

test.describe("낮은 화면 390×370", () => {
  test.use({ viewport: { width: 390, height: 370 } });

  test("둘째 버튼(네이버)이 탭바 · 아래 안전 영역에 가려지지 않는다 — 시트 안에서 스크롤하면 끝까지 닿는다", async ({
    page,
  }) => {
    await open(page, "/");
    await loginButton(page).click();
    const sheet = loginSheet(page);
    await expect(sheet).toBeVisible();
    const naver = sheet.getByRole("button", { name: /네이버 로그인/ });
    await naver.scrollIntoViewIfNeeded();
    const b = (await naver.boundingBox())!;
    const s = (await sheet.boundingBox())!;
    // 네이버 버튼이 시트 안에 완전히 들어오고, 시트가 화면 아래에 닿는다(탭바 위에 겹쳐 가려지지 않는다)
    expect(b.y).toBeGreaterThanOrEqual(s.y - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + s.height + 1);
    expect(s.y + s.height).toBeLessThanOrEqual(370 + 1);
    // 눌러 볼 수 있는 자리의 맨 위 요소가 이 버튼(또는 안쪽)이다 — 탭바가 덮고 있지 않다
    const top = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("button, a")?.textContent ??
        "",
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    );
    expect(top).toContain("네이버");
  });
});

test.describe("글씨 150%", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "cropmon-font-scale",
          JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
        );
      } catch {
        // 저장소가 막힌 환경은 그대로 둔다
      }
    });
  });

  test("로그인 시트가 가로로 넘치지 않는다", async ({ page }) => {
    await open(page, "/");
    await loginButton(page).click();
    const sheet = loginSheet(page);
    await expect(sheet).toBeVisible();
    const overflow = await sheet.evaluate((el) => {
      const own = el.scrollWidth - el.clientWidth;
      const doc =
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth;
      return { own, doc };
    });
    expect(overflow.own).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
  });
});

test("로그인하면 맥락 바가 프로필로 바뀌고, 내 계정 시트는 아래 시트이며 로그아웃으로 돌아온다", async ({
  page,
}) => {
  await open(page, "/water?st=105&crop=apple");
  await loginButton(page).click();
  await loginSheet(page).getByRole("link", { name: "카카오 로그인" }).click();
  await expect(page.getByTestId("toast")).toHaveText("로그인했어요");
  await expect(profileButton(page)).toBeVisible();
  await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
  // 알림이 탭바(아래 바)에 가리지 않는다 — 탭바 위에 뜬다
  const t = (await page.getByTestId("toast").boundingBox())!;
  const tab = await page
    .getByRole("navigation", { name: "메뉴" })
    .last()
    .boundingBox();
  if (tab) expect(t.y + t.height).toBeLessThanOrEqual(tab.y + 1);

  await profileButton(page).click();
  const sheet = accountSheet(page);
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("sheet-grip")).toBeVisible();
  await sheet.getByRole("button", { name: "로그아웃" }).click();
  await page.waitForURL(/\/water\?st=105&crop=apple$/);
  await expect(loginButton(page)).toBeVisible();
});

test("/farm/settings 를 열면 시트가 열리고 닫으면 주소가 /", async ({
  page,
}) => {
  await page.goto("/farm/settings");
  await expect(loginSheet(page)).toBeVisible();
  await loginSheet(page).getByRole("button", { name: "닫기" }).click();
  await expect(loginSheet(page)).toBeHidden();
  expect(here(page)).toBe("/");
});
