import { expect, test, type Page } from "@playwright/test";

const region = (page: Page) => page.getByRole("group", { name: "지역" });
const crop = (page: Page) => page.getByRole("group", { name: "작물" });
const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

async function expectSelected(page: Page, station: string, cropName: string) {
  await expect(
    region(page).getByRole("link", { name: station }),
  ).toHaveAttribute("aria-current", "true");
  await expect(crop(page).getByRole("button")).toContainText(cropName);
}

async function selectCrop(page: Page, cropName: string) {
  await crop(page).getByRole("button").click();
  await page
    .getByRole("listbox", { name: "작물 목록" })
    .getByRole("link", { name: new RegExp(`^${cropName}`) })
    .click();
}

test("지역·작물을 바꾸면 다른 메뉴에서도 유지된다", async ({ page }) => {
  await page.goto("/water");
  await expectSelected(page, "춘천", "작물 공통");

  await region(page).getByRole("link", { name: "안동" }).click();
  await expect(page).toHaveURL(/\/water\?st=136&crop=common$/);
  await selectCrop(page, "배추");
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
  await page.goto("/sunlight?st=192&crop=apple");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "진주(192) 일사 관측 · 자료 없음",
  );
});

test("주소창의 잘못된 값은 춘천·작물 공통으로 돌린다", async ({ page }) => {
  await page.goto("/temperature?st=999&crop=rice");
  await expectSelected(page, "춘천", "작물 공통");
});

test("폐지 지점(st=116 관악산)으로 접속하면 기본 지점(101)으로 이동하고 안내를 표시한다", async ({
  page,
}) => {
  await page.goto("/temperature?st=116&crop=apple");
  await expect(page).toHaveURL(/\/temperature\?st=101&crop=apple&from=116$/);
  await expect(
    page.getByText(
      "관악산(116)은 관측이 중단된 지점이라 기본 지점을 보여 드려요",
    ),
  ).toBeVisible();
});

test("폐지 지점(st=175 진도 첨찰산)은 종합 화면에서도 101로 이동하고 안내를 표시한다", async ({
  page,
}) => {
  await page.goto("/?st=175");
  await expect(page).toHaveURL(/\/\?st=101&from=175$/);
  await expect(
    page.getByText(
      "진도(첨찰산)(175)은 관측이 중단된 지점이라 기본 지점을 보여 드려요",
    ),
  ).toBeVisible();
});

test("사전에 없는 지점(st=999)이나 유효하지 않은 from(abc, 999, 108 운영 지점)은 안내 문구가 뜨지 않는다", async ({
  page,
}) => {
  for (const url of [
    "/temperature?st=999&crop=apple",
    "/temperature?st=101&from=abc",
    "/temperature?st=101&from=999",
    "/temperature?st=101&from=108",
  ]) {
    await page.goto(url);
    await expect(
      page.getByText("관측이 중단된 지점이라 기본 지점을 보여 드려요"),
    ).not.toBeVisible();
  }
});

test("종합 화면은 5초마다 다음 지역으로 바뀌고(대표 10곳만), 멈출 수 있다", async ({
  page,
}) => {
  // 실제 시간으로 기다린다. 가짜 시계는 화면 이동까지 멈춰 버린다.
  await page.goto("/?st=101&crop=apple");
  await expect(page.getByText("1 / 10")).toBeVisible();

  await expect(page).toHaveURL(/\/\?st=216&crop=apple$/, { timeout: 8_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 태백 사과는 어떤가요?",
  );
  await expect(page.getByText("2 / 10")).toBeVisible();

  await page.getByRole("button", { name: "자동 전환 중지" }).click();
  await page.waitForTimeout(6_000);
  await expect(page).toHaveURL(/\/\?st=216&crop=apple$/);
  await expect(
    page.getByRole("button", { name: "자동 전환 시작" }),
  ).toBeVisible();
});

test("지역 칩 점은 DB 의 오늘 물 판정, 없으면 '자료 없음'", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  const chips = page.getByRole("group", { name: "지역" });
  await expect(chips.getByRole("link", { name: "춘천 주의" })).toBeVisible();
  await expect(
    chips.getByRole("link", { name: /수원 (관수 필요|주의|보통)/ }),
  ).toBeVisible();
  await expect(
    chips.getByRole("link", { name: "태백 자료 없음" }),
  ).toBeVisible();
});

test("온도 화면 자료 상자는 heat_daily 마지막 계산 시각(09:20)", async ({
  page,
}) => {
  await page.goto("/temperature?st=101&crop=apple");
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("09:20");
  await expect(meta).toContainText("일까지 관측");
  await page.goto("/temperature?st=216&crop=apple");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "자료 없음",
  );
});

test("지역 고르기에서 비대표 지점(홍천 212)을 검색해 고르고 새로고침해도 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?st=101&crop=apple");

  const pickerBtn = region(page).getByRole("button", { name: /지역 고르기/ });
  await expect(pickerBtn).toBeVisible();
  await pickerBtn.click();

  const searchInput = page.getByRole("searchbox", { name: "지역 검색" });
  await expect(searchInput).toBeFocused();
  await searchInput.fill("홍천");
  await searchInput.press("Enter");

  await expect(page).toHaveURL(/\/\?st=212&crop=apple$/);
  const selectedBtn = region(page).getByRole("button", { name: /홍천 212/ });
  await expect(selectedBtn).toHaveAttribute("aria-current", "true");

  await page.reload();
  await expect(
    region(page).getByRole("button", { name: /홍천 212/ }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 홍천 사과는 어떤가요?",
  );
  await expect(page.getByText("대표 지점 밖")).toBeVisible();

  await expect(
    page.getByText("이 지점은 아직 물 계산을 하지 않아요").first(),
  ).toBeVisible();

  await page.goto("/water?st=212&crop=apple");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "자료 없음",
  );
  await expect(
    page.getByText("이 지점은 아직 물 계산을 하지 않아요"),
  ).toBeVisible();

  await page.goto("/temperature?st=212&crop=apple");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "자료 없음",
  );
  await expect(page.getByText("적산온도가 아직 없어요")).toBeVisible();

  await region(page).getByRole("link", { name: "춘천" }).click();
  await expect(page).toHaveURL(/\/temperature\?st=101&crop=apple$/);
  await expect(
    region(page).getByRole("button", { name: /지역 고르기/ }),
  ).toBeVisible();
});

test("1280 미만 뷰포트에서는 대표 10개 칩이 숨고 단일 지역 버튼이 열린다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/?st=101&crop=apple");

  await expect(region(page).getByRole("link", { name: "춘천" })).toBeHidden();
  const compactBtn = region(page).getByRole("button", {
    name: /지역 · 춘천 101/,
  });
  await expect(compactBtn).toBeVisible();
  await compactBtn.click();
  await expect(
    page.getByRole("listbox", { name: "관측 지점 목록" }),
  ).toBeVisible();
});

test("모바일 390×844 뷰포트에서 펼침 판으로 지역을 고르고 가로 넘침이 없다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?st=101&crop=apple");

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);

  const compactBtn = region(page).getByRole("button", {
    name: /지역 · 춘천 101/,
  });
  await expect(compactBtn).toBeVisible();
  await compactBtn.click();

  const dialog = page.getByRole("dialog", { name: "지역 고르기" });
  await expect(dialog).toBeVisible();
  const listbox = dialog.getByRole("listbox", { name: "관측 지점 목록" });
  await expect(listbox).toBeVisible();

  await dialog.getByRole("searchbox", { name: "지역 검색" }).fill("홍천");
  await listbox.getByRole("option", { name: /홍천/ }).click();

  await expect(page).toHaveURL(/\/\?st=212&crop=apple$/);
  await expect(dialog).toBeHidden();
});
