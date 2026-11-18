import { expect, test, type Locator, type Page } from "./fixtures";

// 휴대폰(mobile 프로젝트 390×844) 작물·지역 고르기 시트 (이슈 #157, 결정 0050).
// 화면 아래에서 올라오는 시트: 위 모서리만 둥글고, 맨 위 손잡이를 아래로 80px 넘게 끌면 닫힌다.
// 뒤 화면은 덮개로 덮는다(탭바 · 맥락 바까지). 가짜 Supabase 자료를 읽는다.
// 실제 손가락 · 키보드 · 홈 막대는 이 시험으로 못 본다 (PR 본문의 "휴대폰에서 확인할 목록").

const VH = 844;
const cropButton = (page: Page) =>
  page.getByRole("group", { name: "작물" }).getByRole("button").first();
const regionButton = (page: Page) =>
  page.getByRole("group", { name: "지역" }).getByRole("button").first();
const cropSheet = (page: Page) =>
  page.getByRole("dialog", { name: "작물 고르기" });
const regionSheet = (page: Page) =>
  page.getByRole("dialog", { name: "지역 고르기" });
const grip = (sheet: Locator) => sheet.getByTestId("sheet-grip");

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
}

async function center(el: Locator) {
  const b = (await el.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** 마우스로 (x, y)에서 dy 만큼 아래로 끌었다 놓는다. */
async function drag(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + dy, { steps: 8 });
  await page.mouse.up();
}

/** 시트가 제자리(화면 아래 끝)에 와 있다. */
async function expectSettled(sheet: Locator) {
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return Math.round(b.y + b.height);
    })
    .toBe(VH);
}

test.describe("작물 시트 — 화면 아래에서 올라온다", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("화면 아래 끝에 붙어 열리고, 가로로 화면 안이며, 위 모서리만 둥글다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);
    const b = (await sheet.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.width).toBe(390);
    // 위 모서리만 둥글다
    const r = await sheet.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        topLeft: parseFloat(s.borderTopLeftRadius),
        topRight: parseFloat(s.borderTopRightRadius),
        bottomLeft: parseFloat(s.borderBottomLeftRadius),
        bottomRight: parseFloat(s.borderBottomRightRadius),
      };
    });
    expect(r.topLeft).toBeGreaterThan(0);
    expect(r.topRight).toBeGreaterThan(0);
    expect(r.bottomLeft).toBe(0);
    expect(r.bottomRight).toBe(0);
    // 위쪽 48px 이상은 덮개가 보인다
    expect(b.y).toBeGreaterThanOrEqual(47.5);
    // 맨 위 손잡이
    await expect(grip(sheet)).toBeVisible();
  });

  test("덮개가 탭바와 맥락 바를 덮고, 덮개를 누르면 닫힌다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const tabbar = (await page
      .getByRole("navigation", { name: "메뉴" })
      .boundingBox())!;
    const bar = (await page.getByTestId("context-bar").boundingBox())!;
    await cropButton(page).click();
    await expect(cropSheet(page)).toBeVisible();
    const covered = await page.evaluate(
      ({ t, b }) => ({
        tabbar: !document
          .elementFromPoint(t.x, t.y)
          ?.closest('nav[aria-label="메뉴"]'),
        bar: !document
          .elementFromPoint(b.x, b.y)
          ?.closest('[data-testid="context-bar"]'),
      }),
      {
        t: { x: tabbar.x + tabbar.width / 2, y: tabbar.y + tabbar.height / 2 },
        b: { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 },
      },
    );
    expect(covered.tabbar).toBe(true);
    expect(covered.bar).toBe(true);
    // 시트 위쪽의 덮개를 누르면 닫힌다
    await page.mouse.click(195, 20);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("손잡이를 아래로 100px 끌면 닫히고, 40px 은 안 닫히고 제자리로 돌아온다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);

    // 40px: 끄는 동안 따라 내려가고, 놓으면 제자리
    const p = await center(grip(sheet));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y + 40, { steps: 8 });
    const during = (await sheet.boundingBox())!;
    expect(during.y + during.height).toBeGreaterThan(VH + 30); // 따라 내려감
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);

    // 100px: 닫힌다
    await drag(page, await center(grip(sheet)), 100);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("위로 끌면 시트가 위로 올라가지 않는다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expectSettled(sheet);
    const p = await center(grip(sheet));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y - 80, { steps: 8 });
    const b = (await sheet.boundingBox())!;
    expect(Math.round(b.y + b.height)).toBe(VH);
    await page.mouse.up();
    await expect(sheet).toBeVisible();
  });

  test("시트 머리(제목 줄)에서도 끌어서 닫을 수 있다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expectSettled(sheet);
    const title = sheet.getByText("작물 고르기", { exact: true });
    await drag(page, await center(title), 100);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("머리 안의 '닫기' 버튼 위에서는 끌기가 시작되지 않고, 눌러서는 닫힌다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expectSettled(sheet);
    const close = sheet.getByRole("button", { name: "닫기" });
    // 버튼 위에서 눌러 아래로 끌었다 놓아도 닫히지 않는다 (끌기는 시작되지 않음)
    await drag(page, await center(close), 100);
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Esc 로 닫히고 포커스가 누른 칸으로 돌아간다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(cropSheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cropButton(page)).toBeFocused();
  });

  test("'닫기' 버튼으로 닫히고 포커스가 누른 칸으로 돌아간다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await cropSheet(page).getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cropButton(page)).toBeFocused();
  });

  test("고르면 주소가 바뀌고 닫히며, ✓ 는 고른 줄 하나뿐이다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expect(
      sheet.locator('svg path[d="M5 12.5l4.5 4.5L19 7.5"]'),
    ).toHaveCount(1);
    await expect(
      sheet
        .getByRole("listbox", { name: "작물 목록" })
        .locator('[aria-current="true"]'),
    ).toHaveCount(1);
    await sheet.getByRole("link", { name: /^배추/ }).click();
    await expect(page).toHaveURL(/\/water\?st=101&crop=cabbage$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("움직임 줄이기를 켜면 애니메이션 없이 바로 나타나고, 평소에는 올라오는 애니메이션이 있다", async ({
    page,
  }) => {
    const animationName = (sheet: Locator) =>
      sheet.evaluate((el) => getComputedStyle(el).animationName);

    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    expect(await animationName(cropSheet(page))).not.toBe("none");
    await page.keyboard.press("Escape");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expect(sheet).toBeVisible();
    expect(await animationName(sheet)).toBe("none");
    // 열자마자 제자리 (올라오는 중이 아니다)
    const b = (await sheet.boundingBox())!;
    expect(Math.round(b.y + b.height)).toBe(VH);
  });

  test("아래 안전 영역: --sheet-safe-bottom 만큼 내용이 화면 아래 끝에서 위에 있다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--sheet-safe-bottom", "34px"),
    );
    await cropButton(page).click();
    const sheet = cropSheet(page);
    await expectSettled(sheet);
    const pad = await sheet.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingBottom),
    );
    expect(pad).toBe(34);
    const contentBottom = await sheet.evaluate(
      (el) => el.lastElementChild!.getBoundingClientRect().bottom,
    );
    expect(contentBottom).toBeLessThanOrEqual(VH - 34 + 0.5);
  });
});

test.describe("지역 시트 — 같은 확인 + 검색칸", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("화면 아래 끝에 붙어 열리고, 검색칸에 포커스가 가 있지 않으며, 끌어서 닫힌다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    const sheet = regionSheet(page);
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);
    const onSearch = await page.evaluate(
      () => document.activeElement?.getAttribute("role") === "searchbox",
    );
    expect(onSearch).toBe(false);
    await expect(grip(sheet)).toBeVisible();
    await drag(page, await center(grip(sheet)), 100);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(regionButton(page)).toBeFocused();
  });

  test("목록을 스크롤하거나 목록 위에서 끌어도 닫히지 않는다 (끌기는 손잡이 · 머리에서만)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    const sheet = regionSheet(page);
    await expectSettled(sheet);
    const list = sheet.getByRole("listbox", { name: "관측 지점 목록" });
    const lb = (await list.boundingBox())!;
    // 휠로 스크롤
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(sheet).toBeVisible();
    // 목록 안에서 아래로 100px 끌었다 놓아도 시트는 그대로
    await drag(page, { x: lb.x + lb.width / 2, y: lb.y + 40 }, 100);
    await expect(sheet).toBeVisible();
    await expectSettled(sheet);
  });

  test("홍천을 검색해 누르면 st=212 가 되고 닫히며 포커스가 칸으로 돌아간다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    const sheet = regionSheet(page);
    await sheet.getByRole("searchbox", { name: "지역 검색" }).fill("홍천");
    await sheet.getByRole("option", { name: /홍천/ }).click();
    await expect(page).toHaveURL(/st=212/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Esc · 덮개로 닫힌다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    await expect(regionSheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await regionButton(page).click();
    await expect(regionSheet(page)).toBeVisible();
    await page.mouse.click(195, 20);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("높이를 500 으로 줄여도(키보드가 뜬 것처럼) 시트가 화면 안이고 위 48px 은 덮개이며 목록 끝까지 본다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    const sheet = regionSheet(page);
    await expect(sheet).toBeVisible();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect
      .poll(async () => {
        const b = (await sheet.boundingBox())!;
        return Math.round(b.y + b.height);
      })
      .toBe(500);
    const b = (await sheet.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(47.5); // 위쪽 48px 은 덮개
    const list = sheet.getByRole("listbox", { name: "관측 지점 목록" });
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(list.getByRole("option").last()).toBeInViewport();
    // 검색칸도 시트 머리 바로 아래에 보인다
    await expect(
      sheet.getByRole("searchbox", { name: "지역 검색" }),
    ).toBeInViewport();
  });

  test("폭 360 에서도 가로로 넘치지 않고 시트가 화면 폭에 꼭 맞는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, "/water?st=101&crop=apple");
    for (const [btn, sheet] of [
      [cropButton, cropSheet],
      [regionButton, regionSheet],
    ] as const) {
      await btn(page).click();
      await expect(sheet(page)).toBeVisible();
      const b = (await sheet(page).boundingBox())!;
      expect(b.width).toBe(360);
      expect(b.x).toBe(0);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.keyboard.press("Escape");
    }
  });
});
