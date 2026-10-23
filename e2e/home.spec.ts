import { expect, test, type Page } from "@playwright/test";

const main = (page: Page) => page.getByRole("main");

/** 자동 전환을 멈춰 두고 본다. */
async function openHome(page: Page, query: string) {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: "자동 전환 중지" }).click();
}

test("종합: 물·온도·햇빛 카드와 준비 중 카드가 시안 값으로 보인다", async ({
  page,
}) => {
  await openHome(page, "?st=101&crop=apple");

  const water = main(page).getByRole("link", { name: /^물/ });
  await expect(water).toContainText("내일 관수 필요");
  await expect(water).toContainText("오늘은 괜찮아요, 내일 물 주세요");
  await expect(water).toContainText("부족한 물 31 mm / 관수 시작점 35 mm");

  await expect(main(page).getByRole("link", { name: /^온도/ })).toContainText(
    "적산온도 1,972 / 평년 1,910 ℃·일",
  );
  await expect(main(page).getByRole("link", { name: /^햇빛/ })).toContainText(
    "올해 햇빛은 평년의 96%",
  );
  await expect(main(page).getByRole("link", { name: /^토양/ })).toContainText(
    "준비 중",
  );
  await expect(
    main(page).getByRole("link", { name: /^도매시장/ }),
  ).toContainText("지금 얼마에 팔리고, 앞으로 값은?");
});

test("종합: 카드를 누르면 고른 지역·작물 그대로 그 메뉴로 간다", async ({
  page,
}) => {
  await openHome(page, "?st=136&crop=cabbage");
  await main(page).getByRole("link", { name: /^물/ }).click();
  await expect(page).toHaveURL(/\/water\?st=136&crop=cabbage$/);
});

test("종합: 전국 표에서 줄을 누르면 그 지역으로 바뀐다", async ({ page }) => {
  await openHome(page, "?st=101&crop=apple");
  const table = page.getByRole("region", { name: "전국 물·환기상·생육 종합" });
  await expect(table.getByRole("link")).toHaveCount(10);

  await table.getByRole("link", { name: /^안동/ }).click();
  await expect(page).toHaveURL(/\/\?st=136&crop=apple$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 안동 사과는 어떤가요?",
  );
  await expect(main(page).getByRole("link", { name: /^물/ })).toContainText(
    "오늘 물 주세요",
  );
});

test("종합: '내 밭 단위로 보고 싶다면'을 누르면 내 농장 미리보기로 간다", async ({
  page,
}) => {
  await openHome(page, "?st=101&crop=apple");
  await page.getByRole("link", { name: /내 밭 단위로 보고 싶다면/ }).click();
  await expect(page).toHaveURL(/\/my-farm\?st=101&crop=apple$/);
});

test("종합: 태백은 햇빛 카드가 '자료 없음'", async ({ page }) => {
  await openHome(page, "?st=216&crop=apple");
  await expect(main(page).getByRole("link", { name: /^햇빛/ })).toContainText(
    "태백 관측소는 햇빛(일사)을 재지 않아요",
  );
});
