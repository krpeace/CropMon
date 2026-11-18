import { expect, test, type Page } from "./fixtures";

// 휴대폰 오토 하이드 (이슈 #159, 결정 0051): 아래로 32px 넘게 내리면 탭바가 숨고 위 바가 높이 32 한 줄로 접힌다.
// 위로 12px 넘게 올리면 돌아온다. 맨 위 · 맨 아래 · 짧은 화면 · 가로 · 폭 1024 이상은 접히지 않는다.
// 임계값은 제안값이라 실제 휴대폰에서 조정한다 (PR 본문의 "휴대폰에서 확인할 목록"). 가짜 Supabase 자료를 읽는다.

const VH = 844;
const bar = (page: Page) => page.getByTestId("context-bar");
const fold = (page: Page) => page.getByTestId("context-fold");
const row = (page: Page) => page.getByTestId("context-row");
const tabbar = (page: Page) => page.getByRole("navigation", { name: "메뉴" });
const cropButton = (page: Page) =>
  page.getByRole("group", { name: "작물" }).getByRole("button").first();
const regionButton = (page: Page) =>
  page.getByRole("group", { name: "지역" }).getByRole("button").first();

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 스크롤하고, 스크롤 감시(rAF)가 한 번 돌 때까지 기다린다. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate(
    (top) =>
      new Promise<void>((resolve) => {
        window.scrollTo(0, top);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    y,
  );
}

const barHeight = async (page: Page) =>
  Math.round((await bar(page).boundingBox())!.height);

/** 탭바가 화면 안에 보인다 (숨으면 화면 아래로 내려간다). */
const tabbarVisible = async (page: Page) => {
  const b = (await tabbar(page).boundingBox())!;
  return b.y + b.height <= VH + 0.5;
};

/** 접힐 때까지(전환 0.22초) 기다린다. */
async function expectFolded(page: Page) {
  await expect.poll(() => barHeight(page)).toBe(32);
  await expect.poll(() => tabbarVisible(page)).toBe(false);
}
async function expectOpen(page: Page) {
  await expect.poll(() => barHeight(page)).toBe(52);
  await expect.poll(() => tabbarVisible(page)).toBe(true);
}

test.describe("접힘과 펼침", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("아래로 스크롤하면 탭바가 숨고 위 바가 높이 32 한 줄로 접힌다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await expectOpen(page);
    await scrollTo(page, 60);
    await expectFolded(page);
    // 접힌 줄은 화면 맨 위에 붙어 있다
    const b = (await bar(page).boundingBox())!;
    expect(Math.round(b.y)).toBe(0);
    await expect(fold(page)).toBeVisible();
  });

  test("접힌 줄 내용은 작물 · 점 · 지역 번호(사과 · ● 춘천 101), 14/700, 점 색은 펼친 캡슐과 같다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const dot = (p: Page) =>
      regionButton(p)
        .locator('[aria-hidden="true"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    const expandedDot = await dot(page);
    await scrollTo(page, 60);
    await expectFolded(page);
    const line = page.getByTestId("fold-text");
    await expect(line).toContainText("사과");
    await expect(line).toContainText("춘천");
    await expect(line).toContainText("101");
    const foldedDot = await page
      .getByTestId("fold-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(foldedDot).toBe(expandedDot);
    const text = await line.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
    });
    expect(text.size).toBe(14);
    expect(text.weight).toBeGreaterThanOrEqual(700);
  });

  test("아래로 31px 은 안 접히고 33px 은 접힌다 (경계값은 포함하지 않는다)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 31);
    await page.waitForTimeout(350);
    await expectOpen(page);
    await scrollTo(page, 33);
    await expectFolded(page);
  });

  test("접힌 상태에서 위로 11px 은 그대로, 13px 을 올리면 돌아온다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    await scrollTo(page, 489); // 위로 11
    await page.waitForTimeout(350);
    await expectFolded(page);
    await scrollTo(page, 487); // 누적 13
    await expectOpen(page);
  });

  test("접힌 줄의 눌리는 영역은 높이 44 이상이다 (보이는 줄은 32)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    const b = (await fold(page).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBe(390);
    // 가운데에서 위아래로 21px 떨어진 점을 눌러도 접힌 줄 버튼이 눌린다 (보이는 줄 32 아래 12px 까지)
    const hit = await page.evaluate(
      ({ x, y }) =>
        [y - 21, y + 21].map(
          (py) =>
            document
              .elementFromPoint(x, Math.max(1, py))
              ?.closest('[data-testid="context-fold"]') !== null,
        ),
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    );
    expect(hit).toEqual([true, true]);
  });

  test("접힌 줄을 누르면 펼쳐진다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    await fold(page).click();
    await expectOpen(page);
    // 펼쳐진 뒤 같은 자리에서 조금 더 내려도 바로 다시 접히지는 않는다 (거리를 새로 센다)
    await scrollTo(page, 510);
    await page.waitForTimeout(350);
    await expectOpen(page);
  });

  test("맨 아래까지 내리면 펼쳐지고, 맨 위로 돌아와도 펼쳐진다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 60);
    await expectFolded(page);
    await scrollTo(page, 1_000_000); // 맨 아래
    await expectOpen(page);
    await scrollTo(page, 400); // 맨 아래에서 올라옴 (위로 = 펼침 유지)
    await scrollTo(page, 500); // 다시 아래로 100 → 접힘
    await expectFolded(page);
    await scrollTo(page, 0); // 맨 위
    await expectOpen(page);
  });

  test("더보기(제목 화면)에서는 접힌 줄에 제목을 둔다", async ({ page }) => {
    await open(page, "/more?st=101&crop=apple");
    await scrollTo(page, 60);
    await expectFolded(page);
    await expect(page.getByTestId("fold-text")).toContainText("더보기");
    const text = await page
      .getByTestId("fold-text")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(text).toBe(14);
  });

  test("접혀도 아래 내용의 문서 위치가 그대로다 (내용이 튀지 않는다)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const docTop = () =>
      page
        .getByRole("heading", { level: 1 })
        .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const header = () =>
      page
        .locator("header")
        .evaluate((el) => el.getBoundingClientRect().height);
    const before = await docTop();
    const headerBefore = await header();
    await scrollTo(page, 200);
    await expectFolded(page);
    expect(Math.abs((await docTop()) - before)).toBeLessThanOrEqual(0.5);
    expect(await header()).toBe(headerBefore); // 문서 흐름의 머리말 높이는 그대로(52)
    expect(headerBefore).toBe(52);
  });

  test("접히면 펼친 줄(도깨비 · 캡슐 · 로그인)은 눌림 · 탭 이동에서 빠지고, 펼치면 접힌 줄이 빠진다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await expect(row(page)).not.toHaveAttribute("inert", /.*/);
    await expect(fold(page)).toHaveAttribute("inert", "");
    await scrollTo(page, 60);
    await expectFolded(page);
    await expect(row(page)).toHaveAttribute("inert", "");
    await expect(fold(page)).not.toHaveAttribute("inert", /.*/);
  });

  test("경로를 옮기면 펼친 상태로 시작한다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    // 숨은 탭바의 링크를 눌러 쪽을 옮긴다 (화면 밖이라 직접 클릭 이벤트를 보낸다)
    await page.evaluate(() =>
      document
        .querySelector<HTMLAnchorElement>(
          'nav[aria-label="메뉴"] a[href^="/temperature"]',
        )!
        .click(),
    );
    await expect(page).toHaveURL(/\/temperature/);
    await expectOpen(page);
  });

  test("숨은 탭바의 링크에 포커스가 가면 펼쳐진다 (화면 읽기 · 키보드 사용자가 메뉴를 잃지 않게)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    // 탭바는 숨어도 aria-hidden 이나 inert 가 아니다
    await expect(tabbar(page)).not.toHaveAttribute("aria-hidden", /.*/);
    await expect(tabbar(page)).not.toHaveAttribute("inert", /.*/);
    await tabbar(page).getByRole("link", { name: "온도" }).focus();
    await expectOpen(page);
  });
});

test.describe("접히지 않는 경우", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("스크롤 거리가 64 미만인 짧은 화면은 접히지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    // 화면 높이를 문서 높이보다 약 40 작게 맞춘다 (스크롤은 되지만 거리가 64 미만)
    for (let i = 0; i < 4; i += 1) {
      const range = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      if (range >= 30 && range <= 50) break;
      const h = page.viewportSize()!.height + (range - 40);
      await page.setViewportSize({ width: 390, height: Math.round(h) });
      await page.waitForTimeout(150);
    }
    const range = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(range).toBeGreaterThan(20);
    expect(range).toBeLessThan(64);
    await scrollTo(page, range - 12); // 가장자리 밖에서 큰 움직임
    await page.waitForTimeout(350);
    expect(await barHeight(page)).toBe(52);
    // 대조: 같은 화면을 긴 화면으로 되돌리면 접힌다 (이 시험이 접힘을 잡아낼 수 있다는 증거)
    await page.setViewportSize({ width: 390, height: VH });
    await scrollTo(page, 0);
    await scrollTo(page, 500);
    await expectFolded(page);
  });

  test("가로 모드(844×390)는 접히지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 400);
    await page.waitForTimeout(350);
    expect(await barHeight(page)).toBe(52);
    // 대조: 세로로 돌리면 같은 스크롤에서 접힌다
    await page.setViewportSize({ width: 390, height: VH });
    await scrollTo(page, 0);
    await scrollTo(page, 500);
    await expectFolded(page);
  });

  test("접힌 뒤 화면이 가로로 돌면 다시 펼쳐진다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    await scrollTo(page, 500);
    await expectFolded(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => barHeight(page)).toBe(52);
  });
});

test.describe("움직임 · 글씨 크기 · 시트", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("전환은 0.22초, 움직임 줄이기를 켜면 움직임 없이 바로 바뀐다", async ({
    page,
  }) => {
    const durations = () =>
      page.evaluate(() => {
        const b = document.querySelector('[data-testid="context-bar"]')!;
        // 같은 이름("메뉴")의 nav 가 둘이라(데스크톱 메뉴 줄은 휴대폰에서 숨김) 화면 아래에 고정된 탭바를 고른다
        const t = [...document.querySelectorAll('nav[aria-label="메뉴"]')].find(
          (n) => getComputedStyle(n).position === "fixed",
        )!;
        return {
          bar: getComputedStyle(b).transitionDuration,
          tab: getComputedStyle(t).transitionDuration,
        };
      });
    await open(page, "/water?st=101&crop=apple");
    const normal = await durations();
    expect(normal.bar).toContain("0.22s");
    expect(normal.tab).toContain("0.22s");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await durations();
    expect(parseFloat(reduced.bar)).toBe(0);
    expect(parseFloat(reduced.tab)).toBe(0);
    await scrollTo(page, 60);
    await expectFolded(page);
  });

  test("글씨 크기 1.5에서도 접힌 줄 높이는 32다 (100% 고정 구역)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--fz", "1.5"),
    );
    await scrollTo(page, 200);
    await expectFolded(page);
    expect(await barHeight(page)).toBe(32);
  });

  test("아래 시트가 열려 있는 동안은 상태를 바꾸지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    await expect(
      page.getByRole("dialog", { name: "작물 고르기" }),
    ).toBeVisible();
    await scrollTo(page, 300); // 시트가 스크롤을 잠가도 프로그램으로는 움직인다
    await page.waitForTimeout(350);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await barHeight(page)).toBe(52);
    // 닫은 뒤 조금 더 내려도 (닫힌 사이의 큰 움직임이 한꺼번에 반영되지 않아) 바로 접히지 않는다
    await scrollTo(page, 310);
    await page.waitForTimeout(350);
    expect(await barHeight(page)).toBe(52);
  });

  test("로그인 창이 열려 있는 동안도 상태를 바꾸지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page
      .getByTestId("context-bar")
      .getByRole("button", { name: "로그인" })
      .click();
    const dialog = page.getByRole("dialog", { name: "로그인 안내" });
    await expect(dialog).toBeVisible();
    await scrollTo(page, 300);
    await page.waitForTimeout(350);
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();
    expect(await barHeight(page)).toBe(52);
    await scrollTo(page, 310);
    await page.waitForTimeout(350);
    expect(await barHeight(page)).toBe(52);
  });
});

test.describe("데스크톱 1440", () => {
  test.skip(({ isMobile }) => isMobile);

  test("접히지 않는다 — 머리말 높이 · 메뉴 줄이 스크롤해도 그대로다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const header = () =>
      page
        .locator("header")
        .evaluate((el) => el.getBoundingClientRect().height);
    const before = await header();
    await scrollTo(page, 600);
    await page.waitForTimeout(350);
    expect(await header()).toBe(before);
    await expect(
      page.getByRole("navigation", { name: "메뉴" }).getByRole("link"),
    ).toHaveCount(10);
    await expect(page.getByTestId("context-bar")).toBeHidden();
    await expect(fold(page)).toBeHidden();
  });

  test("데스크톱 헤더의 배경 · 흐림 · 아래 선은 그대로다 (휴대폰에서 바로 옮긴 것이 데스크톱에 영향이 없다)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const style = await page.locator("header").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundColor,
        blur: s.backdropFilter,
        border: parseFloat(s.borderBottomWidth),
        position: s.position,
        pointer: s.pointerEvents,
      };
    });
    expect(style.bg).not.toBe("rgba(0, 0, 0, 0)"); // 배경이 있다
    expect(style.bg).not.toBe("transparent");
    expect(style.blur).toContain("blur"); // 흐림이 있다
    expect(style.border).toBeGreaterThan(0); // 아래 선이 있다
    expect(style.position).toBe("sticky");
    expect(style.pointer).not.toBe("none"); // 눌림도 그대로
  });
});
