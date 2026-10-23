import { expect, test, type Page } from "@playwright/test";

const region = (page: Page) => page.getByRole("group", { name: "지역" });
const crop = (page: Page) => page.getByRole("group", { name: "작물" });
const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

async function expectSelected(page: Page, station: string, cropName: string) {
  await expect(
    region(page).getByRole("link", { name: station }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    crop(page).getByRole("link", { name: cropName }),
  ).toHaveAttribute("aria-current", "true");
}

test("지역·작물을 바꾸면 다른 메뉴에서도 유지된다", async ({ page }) => {
  await page.goto("/water");
  await expectSelected(page, "춘천", "사과");

  await region(page).getByRole("link", { name: "안동" }).click();
  await expect(page).toHaveURL(/\/water\?st=136&crop=apple$/);
  await crop(page).getByRole("link", { name: "배추" }).click();
  await expect(page).toHaveURL(/\/water\?st=136&crop=cabbage$/);

  for (const [label, path] of [
    ["온도", "/temperature"],
    ["햇빛", "/sunlight"],
    ["토양", "/soil"],
    ["도매시장", "/market"],
    ["물", "/water"],
  ] as const) {
    await menu(page).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}\\?st=136&crop=cabbage$`));
    await expectSelected(page, "안동", "배추");
  }

  await page
    .getByRole("link", { name: /CropMon/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/\?st=136&crop=cabbage$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 안동 배추는 어떤가요?",
  );
});

test("햇빛을 재지 않는 지점은 햇빛 화면에 '자료 없음'이 보인다", async ({
  page,
}) => {
  await page.goto("/sunlight?st=216&crop=apple");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "태백(216) 일사 관측 · 자료 없음",
  );
});

test("주소창의 잘못된 값은 춘천·사과로 돌린다", async ({ page }) => {
  await page.goto("/temperature?st=999&crop=rice");
  await expectSelected(page, "춘천", "사과");
});

test("종합 화면은 5초마다 다음 지역으로 바뀌고, 멈출 수 있다", async ({
  page,
}) => {
  // 실제 시간으로 기다린다. 가짜 시계는 화면 이동까지 멈춰 버린다.
  await page.goto("/?st=101&crop=apple");
  await expect(page.getByText("1 / 20")).toBeVisible();

  await expect(page).toHaveURL(/\/\?st=216&crop=apple$/, { timeout: 8_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 태백 사과는 어떤가요?",
  );
  await expect(page.getByText("2 / 20")).toBeVisible();

  await page.getByRole("button", { name: "자동 전환 중지" }).click();
  await page.waitForTimeout(6_000);
  await expect(page).toHaveURL(/\/\?st=216&crop=apple$/);
  await expect(
    page.getByRole("button", { name: "자동 전환 시작" }),
  ).toBeVisible();
});
