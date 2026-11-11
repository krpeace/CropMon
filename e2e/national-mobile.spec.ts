import { expect, test, type Page } from "@playwright/test";

// 휴대폰 390×844 (playwright.config 의 mobile 프로젝트). 가짜 Supabase 자료를 읽는다. 태백(216)은 일부러 오류를 돌려준다.

const list = (page: Page) =>
  page.getByRole("region", { name: "전국 물·기상·생육 종합" });
const rowsOf = (page: Page) => list(page).getByRole("link");

async function open(page: Page, query: string) {
  await page.goto(`/${query}`);
  await page.waitForLoadState("networkidle"); // 탭 버튼이 살아난 뒤에 누른다
}

test("휴대폰: 전국 종합 목록이 보이고 줄 10개, 기본 탭은 물", async ({
  page,
}) => {
  await open(page, "?st=101&crop=apple");
  await expect(list(page)).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(10);
  await expect(list(page).getByRole("tab", { name: "물" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(list(page)).toContainText("부족한 물 / 관수 시작점");
});

test("휴대폰: 온도 탭은 평년 대비 ℃, 3일 탭은 머리글 '내일'", async ({
  page,
}) => {
  await open(page, "?st=101&crop=apple");
  await list(page).getByRole("tab", { name: "온도" }).click();
  await expect(rowsOf(page).filter({ hasText: "춘천" })).toContainText("+192℃");
  await list(page).getByRole("tab", { name: "3일" }).click();
  await expect(list(page).getByRole("tabpanel")).toContainText("내일");
  await expect(list(page).getByRole("tabpanel")).toContainText("모레");
});

test("휴대폰: 줄을 누르면 그 지역으로 바뀐다", async ({ page }) => {
  await open(page, "?st=101&crop=apple");
  await rowsOf(page).filter({ hasText: "수원" }).click();
  await expect(page).toHaveURL(/\/\?st=119&crop=apple$/);
});

test("휴대폰: 고른 탭은 새로 고침해도 남는다", async ({ page }) => {
  await open(page, "?st=101&crop=apple");
  await list(page).getByRole("tab", { name: "햇빛" }).click();
  await page.reload();
  await expect(list(page).getByRole("tab", { name: "햇빛" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("휴대폰(작물 공통): 3일 탭은 전망이 없다고 알린다", async ({ page }) => {
  await open(page, "?st=101&crop=common");
  await list(page).getByRole("tab", { name: "3일" }).click();
  await expect(list(page)).toContainText("작물 공통은 3일 전망이 없어요");
});

test("휴대폰: DB 오류인 태백 줄은 '자료 없음'", async ({ page }) => {
  await open(page, "?st=101&crop=apple");
  await expect(rowsOf(page).filter({ hasText: "태백" })).toContainText(
    "자료 없음",
  );
});

for (const scheme of ["light", "dark"] as const) {
  test(`휴대폰 ${scheme}: 모든 탭에서 가로로 넘치지 않는다`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, "?st=101&crop=apple");
    for (const name of ["물", "3일", "온도", "햇빛"]) {
      await list(page).getByRole("tab", { name }).click();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, name).toBeLessThanOrEqual(0);
    }
  });
}

test("'주의' 배지는 투명 바탕 + 주황 테두리", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/water?st=101&crop=apple");
  const badge = page
    .locator("span.rounded-full", { hasText: /^주의$/ })
    .first();
  await expect(badge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(badge).toHaveCSS("box-shadow", /rgb\(255, 141, 40\)/);
});

test("휴대폰: 전국 목록 추정 포함(안 3)·적산 기준일 예외(후보 3)가 390 폭에 들어온다", async ({
  page,
}) => {
  const threeDaysAgo = new Date(Date.now() + 9 * 3_600_000 - 3 * 86_400_000);
  const tag = `(${threeDaysAgo.getUTCMonth() + 1}/${threeDaysAgo.getUTCDate()})`;

  await open(page, "?st=101&crop=apple");
  await expect(list(page)).toContainText(
    "최근 기상 자료가 빠져 일부 지점은 추정이 포함된 값이에요 (추정 표시). 자료가 들어오면 바뀔 수 있어요.",
  );
  await expect(rowsOf(page).filter({ hasText: "전주" })).toContainText("추정");
  await expect(rowsOf(page).filter({ hasText: "서귀포" })).toContainText(
    "추정",
  );
  await expect(rowsOf(page).filter({ hasText: "춘천" })).not.toContainText(
    "추정",
  );

  for (const name of ["온도", "햇빛"] as const) {
    await list(page).getByRole("tab", { name }).click();
    await expect(list(page).getByRole("tabpanel")).toContainText(
      "어제까지 값이에요 (다른 날은 괄호 표시)",
    );
    await expect(rowsOf(page).filter({ hasText: "서귀포" })).toContainText(tag);
    await expect(rowsOf(page).filter({ hasText: "춘천" })).not.toContainText(
      tag,
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, name).toBeLessThanOrEqual(0);
  }
});
