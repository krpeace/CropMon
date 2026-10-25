import { expect, test, type Page } from "@playwright/test";

// 가짜 Supabase(e2e/fake-supabase.mjs) 자료로 본다. 춘천(101) 어제까지 적산온도 4,165 / 평년 3,973,
// 수원(119)은 다음 단계에 아직 닿지 않았고, 태백(216)은 오류를 돌려준다.

const speed = (page: Page) => page.getByRole("region", { name: "생육 속도" });
const stages = (page: Page) =>
  page.getByRole("region", { name: "적산온도 단계" });
const chart = (page: Page) =>
  page.getByRole("region", { name: "적산온도 누적" });
const compare = (page: Page) =>
  page.getByRole("region", { name: "지역 비교 · 평년보다 며칠 빠른가" });

test("온도: 생육 속도가 DB 값으로 (문구·숫자·평년 기간·기준 온도)", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  await expect(speed(page)).toContainText("어제까지 관측 기준");
  await expect(speed(page)).toContainText("평년보다 생육 20일 빠름");
  await expect(speed(page)).toContainText(
    "적산온도 4,165 / 평년 3,973 ℃·일 (+192)",
  );
  await expect(speed(page)).toContainText("기준 온도 4℃ · 1월 1일부터");
  await expect(chart(page)).toContainText("평년 2016–2025");

  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("기상청 ASOS 춘천(101) 일 관측");
  await expect(meta).toContainText("평년 2016–2025");
});

test("온도: 단계 카드 2개 — 올해·평년 도달일, 아직이면 '아직'", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  await expect(stages(page)).toContainText("적산온도 3,500 ℃·일");
  await expect(stages(page)).toContainText("적산온도 4,000 ℃·일");
  // 평년 도달일 (연말에는 평년 누적이 마지막 단계에 닿지 않을 수 있어 "평년에는 닿지 않아요"도 된다)
  await expect(stages(page).getByText(/^평년/)).toHaveCount(2);

  await page.goto("/temperature?st=119&crop=apple");
  await expect(stages(page)).toContainText("적산온도 2,500 ℃·일");
  await expect(stages(page)).toContainText("아직");
});

test("온도: 누적 그래프에 올해·평년·오늘, 예상 점선은 없다", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  await expect(chart(page)).toContainText("올해");
  await expect(chart(page)).toContainText("오늘");
  await expect(chart(page)).not.toContainText("예상");
  await expect(chart(page).locator("svg path")).not.toHaveCount(0);
});

test("온도: 지역 비교 10줄, 누르면 그 지역으로 바뀌고 굵게", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  const links = compare(page).getByRole("link");
  await expect(links).toHaveCount(10);
  await expect(links.filter({ hasText: "춘천" })).toContainText("+20일");

  await links.filter({ hasText: "안동" }).click();
  await expect(page).toHaveURL(/\/temperature\?st=136&crop=apple$/);
  const andong = compare(page).getByRole("link", { name: /^안동/ });
  await expect(andong).toHaveAttribute("aria-current", "true");
  await expect(andong.locator("span").first()).toHaveCSS("font-weight", "800");
});

test("온도: 저온요구량은 '준비 중'", async ({ page }) => {
  await page.goto("/temperature?st=101&crop=apple");
  const chill = page.getByRole("region", { name: "저온요구량 충족도" });
  await expect(chill).toContainText("준비 중");
  await expect(chill).toContainText("시간별 기온이 필요해 공개 뒤에 열려요");

  await page.goto("/temperature?st=101&crop=cabbage");
  await expect(chill).toContainText("배추는 저온요구량을 따지지 않아요");
});

test("온도: DB 가 오류를 줘도 멈추지 않고 '자료 없음' (태백)", async ({
  page,
}) => {
  const response = await page.goto("/temperature?st=216&crop=apple");
  expect(response?.status()).toBe(200);
  await expect(speed(page)).toContainText("자료 없음");
  await expect(speed(page)).toContainText("DB에서 온도 자료를 읽지 못했어요");
  // 지역 비교는 지점 여러 곳을 한 번에 읽으므로 그대로 보인다
  await expect(compare(page).getByRole("link")).toHaveCount(10);
});

test("온도: 휴대폰 폭(390)에서 옆으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/temperature?st=101&crop=apple");
  await expect(speed(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
