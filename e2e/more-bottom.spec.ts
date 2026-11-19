import { expect, test, type Locator, type Page } from "./fixtures";

// 더보기 아래쪽 (이슈 #161, 결정 0052): 서비스 메뉴 → 구분선 → 공지 · 문의 · FAQ · 약관(준비 중)
// → 화면 구성(준비 중) · 글씨 크기(/font-size 로 가는 링크, #168) · 다크 모드, 끈 메뉴가 있으면 맨 아래 "숨긴 메뉴 n개" 줄.
// 휴대폰(mobile 프로젝트 390×844)에서는 쪽 안 큰 제목 "더보기"를 숨기고(`h1` 은 남김), 데스크톱은 그대로다.

const KEY = "cropmon-menus";
const OFF_TEMP = JSON.stringify({
  v: 1,
  order: [
    "home",
    "water",
    "temp",
    "sun",
    "outlook",
    "price",
    "farminfo",
    "pest",
    "soil",
    "diary",
  ],
  off: ["temp"],
});

const main = (page: Page) => page.getByRole("main");
const row = (page: Page, label: RegExp | string) =>
  main(page).getByRole("button", { name: label });
const darkRow = (page: Page) =>
  main(page).getByRole("button", { name: /(다크|라이트) 모드로 보기/ });
const fontRow = (page: Page) =>
  main(page).getByRole("link", { name: /^글씨 크기/ });
// 서비스 메뉴 링크 — 아래 "글씨 크기" 줄(링크)은 뺀다
const serviceLinks = (page: Page) =>
  main(page)
    .getByRole("link")
    .filter({ hasNotText: /^글씨 크기/ });
const hiddenLine = (page: Page) =>
  main(page).getByRole("button", { name: /숨긴 메뉴/ });

async function open(page: Page, path = "/more?st=101&crop=apple") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const top = async (el: Locator) => (await el.boundingBox())!.y;

test.describe("휴대폰 더보기", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("서비스 메뉴 → 구분선 → 공지 · 문의 · FAQ · 약관 → 화면 구성 · 글씨 크기 · 다크 모드 순서", async ({
    page,
  }) => {
    await open(page);
    const lastService = serviceLinks(page).last();
    await expect(lastService).toContainText("일지");
    const ys = [
      await top(lastService),
      await top(main(page).getByRole("separator")),
      await top(row(page, /^공지/)),
      await top(row(page, /^문의/)),
      await top(row(page, /^FAQ/)),
      await top(row(page, /^약관/)),
      await top(row(page, /^화면 구성/)),
      await top(fontRow(page)),
      await top(darkRow(page)),
    ];
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `순서 ${i}`).toBeGreaterThan(ys[i - 1]);
    }
    // 서비스 메뉴 링크는 그대로 열 개 (종합 + 아홉)
    await expect(serviceLinks(page)).toHaveCount(10);
  });

  test("공지 · 문의 · FAQ · 약관 · 화면 구성은 준비 중: aria-disabled · 꼬리표 · 눌러도 이동 없음 · 누르는 높이 44 이상 · 아이콘 24", async ({
    page,
  }) => {
    await open(page);
    const url = page.url();
    for (const label of ["공지", "문의", "FAQ", "약관", "화면 구성"]) {
      const r = row(page, new RegExp(`^${label}`));
      await expect(r, label).toHaveAttribute("aria-disabled", "true");
      await expect(r, label).toContainText("준비 중");
      const b = (await r.boundingBox())!;
      expect(b.height, `${label} 높이`).toBeGreaterThanOrEqual(44);
      const icon = (await r.locator("svg").first().boundingBox())!;
      expect(icon.width, `${label} 아이콘`).toBe(24);
      // 줄을 화면 가운데로 올린 뒤(아래 탭바에 가리지 않게) 누른다 — 누르는 자리에 정말 이 줄이 있는지도 확인한다
      await r.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const hit = await r.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const at = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return at !== null && el.contains(at);
      });
      expect(hit, `${label} 누르는 자리에 줄이 있다`).toBe(true);
      await r.click({ force: true }); // aria-disabled 라서 Playwright 가 기다리지 않게 일부러 누른다
      await page.waitForTimeout(150); // 잘못 눌려 이동했다면 그 이동이 끝날 틈을 준다
      expect(page.url(), `${label} 눌러도 이동 없음`).toBe(url);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("글씨 크기 줄(#168): 준비 중 꼬리표 없는 링크 · 누르는 높이 44 이상 · 아이콘 24 · 고른 지역 · 작물을 이어서 /font-size 로", async ({
    page,
  }) => {
    await open(page);
    const r = fontRow(page);
    await expect(r).not.toContainText("준비 중");
    await expect(r).not.toHaveAttribute("aria-disabled", "true");
    await expect(r).toHaveAttribute("href", "/font-size?st=101&crop=apple");
    expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await r.locator("svg").first().boundingBox())!.width).toBe(24);
  });

  test("다크 모드 줄: 스위치 줄이고 동작 · 버튼 이름은 그대로, 눌러서 바뀌고 기억된다", async ({
    page,
  }) => {
    await open(page);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const toggle = page.getByRole("button", { name: "다크 모드로 보기" });
    await expect(toggle).toContainText("다크 모드");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("button", { name: "라이트 모드로 보기" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("끈 메뉴가 없으면 '숨긴 메뉴' 줄이 없다", async ({ page }) => {
    await open(page);
    await expect(hiddenLine(page)).toHaveCount(0);
  });

  test("끈 메뉴가 있으면 '숨긴 메뉴 1개' 줄이 맨 아래(다크 모드 줄 아래)에 있다", async ({
    page,
  }) => {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [KEY, OFF_TEMP],
    );
    await open(page);
    const line = hiddenLine(page);
    await expect(line).toContainText("숨긴 메뉴 1개");
    await expect(line).toContainText("화면 구성에서 다시 켜기");
    await expect(line).toHaveAttribute("aria-disabled", "true");
    expect(await top(line)).toBeGreaterThan(await top(darkRow(page)));
    // 쪽 안의 눌리는 줄 가운데 가장 아래다
    const bottoms = await main(page)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
    expect(await line.evaluate((el) => el.getBoundingClientRect().bottom)).toBe(
      Math.max(...bottoms),
    );
  });

  test("글씨 크기 1.5에서도 준비 중 줄이 글씨를 따라 커지고(높이 · 눌림 44 이상) 화면 안에 있다", async ({
    page,
  }) => {
    await open(page);
    const before = (await row(page, /^공지/).boundingBox())!.height;
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--fz", "1.5"),
    );
    const r = (await row(page, /^공지/).boundingBox())!;
    expect(r.height).toBeGreaterThan(before); // fh-54 → 54 × 1.3
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.x + r.width).toBeLessThanOrEqual(390.5);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("쪽 안 큰 제목 '더보기'는 휴대폰에서 안 보이고(위 맥락 바에 있음) h1 은 화면 읽기용으로 남는다", async ({
    page,
  }) => {
    await open(page);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("더보기");
    const b = (await h1.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(1);
    expect(b.height).toBeLessThanOrEqual(1);
    // 위 맥락 바의 제목은 보인다
    await expect(page.getByTestId("context-title")).toHaveText("더보기");
  });
});

test.describe("데스크톱 1440 더보기", () => {
  test.skip(({ isMobile }) => isMobile);

  test("쪽 안 큰 제목 '더보기'는 그대로 보인다", async ({ page }) => {
    await open(page);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("더보기");
    const b = (await h1.boundingBox())!;
    expect(b.height).toBeGreaterThan(30);
  });
});
