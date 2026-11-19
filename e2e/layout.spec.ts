import { expect, test, type Page } from "./fixtures";

// 화면 구성 화면 /layout — 데스크톱 1440 (이슈 #176, 결정 0058). 데스크톱은 주소로만 열린다(들어가는 길은 로그인 이슈의 "내 계정").
// 데스크톱 메뉴 줄은 순서를 바꾸지 않는다 — 늘 기본 순서이고 끈 메뉴만 숨긴다(셸 설계 4-3, 결정 0046).

const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });
const labels = async (page: Page) =>
  (await menu(page).getByRole("link").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );

test.describe("데스크톱 1440", () => {
  test.skip(({ isMobile }) => isMobile);

  test("/layout 이 열리고 깨지지 않는다(본문 폭 제한, 가로 넘침 없음)", async ({
    page,
  }) => {
    await page.goto("/layout?st=101&crop=apple");
    await expect(
      page.getByRole("heading", { level: 1, name: "화면 구성" }),
    ).toBeVisible();
    await expect(page.getByTestId("layout-row")).toHaveCount(10);
    await expect(page).toHaveTitle("CropMon · 화면 구성");
    const w = await page
      .getByTestId("layout-body")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(720.5);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });

  test("'토양' 끄기 → 데스크톱 메뉴 줄에서 토양이 빠진다", async ({ page }) => {
    await page.goto("/layout?st=101&crop=apple");
    await expect(page.getByTestId("layout-row")).toHaveCount(10);
    expect(await labels(page)).toContain("토양");
    await page.getByRole("switch", { name: "토양 사용" }).click();
    await expect(
      page.getByRole("switch", { name: "토양 사용" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => labels(page)).not.toContain("토양");
    expect(await labels(page)).toHaveLength(9);
    // 새로고침해도 그대로
    await page.reload();
    await expect(page.getByTestId("layout-row").first()).toBeVisible();
    await expect.poll(() => labels(page)).not.toContain("토양");
  });

  test("순서를 바꿔도 데스크톱 메뉴 줄 순서는 기본 그대로", async ({
    page,
  }) => {
    await page.goto("/layout?st=101&crop=apple");
    await expect(page.getByTestId("layout-row")).toHaveCount(10);
    const before = await labels(page);
    await page.getByRole("button", { name: "햇빛 위로" }).click();
    await page.getByRole("button", { name: "햇빛 위로" }).click();
    // 목록은 바뀌었다
    const first = await page
      .getByTestId("layout-row")
      .evaluateAll((els) =>
        els.slice(0, 3).map((e) => e.getAttribute("data-menu")),
      );
    expect(first).toEqual(["home", "sun", "water"]);
    // 데스크톱 메뉴 줄은 그대로
    expect(await labels(page)).toEqual(before);
  });
});
