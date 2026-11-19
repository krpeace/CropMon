import { expect, test, type Page } from "./fixtures";

// 메뉴 뼈대 (이슈 #145, 결정 0046): 탭 · 더보기 · 데스크톱 메뉴 줄이 기본값과 기기 저장값(localStorage "cropmon-menus")에서 그려진다.
// 설정값을 바꾸는 화면은 아직 없으므로 시험은 저장값을 미리 넣어서 한다 (addInitScript).
// 휴대폰(mobile 프로젝트 390×844)과 데스크톱(1440)이 한 파일에서 갈라 돈다.

const KEY = "cropmon-menus";
const DEFAULT_ORDER = [
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
];
const DEFAULT_LABELS = [
  "종합",
  "물",
  "온도",
  "햇빛",
  "관측",
  "시세",
  "농사정보",
  "병해충",
  "토양",
  "일지",
];

const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

/** 화면을 열기 전에 기기 저장값을 넣는다. */
async function save(page: Page, value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  await page.addInitScript(
    ([key, v]) => localStorage.setItem(key, v),
    [KEY, raw],
  );
}

const saved = (order: string[], off: string[]) => ({ v: 1, order, off });
const withoutTemp = saved(DEFAULT_ORDER, ["temp"]);
const reordered = saved(
  [
    "water",
    "sun",
    "home",
    "outlook",
    "temp",
    "price",
    "farminfo",
    "pest",
    "soil",
    "diary",
  ],
  [],
);

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.describe("휴대폰", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("저장값이 없으면 탭 '종합 · 물 · 온도 · 햇빛 · 더보기'", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText([
      "종합",
      "물",
      "온도",
      "햇빛",
      "더보기",
    ]);
  });

  test("온도를 끈 값을 넣으면 탭 · 더보기에서 온도가 빠지고 관측이 탭에 올라온다", async ({
    page,
  }) => {
    await save(page, withoutTemp);
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText([
      "종합",
      "물",
      "햇빛",
      "관측",
      "더보기",
    ]);

    await menu(page).getByRole("link", { name: "더보기" }).click();
    await expect(page).toHaveURL(/\/more\?st=101&crop=apple$/);
    // 서비스 메뉴 줄만 — 아래 "글씨 크기" 줄(#168 에서 링크가 됨)은 more-bottom.spec.ts 가 본다
    const list = page
      .getByRole("main")
      .getByRole("link")
      .filter({ hasNotText: /^글씨 크기/ });
    await expect(list).toHaveText(
      DEFAULT_LABELS.filter((l) => l !== "온도").map(
        (l) => new RegExp(`^${l}`),
      ),
    );
    await expect(
      page.getByRole("button", { name: /숨긴 메뉴 1개/ }),
    ).toBeVisible();
  });

  test("순서를 바꾼 저장값은 탭 순서에 반영된다", async ({ page }) => {
    await save(page, reordered);
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText([
      "물",
      "햇빛",
      "종합",
      "관측",
      "더보기",
    ]);
  });

  test("저장소가 막혀 있거나 값이 깨져 있으면 기본값으로 동작한다", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      });
    });
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText([
      "종합",
      "물",
      "온도",
      "햇빛",
      "더보기",
    ]);
  });

  test.describe("깨진 값", () => {
    for (const raw of ["not json", '{"v":2,"order":[],"off":["temp"]}']) {
      test(`${raw} 도 기본값`, async ({ page }) => {
        await save(page, raw);
        await open(page, "/water?st=101&crop=apple");
        await expect(menu(page).getByRole("link")).toHaveText([
          "종합",
          "물",
          "온도",
          "햇빛",
          "더보기",
        ]);
      });
    }
  });

  test("종합을 끈 값이 들어 있어도 종합은 남는다", async ({ page }) => {
    await save(page, saved(DEFAULT_ORDER, ["home"]));
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link").first()).toHaveText("종합");
  });

  test("더보기 화면: 맨 위 종합 · 켠 메뉴 목록 · 준비 중 꼬리표, 지역·작물 줄은 없다", async ({
    page,
  }) => {
    await open(page, "/more?st=136&crop=cabbage");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("더보기");
    // 서비스 메뉴 줄만 — 아래 "글씨 크기" 줄(#168 에서 링크가 됨)은 more-bottom.spec.ts 가 본다
    const rows = page
      .getByRole("main")
      .getByRole("link")
      .filter({ hasNotText: /^글씨 크기/ });
    await expect(rows).toHaveText(
      DEFAULT_LABELS.map((l) => new RegExp(`^${l}`)),
    );
    // 서비스 메뉴 줄(링크) 안의 꼬리표만 센다 — 아래 공지·문의·화면 구성 줄의 꼬리표는 more-bottom.spec.ts 가 본다 (#161)
    await expect(rows.getByText("준비 중", { exact: true })).toHaveCount(6);
    // 켜진 메뉴 4개에는 꼬리표가 없다
    await expect(rows.nth(1)).not.toContainText("준비 중");
    // 끈 메뉴가 없으면 "숨긴 메뉴" 줄도 없다
    await expect(page.getByText(/숨긴 메뉴/)).toHaveCount(0);
    // 지역·작물 고르는 줄은 이 화면에 없다
    await expect(page.getByRole("group", { name: "지역" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "작물" })).toHaveCount(0);
    // 고른 지역·작물은 이어진다
    await expect(rows.nth(1)).toHaveAttribute(
      "href",
      "/water?st=136&crop=cabbage",
    );
    await rows.nth(8).click();
    await expect(page).toHaveURL(/\/soil\?st=136&crop=cabbage$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("토양");
  });

  test("'숨긴 메뉴 n개' 줄은 눌러도 이동하지 않는다 (화면 구성은 나중 이슈)", async ({
    page,
  }) => {
    await save(page, withoutTemp);
    await open(page, "/more?st=101&crop=apple");
    const hidden = page.getByRole("button", { name: /숨긴 메뉴 1개/ });
    await expect(hidden).toContainText("화면 구성에서 다시 켜기");
    await expect(hidden).toHaveAttribute("aria-disabled", "true");
    // aria-disabled 라서 Playwright 가 "누를 수 없음"으로 기다리지 않게 일부러 누른다
    await hidden.click({ force: true });
    await expect(page).toHaveURL(/\/more\?st=101&crop=apple$/);
  });

  test("새 쪽 넷은 더보기에서 눌러 열린다", async ({ page }) => {
    await open(page, "/more?st=101&crop=apple");
    for (const [label, path] of [
      ["관측", "/outlook"],
      ["시세", "/market"],
      ["농사정보", "/farminfo"],
      ["병해충", "/pest"],
      ["일지", "/diary"],
    ] as const) {
      await page
        .getByRole("main")
        .getByRole("link", { name: new RegExp(`^${label}`) })
        .click();
      await expect(page).toHaveURL(new RegExp(`${path}\\?st=101&crop=apple$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
      await page.goBack();
    }
  });
});

test.describe("데스크톱", () => {
  test.skip(({ isMobile }) => isMobile);

  test("1440 메뉴 줄 순서: 종합 · 물 · 온도 · 햇빛 · 관측 · 시세 · 농사정보 · 병해충 · 토양 · 일지", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText(DEFAULT_LABELS);
  });

  test("1440 메뉴 줄은 한 줄에 들어가고 글자가 12px 아래로 내려가지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const links = await menu(page).getByRole("link").all();
    const tops = await Promise.all(
      links.map(async (l) => (await l.boundingBox())!.y),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
    const size = await links[0].evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(12);
    const overflow = await menu(page).evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("순서를 바꾼 저장값을 넣어도 메뉴 줄 순서는 그대로다", async ({
    page,
  }) => {
    await save(page, reordered);
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText(DEFAULT_LABELS);
  });

  test("온도를 끈 값을 넣으면 메뉴 줄에서 온도가 빠진다 (나머지 순서는 그대로)", async ({
    page,
  }) => {
    await save(page, withoutTemp);
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link")).toHaveText(
      DEFAULT_LABELS.filter((l) => l !== "온도"),
    );
  });

  test("종합을 끈 값이 들어 있어도 메뉴 줄에 종합이 남는다", async ({
    page,
  }) => {
    await save(page, saved(DEFAULT_ORDER, ["home"]));
    await open(page, "/water?st=101&crop=apple");
    await expect(menu(page).getByRole("link").first()).toHaveText("종합");
  });

  // 메뉴 아이콘이 보이기 시작하는 폭 (결정 0046: 시안의 1280 을 메뉴 10개에 맞춰 올림). tokens.css 의 --breakpoint-menu-icon 과 같은 값.
  // 글 폭은 글꼴에 따라 약 6px 달라진다(CI 리눅스 실측). 그래서 모든 폭에서는 "넘치지 않음"만, 여유 하한은 글꼴이 달라도 넉넉한 1024 · 1440 에서만 둔다.
  const ICON_FROM = 1440;
  const WIDTHS = [1024, 1100, 1280, 1366, ICON_FROM - 1, ICON_FROM, 1600];

  for (const width of WIDTHS) {
    test(`폭 ${width}: 메뉴 10개가 모두 보이고 넘치지 않으며, 아이콘은 ${ICON_FROM} 부터만 보인다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "/water?st=101&crop=apple");
      const nav = menu(page);
      await expect(nav).toBeVisible();
      const links = nav.getByRole("link");
      await expect(links).toHaveText(DEFAULT_LABELS);
      await expect(nav.locator("svg:visible")).toHaveCount(
        width >= ICON_FROM ? 10 : 0,
      );

      const box = (await nav.boundingBox())!;
      const all = await links.all();
      for (const link of all) {
        await expect(link).toBeVisible();
        const b = (await link.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
        expect(b.height).toBeGreaterThanOrEqual(44); // 누르는 높이 44 그대로
      }
      const overflow = await nav.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // 여유: 글자만인 1024 는 8px 이상, 아이콘이 처음 나오는 폭은 16px 이상
      const first = (await all[0].boundingBox())!;
      const last = (await all[all.length - 1].boundingBox())!;
      const slack = box.width - (last.x + last.width - first.x);
      if (width === 1024) expect(slack).toBeGreaterThanOrEqual(8);
      if (width === ICON_FROM) expect(slack).toBeGreaterThanOrEqual(16);
      // 글자 크기는 17 그대로
      expect(
        await all[0].evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        ),
      ).toBe(17);
    });
  }

  test("/more 는 데스크톱에서도 열리고, 메뉴 줄에는 더보기가 없다", async ({
    page,
  }) => {
    await open(page, "/more?st=101&crop=apple");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("더보기");
    await expect(menu(page).getByRole("link")).toHaveText(DEFAULT_LABELS);
    await expect(menu(page).locator('[aria-current="page"]')).toHaveCount(0);
  });
});
