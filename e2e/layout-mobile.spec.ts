import { expect, test, type Locator, type Page } from "./fixtures";

// 화면 구성 화면 /layout (이슈 #176, 결정 0058). 휴대폰 390. 메뉴를 켜고 끄고 순서를 바꾸면 그 자리에서 저장되고(바로 적용),
// 하단 탭바 · 더보기가 새로고침 없이 따라간다. 실제 손가락 끌기는 이 시험으로 못 본다(PR 본문의 "휴대폰에서 확인할 목록").

const KEY = "cropmon-menus";
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

const rows = (page: Page) => page.getByTestId("layout-row");
const row = (page: Page, label: string) =>
  rows(page).filter({
    has: page.getByRole("switch", { name: `${label} 사용` }),
  });
const rowOf = (page: Page, id: string) =>
  page.locator(`[data-testid="layout-row"][data-menu="${id}"]`);
const tabbar = (page: Page) => page.getByRole("navigation", { name: "메뉴" });
const preview = (page: Page) => page.getByTestId("tab-preview");
const handle = (page: Page, label: string) =>
  page.getByRole("button", { name: `${label} 순서 바꾸기` });
const up = (page: Page, label: string) =>
  page.getByRole("button", { name: `${label} 위로` });
const down = (page: Page, label: string) =>
  page.getByRole("button", { name: `${label} 아래로` });
const live = (page: Page) => page.getByTestId("layout-live");

async function open(page: Page, path = "/layout?st=101&crop=apple") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(rows(page).first()).toBeVisible(); // 저장값을 읽은 뒤에 목록이 그려진다
}

/** 목록 줄의 id 순서. */
const order = async (page: Page) =>
  rows(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-menu")),
  );

/** 실제 하단 탭바 링크 글자(맨 오른쪽 더보기 포함). */
const tabLabels = async (page: Page) =>
  (await tabbar(page).getByRole("link").allInnerTexts()).map((t) => t.trim());

const savedRaw = (page: Page) =>
  page.evaluate((k) => localStorage.getItem(k), KEY);

const center = async (el: Locator) => {
  const b = (await el.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** 마우스로 손잡이를 잡아 y 까지 끈다. */
async function mouseDrag(page: Page, from: Locator, toY: number) {
  const { x, y } = await center(from);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (toY - y) / 2, { steps: 5 });
  await page.mouse.move(x, toY, { steps: 8 });
  await page.mouse.up();
}

/** 손가락 흉내: 같은 손잡이에 pointerType "touch" 포인터 이벤트를 보낸다(Playwright 에는 실제 터치 끌기가 없다). */
async function touchDrag(from: Locator, toY: number) {
  await from.evaluate((el, ty) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const send = (type: string, cy: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 11,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        }),
      );
    send("pointerdown", y);
    for (let i = 1; i <= 8; i += 1) send("pointermove", y + ((ty - y) * i) / 8);
    send("pointerup", ty);
  }, toY);
}

test.describe("화면 구성 화면 (휴대폰)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("더보기 → '화면 구성' → /layout, 맥락 바 뒤로 화살표 + 제목, 고른 작물 · 지역이 이어진다", async ({
    page,
  }) => {
    await page.goto("/more?st=136&crop=cabbage");
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: /^화면 구성/ });
    await expect(link).not.toContainText("준비 중");
    await expect(link).toHaveAttribute("href", "/layout?st=136&crop=cabbage");
    await link.click();
    await expect(page).toHaveURL(/\/layout\?st=136&crop=cabbage$/);
    await expect(page.getByTestId("context-title")).toHaveText("화면 구성");
    await expect(page.getByRole("button", { name: "뒤로" })).toBeVisible();
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page).toHaveURL(/\/more/);
  });

  test("기본 모양: 10줄 · 종합 '항상 사용'(스위치 없음) · 탭 1~4 · 구분선은 햇빛 아래 · 줄 높이 44 이상", async ({
    page,
  }) => {
    await open(page);
    await expect(rows(page)).toHaveCount(10);
    const ids = await order(page);
    expect(ids).toEqual([
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
    ]);
    // 이름
    for (let i = 0; i < 10; i += 1) {
      await expect(rows(page).nth(i)).toContainText(DEFAULT_LABELS[i]);
    }
    // 종합: 항상 사용, 스위치 없음
    const home = rowOf(page, "home");
    await expect(home).toContainText("항상 사용");
    await expect(home.getByRole("switch")).toHaveCount(0);
    // 나머지 아홉에는 스위치
    await expect(page.getByRole("switch")).toHaveCount(9);
    // 탭 배지
    for (const [i, n] of [0, 1, 2, 3].entries()) {
      await expect(rows(page).nth(n)).toContainText(`탭 ${i + 1}`);
    }
    await expect(rows(page).nth(4)).not.toContainText("탭 ");
    // 구분선: 햇빛 줄 아래 · 관측 줄 위
    const cut = page.getByTestId("layout-cut");
    await expect(cut).toHaveCount(1);
    await expect(cut).toContainText("여기까지 하단 탭");
    const sun = (await rowOf(page, "sun").boundingBox())!;
    const outlook = (await rowOf(page, "outlook").boundingBox())!;
    const c = (await cut.boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(sun.y + sun.height - 1);
    expect(c.y + c.height).toBeLessThanOrEqual(outlook.y + 1);
    // 줄 높이 44 이상
    for (const r of await rows(page).all()) {
      expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // 미리 보기: 종합 물 온도 햇빛 + 더보기
    await expect(preview(page)).toContainText("종합");
    expect((await preview(page).innerText()).replace(/\s+/g, " ").trim()).toBe(
      "종합 물 온도 햇빛 더보기",
    );
    // 저장 위치 안내
    await expect(
      page.getByText("이 기기에 저장돼요. 로그인하면 계정에 저장돼요."),
    ).toBeVisible();
  });

  test("'물' 끄기 → 미리 보기 · 실제 하단 탭에서 물이 빠지고 관측이 탭 4, 더보기에서도 빠지고 숨긴 메뉴 줄이 /layout 으로 가고, 새로고침해도 그대로", async ({
    page,
  }) => {
    await open(page);
    await row(page, "물").getByRole("switch", { name: "물 사용" }).click();
    await expect(page.getByRole("switch", { name: "물 사용" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(live(page)).toHaveText("물을 껐어요");
    // 끈 줄도 목록에 남고, 탭 배지가 없다
    await expect(rows(page)).toHaveCount(10);
    await expect(rowOf(page, "water")).not.toContainText("탭 ");
    await expect(rowOf(page, "outlook")).toContainText("탭 4");
    // 미리 보기
    expect((await preview(page).innerText()).replace(/\s+/g, " ").trim()).toBe(
      "종합 온도 햇빛 관측 더보기",
    );
    // 실제 하단 탭 (새로고침 없이)
    expect(await tabLabels(page)).toEqual([
      "종합",
      "온도",
      "햇빛",
      "관측",
      "더보기",
    ]);
    // 구분선은 관측 아래로
    const outlook = (await rowOf(page, "outlook").boundingBox())!;
    const cut = (await page.getByTestId("layout-cut").boundingBox())!;
    expect(cut.y).toBeGreaterThanOrEqual(outlook.y + outlook.height - 1);
    // 저장 값
    expect(JSON.parse((await savedRaw(page))!)).toMatchObject({
      v: 1,
      off: ["water"],
    });
    // 더보기(앱 안 이동): 물이 없고 숨긴 메뉴 1개 줄은 /layout 링크
    await tabbar(page).getByRole("link", { name: "더보기" }).click();
    await expect(page).toHaveURL(/\/more/);
    const hidden = page.getByRole("link", { name: /숨긴 메뉴 1개/ });
    await expect(hidden).toContainText("화면 구성에서 다시 켜기");
    await expect(hidden).toHaveAttribute("href", "/layout?st=101&crop=apple");
    await expect(
      page.getByRole("main").getByRole("link", { name: /^물/ }),
    ).toHaveCount(0);
    await hidden.click();
    await expect(page).toHaveURL(/\/layout/);
    await expect(page.getByRole("switch", { name: "물 사용" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // 새로고침 뒤에도 그대로
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole("switch", { name: "물 사용" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(await tabLabels(page)).toEqual([
      "종합",
      "온도",
      "햇빛",
      "관측",
      "더보기",
    ]);
    // 다시 켜면 처음 모양, 저장값은 지워진다(기본과 같으므로)
    await page.getByRole("switch", { name: "물 사용" }).click();
    await expect(live(page)).toHaveText("물을 켰어요");
    expect(await savedRaw(page)).toBeNull();
  });

  test("종합은 끌 수 없지만 옮길 수 있다 — 종합을 아래로 옮기면 탭 번호가 따라가고 더보기에서는 종합이 맨 위", async ({
    page,
  }) => {
    await open(page);
    await down(page, "종합").click();
    expect((await order(page)).slice(0, 3)).toEqual(["water", "home", "temp"]);
    await expect(rowOf(page, "home")).toContainText("탭 2");
    expect((await tabLabels(page)).slice(0, 4)).toEqual([
      "물",
      "종합",
      "온도",
      "햇빛",
    ]);
  });

  test("순서 바꾸기 — 끌기(마우스): 손잡이를 위로 끌어 놓으면 순서 · 하단 탭이 바뀐다", async ({
    page,
  }) => {
    await open(page);
    const target = await center(rowOf(page, "water"));
    await mouseDrag(page, handle(page, "햇빛"), target.y);
    expect((await order(page)).slice(0, 4)).toEqual([
      "home",
      "sun",
      "water",
      "temp",
    ]);
    expect((await tabLabels(page)).slice(0, 4)).toEqual([
      "종합",
      "햇빛",
      "물",
      "온도",
    ]);
    await expect(live(page)).toHaveText("햇빛을 2번째로 옮겼어요");
    expect(JSON.parse((await savedRaw(page))!).order.slice(0, 4)).toEqual([
      "home",
      "sun",
      "water",
      "temp",
    ]);
  });

  test("순서 바꾸기 — 끌기(손가락 흉내, pointerType touch): 아래로 끌기", async ({
    page,
  }) => {
    await open(page);
    const target = await center(rowOf(page, "sun"));
    await touchDrag(handle(page, "물"), target.y);
    expect((await order(page)).slice(0, 4)).toEqual([
      "home",
      "temp",
      "sun",
      "water",
    ]);
    expect((await tabLabels(page)).slice(0, 4)).toEqual([
      "종합",
      "온도",
      "햇빛",
      "물",
    ]);
  });

  test("끄는 동안 줄이 따라 움직이고, 목록 위 끝 밖으로 나가도 끊기지 않고 맨 위로 놓인다 · Esc 로 취소", async ({
    page,
  }) => {
    await open(page);
    const h = handle(page, "토양");
    // 아래쪽 줄이라 고정 하단 탭바에 가리지 않게 화면 가운데로 올린 뒤 잰다
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const { x, y } = await center(h);
    const before = (await rowOf(page, "soil").boundingBox())!;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 120, { steps: 6 });
    // 끄는 줄은 위로 따라 올라와 있다
    const moved = (await rowOf(page, "soil").boundingBox())!;
    await expect(rowOf(page, "soil")).toHaveAttribute("data-dragging", "true");
    await page.keyboard.press("Escape"); // 취소: 순서는 그대로
    await page.mouse.up();
    expect(await order(page)).toEqual([
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
    ]);
    expect(moved.y).toBeLessThan(before.y - 80);
    await expect(rowOf(page, "soil")).not.toHaveAttribute(
      "data-dragging",
      "true",
    );
    // 화면 맨 위 끝까지(목록 밖) 끌어도 맨 위로 놓인다
    await handle(page, "토양").evaluate((el) =>
      el.scrollIntoView({ block: "center" }),
    );
    await mouseDrag(page, handle(page, "토양"), 2);
    expect((await order(page))[0]).toBe("soil");
  });

  test("끌기 없는 길 ① 키보드: 손잡이에서 위/아래 화살표 · Home/End, 초점이 그대로, aria-live 알림", async ({
    page,
  }) => {
    await open(page);
    const h = handle(page, "물");
    await h.focus();
    await h.press("ArrowDown");
    expect((await order(page)).slice(0, 4)).toEqual([
      "home",
      "temp",
      "water",
      "sun",
    ]);
    await expect(live(page)).toHaveText("물을 3번째로 옮겼어요");
    await expect(h).toBeFocused(); // 옮겨도 같은 손잡이에 초점이 남는다
    await h.press("ArrowUp");
    await h.press("ArrowUp");
    expect((await order(page))[0]).toBe("water");
    await expect(live(page)).toHaveText("물을 1번째로 옮겼어요");
    await h.press("End");
    expect((await order(page))[9]).toBe("water");
    await h.press("Home");
    expect((await order(page))[0]).toBe("water");
    await expect(h).toBeFocused();
  });

  test("끌기 없는 길 ② ▲▼ 단추: 한 칸씩, 맨 위 ▲ · 맨 아래 ▼ 는 흐리게 + aria-disabled, 누른 뒤 초점 유지", async ({
    page,
  }) => {
    await open(page);
    await expect(up(page, "종합")).toHaveAttribute("aria-disabled", "true");
    await expect(down(page, "일지")).toHaveAttribute("aria-disabled", "true");
    await expect(down(page, "종합")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // 눌러도 아무 일 없는 끝 단추
    await up(page, "종합").click({ force: true });
    expect((await order(page))[0]).toBe("home");
    // 한 칸 위로
    await up(page, "온도").click();
    expect((await order(page)).slice(0, 3)).toEqual(["home", "temp", "water"]);
    await expect(live(page)).toHaveText("온도를 2번째로 옮겼어요");
    await expect(up(page, "온도")).toBeFocused();
    // 하단 탭에 바로 반영
    expect((await tabLabels(page)).slice(0, 4)).toEqual([
      "종합",
      "온도",
      "물",
      "햇빛",
    ]);
    // 크기: 누르는 곳 높이 44 이상
    for (const l of ["물", "온도", "햇빛"]) {
      expect((await up(page, l).boundingBox())!.height).toBeGreaterThanOrEqual(
        44,
      );
      expect(
        (await down(page, l).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test("'기본값': 기본 순서 · 모두 켬으로 돌아가고 저장값이 지워진다 (되묻는 창 없음)", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("switch", { name: "물 사용" }).click();
    await down(page, "종합").click();
    expect(await savedRaw(page)).not.toBeNull();
    await page.getByRole("button", { name: "기본값" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await order(page)).slice(0, 4)).toEqual([
      "home",
      "water",
      "temp",
      "sun",
    ]);
    await expect(page.getByRole("switch", { name: "물 사용" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await savedRaw(page)).toBeNull();
    expect(await tabLabels(page)).toEqual([
      "종합",
      "물",
      "온도",
      "햇빛",
      "더보기",
    ]);
    await expect(live(page)).toHaveText("기본값으로 되돌렸어요");
  });

  test("켠 메뉴가 4개 이하이면 구분선이 없다", async ({ page }) => {
    await open(page);
    for (const l of DEFAULT_LABELS.slice(4)) {
      await page.getByRole("switch", { name: `${l} 사용` }).click();
    }
    await expect(page.getByTestId("layout-cut")).toHaveCount(0);
    await expect(page.getByTestId("layout-row")).toHaveCount(10);
    expect((await preview(page).innerText()).replace(/\s+/g, " ").trim()).toBe(
      "종합 물 온도 햇빛 더보기",
    );
  });

  test("저장값이 있는 기기에서 목록이 기본 순서로 잠깐 보였다 바뀌지 않는다 (서버 HTML 에 목록 없음 · 처음 그려질 때 이미 저장 순서)", async ({
    page,
    request,
  }) => {
    // 서버가 보내는 HTML 에는 목록 줄이 없다(저장값을 읽은 뒤에 그린다)
    const html = await (await request.get("/layout")).text();
    expect(html).not.toContain('data-testid="layout-row"');
    // 저장값을 넣고 열기: 줄이 처음 나타나는 순간의 순서를 기록
    await page.addInitScript((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          v: 1,
          order: [
            "sun",
            "home",
            "water",
            "temp",
            "outlook",
            "price",
            "farminfo",
            "pest",
            "soil",
            "diary",
          ],
          off: [],
        }),
      );
      const w = window as unknown as { __firstOrder?: string[] };
      const mo = new MutationObserver(() => {
        const els = document.querySelectorAll('[data-testid="layout-row"]');
        if (els.length > 0 && !w.__firstOrder) {
          w.__firstOrder = Array.from(els).map(
            (e) => e.getAttribute("data-menu") ?? "",
          );
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    }, KEY);
    await page.goto("/layout?st=101&crop=apple");
    await page.waitForLoadState("networkidle");
    await expect(rows(page).first()).toBeVisible();
    const first = await page.evaluate(
      () => (window as unknown as { __firstOrder?: string[] }).__firstOrder,
    );
    expect(first?.slice(0, 3)).toEqual(["sun", "home", "water"]);
    // 목록 자리 높이가 미리 잡혀 있어 아래 "기본값" · 안내가 밀리지 않는다(자리 상자가 있었다는 표시)
    expect(
      (await page.getByRole("button", { name: "기본값" }).boundingBox())!.y,
    ).toBeGreaterThan(600);
  });

  test("150%: 가로로 넘치지 않고 줄 높이 44 이상, 줄 안 글자 · 단추가 서로 넘치지 않고, 맨 아래 줄은 ▲로 맨 위까지 올라간다", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem(
        "cropmon-font-scale",
        JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
      );
    });
    await open(page);
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--fz"),
      ),
    ).toBe("1.5");
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const r of await rows(page).all()) {
      const b = (await r.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width).toBeLessThanOrEqual(390.5);
      const inner = await r.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(inner).toBeLessThanOrEqual(0);
    }
    // 줄 안 요소(이름 · 배지 · 단추 · 스위치 · 손잡이)가 서로 겹치지 않는다
    const overlaps = await page.evaluate(() => {
      const bad: string[] = [];
      for (const r of Array.from(
        document.querySelectorAll('[data-testid="layout-row"]'),
      )) {
        const kids = Array.from(
          r.querySelectorAll("[data-part]"),
        ) as HTMLElement[];
        for (let i = 0; i < kids.length; i += 1) {
          for (let j = i + 1; j < kids.length; j += 1) {
            const a = kids[i].getBoundingClientRect();
            const b = kids[j].getBoundingClientRect();
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 1 && h > 1)
              bad.push(
                `${r.getAttribute("data-menu")}: ${kids[i].dataset.part}↔${kids[j].dataset.part}`,
              );
          }
        }
      }
      return bad;
    });
    expect(overlaps).toEqual([]);
    // 맨 아래 줄(일지)을 ▲로 맨 위까지
    for (let i = 0; i < 9; i += 1) await up(page, "일지").click();
    expect((await order(page))[0]).toBe("diary");
    await context.close();
  });

  test("다크 모드: 스위치 · 배지 · 구분선이 바탕과 구분된다", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem("cropmon-theme", "dark"),
    );
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const sw = page.getByRole("switch", { name: "물 사용" });
    const track = await sw
      .locator("span")
      .first()
      .evaluate((el) => {
        return getComputedStyle(el).backgroundColor;
      });
    expect(track).not.toBe("rgba(0, 0, 0, 0)");
    const badge = await rowOf(page, "home")
      .getByText("항상 사용")
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, fg: s.color };
      });
    expect(badge.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(badge.bg).not.toBe(badge.fg);
    const cutColor = await page
      .getByTestId("layout-cut")
      .evaluate((el) => getComputedStyle(el).color);
    const pageBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(cutColor).not.toBe(pageBg);
    await context.close();
  });
});
