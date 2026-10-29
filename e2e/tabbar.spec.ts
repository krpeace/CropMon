import { expect, test, type Page } from "@playwright/test";

// 하단 탭바. 휴대폰(mobile 프로젝트 390×844)에서는 아래 유리 캡슐, 1440 데스크톱에서는 상단 메뉴만 보인다.
// 가짜 Supabase 자료를 읽는다.

const MENU = ["종합", "온도", "햇빛", "물", "토양", "도매시장"];
const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.describe("휴대폰", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("메뉴 6개가 순서대로 보이고 현재 메뉴에만 aria-current", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const links = menu(page).getByRole("link");
    await expect(links).toHaveCount(6);
    await expect(links).toHaveText(MENU);
    await expect(menu(page).locator('[aria-current="page"]')).toHaveText("물");
  });

  test("탭을 누르면 지역·작물이 유지된다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await menu(page).getByRole("link", { name: "온도" }).click();
    await expect(page).toHaveURL(/\/temperature\?st=101&crop=apple$/);
  });

  test("탭바 위치·크기: 아래에서 12px 이상, 높이 66, 탭 높이 44 이상", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const box = await menu(page).boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box!.height).toBe(66);
    expect(vh - (box!.y + box!.height)).toBeGreaterThanOrEqual(12);
    for (const link of await menu(page).getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("맨 아래까지 내려도 '소개' 버튼이 탭바에 가려지지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const about = await page
      .getByRole("button", { name: "CropMon 소개" })
      .boundingBox();
    const bar = await menu(page).boundingBox();
    expect(about!.y + about!.height).toBeLessThan(bar!.y);
  });

  test("폭 360에서도 가로로 넘치지 않고 '도매시장'이 잘리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, "/water?st=101&crop=apple");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const fits = await menu(page)
      .getByText("도매시장", { exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
  });

  test("다크에서도 보이고 선택 탭 글자색이 라이트와 다르다", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, "/water?st=101&crop=apple");
    const current = menu(page).locator('[aria-current="page"]');
    const light = await current.evaluate((el) => getComputedStyle(el).color);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(menu(page)).toBeVisible();
    await expect
      .poll(() => current.evaluate((el) => getComputedStyle(el).color))
      .not.toBe(light);
  });

  test("지역 시트를 열면 시트가 탭바 위를 덮는다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await page
      .getByRole("group", { name: "지역" })
      .getByRole("button")
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "지역 고르기" }),
    ).toBeVisible();
    const bar = (await menu(page).boundingBox())!;
    const covered = await page.evaluate(
      ({ x, y }) =>
        !document.elementFromPoint(x, y)?.closest('nav[aria-label="메뉴"]'),
      { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 },
    );
    expect(covered).toBe(true);
  });
});

test.describe("데스크톱", () => {
  test.skip(({ isMobile }) => isMobile);

  test("1440 에서는 화면 아래 고정된 탭바가 없고 상단 메뉴가 보인다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page)).toBeVisible();
    const box = await menu(page).boundingBox();
    expect(box!.y).toBeLessThan(120); // 위쪽 머리말 안
    const fixedAtBottom = await page.evaluate(() =>
      [...document.querySelectorAll("nav")].some((n) => {
        const s = getComputedStyle(n);
        return s.position === "fixed" && s.display !== "none";
      }),
    );
    expect(fixedAtBottom).toBe(false);
  });
});
