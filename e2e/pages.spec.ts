import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "오늘 춘천 사과는 어떤가요?" },
  { path: "/temperature", heading: "온도" },
  { path: "/sunlight", heading: "햇빛" },
  { path: "/water", heading: "물" },
  { path: "/soil", heading: "토양" },
  { path: "/market", heading: "도매시장" },
  { path: "/my-farm", heading: "내 농장" },
];

for (const { path, heading } of PAGES) {
  test(`${path} 가 열린다`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("navigation", { name: "메뉴" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(
      "자료 출처: 기상청",
    );
  });
}

test("종합이 아닌 쪽은 아래에 자료·발표·갱신을 보여 준다", async ({ page }) => {
  await page.goto("/soil");
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("자료");
  await expect(meta).toContainText("발표");
  await expect(meta).toContainText("갱신");
  await expect(meta).toContainText("자료 없음");
});
