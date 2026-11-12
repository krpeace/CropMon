import { expect, test, type Page } from "@playwright/test";

// 가짜 Supabase(e2e/fake-supabase.mjs) 자료로 본다. 춘천(101) 어제까지 적산일사 3,218 / 평년 3,352 (96%),
// 3월이 가장 적은 달. 진주(192)는 sun_daily 줄이 없고, 태백(216)만 묻는 읽기는 오류를 돌려준다.

const total = (page: Page) =>
  page.getByRole("region", { name: "올해 쌓인 햇빛" });
const chart = (page: Page) =>
  page.getByRole("region", { name: "적산일사 누적" });
const months = (page: Page) => page.getByRole("region", { name: "월별 햇빛" });
const compare = (page: Page) =>
  page.getByRole("region", { name: "지역 비교 · 평년 대비 햇빛" });

test("햇빛: 평년 대비 %·적산일사·설명·평년 기간이 DB 값으로", async ({
  page,
}) => {
  await page.goto("/sunlight?st=101&crop=apple");
  await expect(total(page)).toContainText("어제까지 관측 기준");
  await expect(total(page)).toContainText("올해 햇빛은 평년의 96%");
  await expect(total(page)).toContainText("적산일사 3,218 / 평년 3,352 MJ/m²");
  await expect(total(page)).toContainText("평년보다 조금 적었어요.");
  await expect(total(page)).toContainText("3월이 가장 적었어요");
  await expect(chart(page)).toContainText("평년 2016–2025");

  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("기상청 ASOS 춘천(101) 일사 관측");
  await expect(meta).toContainText("평년 2016–2025");
  // 갱신 시각 = sun_daily 마지막 계산 시각(09:20). 관측 받은 시각(02:20)이 아니다.
  await expect(meta).toContainText("09:20");
  await expect(meta).toContainText("일까지 관측");
  await expect(meta).not.toContainText("02:20");
});

test("햇빛: 누적 그래프(올해·평년·오늘)와 월별 막대 %(95% 미만은 주황)", async ({
  page,
}) => {
  await page.goto("/sunlight?st=101&crop=apple");
  await expect(chart(page)).toContainText("올해");
  await expect(chart(page)).toContainText("오늘");
  await expect(chart(page).locator("svg path")).not.toHaveCount(0);

  await expect(months(page)).toContainText("1월");
  await expect(months(page)).toContainText(/\d+월은 \d+일까지/);
  const march = months(page).getByTestId("pct-3");
  await expect(march).toHaveAttribute("data-low", "true");
  await expect(march).toHaveCSS("color", "rgb(176, 74, 0)");
});

test("햇빛: 지역 비교 10줄, 자료 없는 지점은 '자료 없음', 누르면 그 지역으로", async ({
  page,
}) => {
  await page.goto("/sunlight?st=101&crop=apple");
  const links = compare(page).getByRole("link");
  await expect(links).toHaveCount(10);
  await expect(links.filter({ hasText: "춘천" })).toContainText("96%");
  await expect(links.filter({ hasText: "진주" })).toContainText("자료 없음");

  await links.filter({ hasText: "안동" }).click();
  await expect(page).toHaveURL(/\/sunlight\?st=136&crop=apple$/);
  await expect(
    compare(page).getByRole("link", { name: /^안동/ }),
  ).toHaveAttribute("aria-current", "true");
});

test("햇빛: sun_daily 가 없는 지점은 '햇빛을 재지 않아요'와 가까운 지점 버튼", async ({
  page,
}) => {
  await page.goto("/sunlight?st=192&crop=apple");
  const none = page.getByRole("region", { name: "햇빛 자료 없음" });
  await expect(none).toContainText("자료 없음");
  await expect(none).toContainText("진주 관측소는 햇빛을 재지 않아요");
  // 자료 상자도 같은 기준(sun_daily 줄 없음)으로 '자료 없음'
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("일사 관측 · 자료 없음");
  await expect(meta).not.toContainText("09:20");
  await none.getByRole("link", { name: "춘천 햇빛 보기" }).click();
  await expect(page).toHaveURL(/\/sunlight\?st=101&crop=apple$/);
  await expect(total(page)).toContainText("올해 햇빛은 평년의 96%");
});

test("햇빛: sun_daily 에 null 365줄만 있는 미측정 지점도 '햇빛을 재지 않아요' (울진)", async ({
  page,
}) => {
  await page.goto("/sunlight?st=130&crop=apple");
  const none = page.getByRole("region", { name: "햇빛 자료 없음" });
  await expect(none).toContainText("자료 없음");
  await expect(none).toContainText("울진 관측소는 햇빛을 재지 않아요");
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("일사 관측 · 자료 없음");
});

test("햇빛: 사전은 '확인 안 됨'이어도 sun_daily 자료가 있으면 본문·자료 상자 모두 자료를 보여 준다 (홍천)", async ({
  page,
}) => {
  await page.goto("/sunlight?st=212&crop=apple");
  await expect(total(page)).toContainText("올해 햇빛은 평년의");
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("기상청 ASOS 홍천(212) 일사 관측");
  await expect(meta).not.toContainText("자료 없음");
  await expect(meta).toContainText("09:20");
  await expect(meta).toContainText("평년 2016–2025");
});

test("햇빛: DB 가 오류를 줘도 멈추지 않고 '자료 없음' (태백)", async ({
  page,
}) => {
  const response = await page.goto("/sunlight?st=216&crop=apple");
  expect(response?.status()).toBe(200);
  await expect(total(page)).toContainText("자료 없음");
  await expect(total(page)).toContainText("햇빛 자료를 불러오지 못했어요");
  await expect(total(page)).not.toContainText("DB");
  await expect(compare(page).getByRole("link")).toHaveCount(10);
});

test("햇빛: 휴대폰 폭(390)에서 옆으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sunlight?st=101&crop=apple");
  await expect(total(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("햇빛: 지역 비교 기준일 다름(후보 3) — 상단 안내와 예외 지점(서귀포) 괄호 날짜", async ({
  page,
}) => {
  const threeDaysAgo = new Date(Date.now() + 9 * 3_600_000 - 3 * 86_400_000);
  const tag = `(${threeDaysAgo.getUTCMonth() + 1}/${threeDaysAgo.getUTCDate()})`;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sunlight?st=101&crop=apple");
  await expect(compare(page)).toContainText(
    "어제까지 값이에요 (다른 날은 괄호 표시)",
  );
  await expect(
    compare(page).getByRole("link", { name: /^서귀포/ }),
  ).toContainText(tag);
  await expect(
    compare(page).getByRole("link", { name: /^춘천/ }),
  ).not.toContainText(tag);
  await expect(
    compare(page).getByRole("link", { name: /^진주/ }),
  ).not.toContainText(tag);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
