import { expect, test, type Page } from "@playwright/test";

// 휴대폰 390×844 로 본다 (playwright.config 의 mobile 프로젝트). 가짜 Supabase 자료를 읽는다.

const SCREENS = [
  ["종합", "/?st=101&crop=apple"],
  ["물", "/water?st=101&crop=apple"],
  ["온도", "/temperature?st=101&crop=apple"],
  ["햇빛", "/sunlight?st=101&crop=apple"],
  ["토양", "/soil?st=101&crop=apple"],
  ["도매시장", "/market?st=101&crop=apple"],
  ["내 농장", "/my-farm"],
] as const;

const LIGHT_COLOR = "rgb(242 242 247)";
const DARK_COLOR = "#000";

/** 주소창 색(theme-color) meta 는 정확히 1개이고 media 가 없으며 값이 기대한 색이다. */
async function expectThemeColor(page: Page, color: string) {
  const meta = page.locator('meta[name="theme-color"]');
  await expect(meta).toHaveCount(1);
  await expect(meta).not.toHaveAttribute("media", /.*/);
  await expect(meta).toHaveAttribute("content", color);
}

test.describe("다크 설정인 휴대폰", () => {
  test.use({ colorScheme: "dark" });

  for (const [name, path] of SCREENS) {
    test(`${name}: 주소창 색 meta 가 1개이고 media 없이 다크 색`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectThemeColor(page, DARK_COLOR);
    });
  }

  test("주소창 색: 처음 열면 다크 색, 버튼으로 라이트를 고르면 라이트 색", async ({
    page,
  }) => {
    await page.goto("/water?st=101&crop=apple");
    await page.waitForLoadState("networkidle");
    await expectThemeColor(page, DARK_COLOR);
    await page.getByRole("button", { name: "라이트 모드로 보기" }).click();
    await expectThemeColor(page, LIGHT_COLOR);
  });

  test("처음 열면 설정을 따라 다크로 열린다", async ({ page }) => {
    await page.goto("/water?st=101&crop=apple");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)",
    );
  });

  test("버튼으로 라이트로 바꾸면 새로 고침해도 라이트가 유지된다", async ({
    page,
  }) => {
    await page.goto("/water?st=101&crop=apple");
    await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
    await page.getByRole("button", { name: "라이트 모드로 보기" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.getByRole("button", { name: "다크 모드로 보기" }),
    ).toBeVisible();
  });

  test("물 화면의 판정 카드가 상태별 다크 색이다", async ({ page }) => {
    await page.goto("/water?st=101&crop=apple");
    await expect(
      page.getByRole("region", { name: "지금 토양 상태" }),
    ).toHaveCSS("background-color", "rgb(51, 33, 17)");
  });

  for (const [name, path] of SCREENS) {
    test(`${name}: 가로로 넘치지 않는다`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("라이트 설정인 휴대폰", () => {
  test.use({ colorScheme: "light" });

  for (const [name, path] of SCREENS) {
    test(`${name}: 주소창 색 meta 가 1개이고 media 없이 라이트 색`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectThemeColor(page, LIGHT_COLOR);
    });
  }

  test("주소창 색: 버튼으로 다크를 고르면 바뀌고 새로 고침해도 유지된다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expectThemeColor(page, LIGHT_COLOR);
    await page.getByRole("button", { name: "다크 모드로 보기" }).click();
    await expectThemeColor(page, DARK_COLOR);
    await page.reload();
    await expectThemeColor(page, DARK_COLOR);
  });

  test("처음 열면 라이트, 다크 버튼을 누르면 다크로 기억한다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "다크 모드로 보기" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("저장된 선택이 없으면 휴대폰 설정이 바뀌는 대로 따른다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectThemeColor(page, DARK_COLOR);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expectThemeColor(page, LIGHT_COLOR);
  });
});
