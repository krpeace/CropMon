import { expect, test, type Page } from "@playwright/test";

// 휴대폰(mobile 프로젝트 390×844): 작물·지역 선택 줄은 한 줄이고, 고르기 판은 선택 줄 바로 아래에 펼쳐진다.
// 가짜 Supabase 자료를 읽는다.

const cropGroup = (page: Page) => page.getByRole("group", { name: "작물" });
const regionGroup = (page: Page) => page.getByRole("group", { name: "지역" });
const cropButton = (page: Page) => cropGroup(page).getByRole("button").first();
const regionButton = (page: Page) =>
  regionGroup(page).getByRole("button").first();
const cropDialog = (page: Page) =>
  page.getByRole("dialog", { name: "작물 고르기" });
const regionDialog = (page: Page) =>
  page.getByRole("dialog", { name: "지역 고르기" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
}

/** 머리말(= 선택 줄 포함) 아래 끝. */
const headerBottom = (page: Page) =>
  page.locator("header").evaluate((el) => el.getBoundingClientRect().bottom);

const CROPS = ["common", "apple", "cabbage"];
const STATIONS = [136, 189]; // 안동, 서귀포

for (const width of [360, 375, 390, 412]) {
  test(`선택 줄이 한 줄이고 넘치지 않는다: 폭 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const crop of CROPS) {
      for (const st of STATIONS) {
        await open(page, `/water?st=${st}&crop=${crop}`);
        const c = (await cropButton(page).boundingBox())!;
        const r = (await regionButton(page).boundingBox())!;
        const label = `${width}px ${crop} ${st}`;
        expect(Math.abs(c.y - r.y), label).toBeLessThanOrEqual(1);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow, label).toBeLessThanOrEqual(0);
        const nameFits = await cropButton(page)
          .locator("span")
          .first()
          .evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(nameFits, label).toBe(true);
      }
    }
  });
}

test("작물 판은 선택 줄 바로 아래, 화면 안에 열린다", async ({ page }) => {
  await open(page, "/water?st=101&crop=apple");
  await cropButton(page).click();
  await expect(cropDialog(page)).toHaveCount(1);
  const box = (await cropDialog(page).boundingBox())!;
  const gap = box.y - (await headerBottom(page));
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThanOrEqual(16);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test("덮개는 탭바를 덮고 머리말(작물 버튼)은 덮지 않는다", async ({ page }) => {
  await open(page, "/water?st=101&crop=apple");
  await cropButton(page).click();
  await expect(cropDialog(page)).toBeVisible();
  const tabbar = (await page
    .getByRole("navigation", { name: "메뉴" })
    .boundingBox())!;
  const btn = (await cropButton(page).boundingBox())!;
  const pts = await page.evaluate(
    ({ tx, ty, bx, by }) => ({
      tabbarCovered: !document
        .elementFromPoint(tx, ty)
        ?.closest('nav[aria-label="메뉴"]'),
      buttonVisible: !!document
        .elementFromPoint(bx, by)
        ?.closest('[role="group"][aria-label="작물"] button'),
    }),
    {
      tx: tabbar.x + tabbar.width / 2,
      ty: tabbar.y + tabbar.height / 2,
      bx: btn.x + btn.width / 2,
      by: btn.y + btn.height / 2,
    },
  );
  expect(pts.tabbarCovered).toBe(true);
  expect(pts.buttonVisible).toBe(true);
});

test.describe("닫기", () => {
  test("덮개를 누르면 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    await page.mouse.click(195, 820);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("닫기 버튼으로 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await cropDialog(page).getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Esc 로 닫히고 포커스가 연 버튼으로 돌아간다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    // 열리면 포커스가 판 안으로 간다
    await expect(cropDialog(page).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cropButton(page)).toBeFocused();
  });

  test("지역 판도 Esc 로 닫히고 포커스가 지역 버튼으로 돌아간다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    await expect(regionDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(regionButton(page)).toBeFocused();
  });

  test("같은 버튼을 다시 누르면 닫히고, 다른 버튼을 누르면 판이 바뀐다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    await regionButton(page).click();
    await expect(regionDialog(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await regionButton(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("머리말의 테마 버튼을 누르면 판이 먼저 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    await page.getByRole("button", { name: /모드로 보기/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("폭이 1024 이상이 되면 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropDialog(page)).toBeVisible();
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("작물 판에서 배추를 누르면 crop=cabbage 가 되고 닫힌다", async ({
  page,
}) => {
  await open(page, "/water?st=101&crop=apple");
  await cropButton(page).click();
  await cropDialog(page).getByRole("link", { name: /배추/ }).click();
  await expect(page).toHaveURL(/crop=cabbage/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("지역 판", () => {
  test("선택 줄 바로 아래에 열리고 검색칸에 포커스가 가 있지 않다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    await expect(regionDialog(page)).toBeVisible();
    const box = (await regionDialog(page).boundingBox())!;
    const gap = box.y - (await headerBottom(page));
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(16);
    const onSearch = await page.evaluate(
      () => document.activeElement?.getAttribute("role") === "searchbox",
    );
    expect(onSearch).toBe(false);
  });

  test("홍천을 검색해 누르면 st=212 가 되고 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    await regionDialog(page)
      .getByRole("searchbox", { name: "지역 검색" })
      .fill("홍천");
    await regionDialog(page).getByRole("option", { name: /홍천/ }).click();
    await expect(page).toHaveURL(/st=212/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("키보드가 뜬 것처럼 높이가 줄어도 목록 끝까지 볼 수 있다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    await expect(regionDialog(page)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect
      .poll(async () => {
        const b = (await regionDialog(page).boundingBox())!;
        return b.y + b.height;
      })
      .toBeLessThanOrEqual(500 - 12);
    const list = regionDialog(page).getByRole("listbox", {
      name: "관측 지점 목록",
    });
    const scrollable = await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(scrollable).toBe(true);
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(list.getByRole("option").last()).toBeInViewport();
  });
});

test("판이 열려 있는 동안 뒤 화면은 스크롤되지 않는다", async ({ page }) => {
  await open(page, "/water?st=101&crop=apple");
  await cropButton(page).click();
  await expect(cropDialog(page)).toBeVisible();
  await page.mouse.move(195, 800);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
