import { expect, test, type Locator, type Page } from "./fixtures";

// 휴대폰 실기 확인 반영 (이슈 #165, 결정 0054): 지역 시트 안내 줄은 목록 끝으로, 하단 탭바는 아래에 붙은 막대,
// 맥락 바 로고는 도깨비만(mon.png). 휴대폰(mobile 프로젝트 390×844). 가짜 Supabase 자료를 읽는다.
// 실제 아이폰 홈 막대 · 키보드는 이 시험으로 못 본다(PR 본문의 "휴대폰에서 확인할 목록").

const VH = 844;
const VW = 390;
const NOTE = "기상청 ASOS 지점 · 대표 10곳 밖은 물 계산 준비 중";
const tabbar = (page: Page) => page.getByRole("navigation", { name: "메뉴" });
const regionButton = (page: Page) =>
  page.getByRole("group", { name: "지역" }).getByRole("button").first();
const regionSheet = (page: Page) =>
  page.getByRole("dialog", { name: "지역 고르기" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
}

async function openRegionSheet(page: Page) {
  await open(page, "/water?st=101&crop=apple");
  await regionButton(page).click();
  const sheet = regionSheet(page);
  await expect(sheet).toBeVisible();
  // 시트가 제자리(화면 아래 끝)에 올 때까지
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return Math.round(b.y + b.height);
    })
    .toBe(VH);
  return sheet;
}

/** 안내 줄이 스크롤 목록(listbox) 안 맨 마지막 요소이고, 시트 안 다른 곳에는 없다. */
async function expectNoteAtListEnd(sheet: Locator) {
  const list = sheet.getByRole("listbox", { name: "관측 지점 목록" });
  await expect(sheet.getByText(NOTE)).toHaveCount(1);
  const inList = await list.evaluate((el, note) => {
    const last = el.lastElementChild as HTMLElement | null;
    return !!last && (last.textContent ?? "").trim() === note;
  }, NOTE);
  expect(inList).toBe(true);
}

/** 스크롤하고, 스크롤 감시(rAF)가 한 번 돌 때까지 기다린다. */
async function scrollTo(page: Page, y: number | "end") {
  await page.evaluate(
    (top) =>
      new Promise<void>((resolve) => {
        window.scrollTo(
          0,
          top === "end" ? document.documentElement.scrollHeight : top,
        );
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    y,
  );
}

test.describe("지역 시트 — 안내 줄은 목록 끝", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("안내 줄은 스크롤 목록 맨 끝에 있고, 평소에는 보이지 않으며, 끝까지 내리면 보인다", async ({
    page,
  }) => {
    const sheet = await openRegionSheet(page);
    await expectNoteAtListEnd(sheet);
    const list = sheet.getByRole("listbox", { name: "관측 지점 목록" });
    const note = sheet.getByText(NOTE);
    // 평소(맨 위)에는 목록 아래 밖 — 화면을 차지하지 않는다
    const lb = (await list.boundingBox())!;
    expect((await note.boundingBox())!.y).toBeGreaterThanOrEqual(
      lb.y + lb.height - 0.5,
    );
    // 끝까지 내리면 시트 안에서 보인다
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(note).toBeInViewport();
    const nb = (await note.boundingBox())!;
    const lb2 = (await list.boundingBox())!;
    expect(nb.y).toBeGreaterThanOrEqual(lb2.y - 0.5);
    expect(nb.y + nb.height).toBeLessThanOrEqual(lb2.y + lb2.height + 0.5);
  });

  test("검색 '천' 뒤에도 같고, 결과가 0곳이어도 '검색 결과 0곳' 아래에 보인다", async ({
    page,
  }) => {
    const sheet = await openRegionSheet(page);
    const search = sheet.getByRole("searchbox", { name: "지역 검색" });
    await search.fill("천");
    await expectNoteAtListEnd(sheet);
    await search.fill("없는지역이름");
    // 맞는 지점이 없으면 구역 제목이 "검색 결과 0곳"이다(옵션 없음) — 안내 줄은 그 아래 맨 끝
    await expect(sheet.getByText("검색 결과 0곳")).toBeVisible();
    await expect(sheet.getByRole("option")).toHaveCount(0);
    await expectNoteAtListEnd(sheet);
    await expect(sheet.getByText(NOTE)).toBeInViewport();
  });

  test("안내 줄은 옵션이 아니다 — ↓ 키가 안내 줄로 가지 않고 옵션 수에도 안 들어간다", async ({
    page,
  }) => {
    const sheet = await openRegionSheet(page);
    const search = sheet.getByRole("searchbox", { name: "지역 검색" });
    await search.fill("천");
    const options = sheet.getByRole("option");
    const n = await options.count();
    expect(n).toBeGreaterThan(1);
    await expect(sheet.getByRole("option", { name: NOTE })).toHaveCount(0);
    await search.focus();
    for (let i = 0; i < n + 3; i++) await search.press("ArrowDown");
    // 맨 아래 옵션이 강조 칸이다 — 안내 줄(옵션 아님)로 넘어가지 않는다
    const lastName = (await options.last().innerText()).split(/\s|\n/)[0];
    await search.press("Enter");
    await expect(regionSheet(page)).toHaveCount(0);
    await expect(regionButton(page)).toContainText(lastName);
  });
});

test.describe("하단 탭바 — 아래에 붙은 막대", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("화면 아래 끝 · 좌우 끝에 붙고, 모서리 0 · 위 선만 · 그림자 없음, 높이 54", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const b = (await tabbar(page).boundingBox())!;
    expect(Math.round(b.x)).toBe(0);
    expect(Math.round(b.width)).toBe(VW);
    expect(Math.round(b.y + b.height)).toBe(VH);
    expect(Math.round(b.height)).toBe(54);
    const css = await tabbar(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        radius: s.borderTopLeftRadius + s.borderBottomRightRadius,
        top: parseFloat(s.borderTopWidth),
        bottom: parseFloat(s.borderBottomWidth),
        left: parseFloat(s.borderLeftWidth),
        shadow: s.boxShadow,
      };
    });
    expect(css.radius).toBe("0px0px");
    expect(css.top).toBeGreaterThan(0);
    expect(css.bottom).toBe(0);
    expect(css.left).toBe(0);
    expect(css.shadow).toBe("none");
  });

  test("아래 안전 영역 34px: 막대는 화면 끝까지, 탭 줄은 34px 위에 있다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page.evaluate(() =>
      document.documentElement.style.setProperty(
        "--tabbar-safe-bottom",
        "34px",
      ),
    );
    const b = (await tabbar(page).boundingBox())!;
    expect(Math.round(b.y + b.height)).toBe(VH);
    expect(Math.round(b.height)).toBe(54 + 34);
    for (const link of await tabbar(page).getByRole("link").all()) {
      const lb = (await link.boundingBox())!;
      expect(lb.y + lb.height).toBeLessThanOrEqual(VH - 34 + 0.5);
      expect(lb.height).toBeGreaterThanOrEqual(44);
    }
  });

  for (const safe of [0, 34]) {
    test(`오토 하이드로 숨으면 화면 밖으로 완전히 나간다 — 위 선 · 그림자도 1px 안 남음 (안전 영역 ${safe}px)`, async ({
      page,
    }) => {
      await open(page, "/water?st=101&crop=apple");
      await page.evaluate(
        (v) =>
          document.documentElement.style.setProperty(
            "--tabbar-safe-bottom",
            `${v}px`,
          ),
        safe,
      );
      await scrollTo(page, 60);
      await expect
        .poll(async () => (await tabbar(page).boundingBox())!.y)
        .toBeGreaterThanOrEqual(VH);
    });
  }

  test("맨 아래까지 내려도 바닥글 마지막 줄이 탭바 위에 보인다 (종합 · 더보기)", async ({
    page,
  }) => {
    for (const path of ["/?st=101&crop=apple", "/more?st=101&crop=apple"]) {
      await open(page, path);
      await scrollTo(page, "end");
      await expect
        .poll(async () => (await tabbar(page).boundingBox())!.y)
        .toBeLessThan(VH);
      const gap = await page.evaluate(() => {
        // 같은 이름("메뉴")의 nav 가 둘이다(데스크톱 머리 · 휴대폰 탭바) — 보이는 쪽만
        const nav = Array.from(
          document.querySelectorAll('nav[aria-label="메뉴"]'),
        ).find((n) => getComputedStyle(n).display !== "none")!;
        const footer = document.querySelector("footer")!;
        const kids = Array.from(footer.children) as HTMLElement[];
        const bottom = Math.max(
          ...kids.map((k) => k.getBoundingClientRect().bottom),
        );
        return nav.getBoundingClientRect().top - bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe("맥락 바 로고 — 도깨비만", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("첫 링크 그림은 mon.png 이고 둥근 판(바탕)이 없다", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    const link = page.getByRole("link", { name: "종합 (첫 화면)" });
    await expect(link.locator("img")).toHaveAttribute("src", /mon\.png/);
    await expect(link.locator("img")).not.toHaveAttribute("src", /logo-emblem/);
    const bg = await link.evaluate((el) =>
      Array.from(el.querySelectorAll("*")).map(
        (n) => getComputedStyle(n).backgroundColor,
      ),
    );
    expect(bg.every((c) => c === "rgba(0, 0, 0, 0)")).toBe(true);
  });
});
