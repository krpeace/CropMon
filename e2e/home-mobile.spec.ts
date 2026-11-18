import { expect, test } from "./fixtures";

// 휴대폰(390) 종합: 자동 전환은 돌지 않고 그려지지도 않는다 (결정 0053).
// 실제 시간으로 기다린다 — 가짜 시계는 화면 이동까지 멈춰 버린다.

test("휴대폰 종합: 자동 전환 버튼 · n / 10 · 진행 막대가 없다", async ({
  page,
}) => {
  await page.goto("/?st=101&crop=apple");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 춘천 사과는 어떤가요?",
  );
  await expect(page.getByRole("button", { name: /자동 전환/ })).toHaveCount(0);
  await expect(page.getByText("1 / 10")).toHaveCount(0);
});

test("휴대폰 종합: 6초를 두어도 주소와 제목이 그대로다", async ({ page }) => {
  await page.goto("/?st=101&crop=apple");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 춘천 사과는 어떤가요?",
  );
  await page.waitForTimeout(6_000);
  await expect(page).toHaveURL(/\/\?st=101&crop=apple$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 춘천 사과는 어떤가요?",
  );
});

test("휴대폰 종합: 준비 중 카드 이름은 '시세'이고 '도매시장'은 없다", async ({
  page,
}) => {
  await page.goto("/?st=101&crop=apple");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^시세/ })).toContainText(
    "지금 얼마에 팔리고, 앞으로 값은?",
  );
  await expect(main.getByRole("link", { name: /^시세/ })).not.toContainText(
    "도매시장",
  );
  await expect(main.getByRole("link", { name: /^도매시장/ })).toHaveCount(0);
});
