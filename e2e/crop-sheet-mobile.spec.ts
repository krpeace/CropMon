import { expect, test, type Page } from "@playwright/test";

// 휴대폰(mobile 프로젝트 390×844)에서 작물 고르기 판만 뜨고 "CropMon 소개" 창이 같이 뜨지 않는다. 가짜 Supabase 자료를 읽는다.

const cropDialog = (page: Page) =>
  page.getByRole("dialog", { name: "작물 고르기" });
const aboutDialog = (page: Page) =>
  page.getByRole("dialog", { name: "CropMon 소개" });
const cropButton = (page: Page) =>
  page.getByRole("group", { name: "작물" }).getByRole("button").first();

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
}

for (const crop of ["apple", "common"]) {
  test(`작물 버튼(crop=${crop}): 작물 고르기 판만 뜨고 소개 창은 없다`, async ({
    page,
  }) => {
    await open(page, `/water?st=101&crop=${crop}`);
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(aboutDialog(page)).toHaveCount(0);
  });
}

test("목록에서 배추를 누르면 주소가 crop=cabbage 로 바뀌고 판이 닫힌다", async ({
  page,
}) => {
  await open(page, "/water?st=101&crop=apple");
  await cropButton(page).click();
  await cropDialog(page).getByRole("link", { name: /배추/ }).click();
  await expect(page).toHaveURL(/crop=cabbage/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("지역 고르기 판과 CropMon 소개 창은 기존처럼 열린다", async ({
  page,
}) => {
  await open(page, "/water?st=101&crop=apple");
  await page
    .getByRole("group", { name: "지역" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "지역 고르기" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "CropMon 소개" }).click();
  await expect(aboutDialog(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
