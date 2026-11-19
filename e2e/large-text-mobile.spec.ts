import { expect, test, type Locator, type Page } from "./fixtures";

// 큰 글씨(130% 이상) 화면 배치 바꿈 (이슈 #172, 결정 0056). 휴대폰 390. 글씨 크기는 저장 값(cropmon-font-scale)을 넣어 연다.
// 규칙: "130% 이상은 가장 중요한 것 하나가 스크롤 없이 보이게" — 화면 확대가 아니라 배치 바꿈(세로로 쌓기 · 아래 줄로 내리기).
// 130% 이상 판정은 <html data-fz-big> 하나(머리 스크립트가 첫 그리기 전에 단다)로 한다.

type Step = "normal" | "large" | "xlarge" | "xxlarge";
const PCT: Record<Step, number> = {
  normal: 100,
  large: 115,
  xlarge: 130,
  xxlarge: 150,
};

async function openAt(page: Page, path: string, step: Step) {
  await page.addInitScript((s) => {
    localStorage.setItem(
      "cropmon-font-scale",
      JSON.stringify({ v: 1, step: s, follow: false }),
    );
  }, step);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const box = async (el: Locator) => (await el.boundingBox())!;

test.describe("큰 글씨 배치 (휴대폰)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("data-fz-big: 130% 이상에서만 첫 그리기부터 붙는다 (100% · 115%에서는 없음)", async ({
    browser,
  }) => {
    for (const step of ["normal", "large", "xlarge", "xxlarge"] as const) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      // 화면 내용(body)이 처음 생기는 순간의 표시를 기록한다
      await page.addInitScript(() => {
        const w = window as unknown as { __bigFirst?: boolean };
        const mo = new MutationObserver(() => {
          if (document.body && w.__bigFirst === undefined) {
            w.__bigFirst = document.documentElement.hasAttribute("data-fz-big");
            mo.disconnect();
          }
        });
        mo.observe(document, { childList: true, subtree: true });
      });
      await openAt(page, "/water?st=101&crop=apple", step);
      const first = await page.evaluate(
        () => (window as unknown as { __bigFirst?: boolean }).__bigFirst,
      );
      expect(first, `${PCT[step]}% 첫 그리기`).toBe(
        step === "xlarge" || step === "xxlarge",
      );
      await context.close();
    }
  });

  test("글씨 크기 화면에서 바꾸면 data-fz-big 도 바로 따라 붙고 떨어진다", async ({
    page,
  }) => {
    await page.goto("/font-size?st=101&crop=apple");
    await page.waitForLoadState("networkidle");
    const big = () =>
      page.evaluate(() => document.documentElement.hasAttribute("data-fz-big"));
    expect(await big()).toBe(false);
    await page.getByRole("button", { name: "더 크게", exact: true }).click();
    await expect.poll(big).toBe(true);
    await page.getByRole("button", { name: "크게", exact: true }).click();
    await expect.poll(big).toBe(false);
    await page.getByRole("button", { name: "아주 크게", exact: true }).click();
    await expect.poll(big).toBe(true);
  });

  test("물 판정 카드 숫자 셋: 115%에서는 한 줄, 130% · 150%에서는 세로로 한 줄씩", async ({
    page,
  }) => {
    const labels = (p: Page) => {
      const card = p.getByRole("region", { name: "지금 토양 상태" });
      return [
        card.getByText("기준 증발산"),
        card.getByText("작물이 쓴 물"),
        card.getByText("이날 비"),
      ];
    };
    await openAt(page, "/water?st=101&crop=apple", "large");
    const row = await Promise.all(labels(page).map((l) => box(l)));
    expect(Math.abs(row[1].y - row[0].y)).toBeLessThan(2);
    expect(Math.abs(row[2].y - row[0].y)).toBeLessThan(2);
    for (const step of ["xlarge", "xxlarge"] as const) {
      await page.addInitScript(
        (s) =>
          localStorage.setItem(
            "cropmon-font-scale",
            JSON.stringify({ v: 1, step: s, follow: false }),
          ),
        step,
      );
      await page.reload();
      await page.waitForLoadState("networkidle");
      const col = await Promise.all(labels(page).map((l) => box(l)));
      expect(col[1].y, `${PCT[step]}% 둘째`).toBeGreaterThanOrEqual(
        col[0].y + col[0].height,
      );
      expect(col[2].y, `${PCT[step]}% 셋째`).toBeGreaterThanOrEqual(
        col[1].y + col[1].height,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${PCT[step]}% 가로 넘침`).toBe(false);
    }
  });

  test("종합 목록: 115%에서는 지점 · 배지 · 막대가 한 줄, 130% 이상에서는 막대가 아래 줄 전체 폭", async ({
    page,
  }) => {
    const parts = async (p: Page) => {
      const row = p.locator('#national-panel a[aria-current="true"]');
      const name = row.getByText("춘천", { exact: true });
      const bar = row.locator('div[aria-hidden="true"]').first();
      return {
        row: await box(row),
        name: await box(name),
        bar: await box(bar),
      };
    };
    await openAt(page, "/?st=101&crop=apple", "large");
    const a = await parts(page);
    expect(a.bar.y).toBeLessThan(a.name.y + a.name.height); // 한 줄
    for (const step of ["xlarge", "xxlarge"] as const) {
      await page.addInitScript(
        (s) =>
          localStorage.setItem(
            "cropmon-font-scale",
            JSON.stringify({ v: 1, step: s, follow: false }),
          ),
        step,
      );
      await page.reload();
      await page.waitForLoadState("networkidle");
      const b = await parts(page);
      expect(b.bar.y, `${PCT[step]}% 막대 위`).toBeGreaterThanOrEqual(
        b.name.y + b.name.height,
      );
      // 줄 전체 폭을 쓴다(오른쪽 칸에 갇히지 않음)
      expect(b.bar.width, `${PCT[step]}% 막대 폭`).toBeGreaterThan(
        b.row.width * 0.5,
      );
      expect(b.bar.x + b.bar.width).toBeLessThanOrEqual(
        b.row.x + b.row.width + 0.5,
      );
    }
  });

  test("온도 단계 카드 두 장: 115%에서는 나란히, 130% 이상에서는 한 장씩 쌓이고 날짜가 한 줄", async ({
    page,
  }) => {
    const cards = (p: Page) =>
      p.getByRole("region", { name: "적산온도 단계" }).locator("> div > div");
    await openAt(page, "/temperature?st=101&crop=apple", "large");
    await expect(cards(page)).toHaveCount(2);
    const side = [await box(cards(page).nth(0)), await box(cards(page).nth(1))];
    expect(Math.abs(side[1].y - side[0].y)).toBeLessThan(2); // 나란히
    for (const step of ["xlarge", "xxlarge"] as const) {
      await page.addInitScript(
        (s) =>
          localStorage.setItem(
            "cropmon-font-scale",
            JSON.stringify({ v: 1, step: s, follow: false }),
          ),
        step,
      );
      await page.reload();
      await page.waitForLoadState("networkidle");
      const a = await box(cards(page).nth(0));
      const b = await box(cards(page).nth(1));
      expect(b.y, `${PCT[step]}% 둘째 카드`).toBeGreaterThanOrEqual(
        a.y + a.height - 0.5,
      );
      expect(a.width, `${PCT[step]}% 카드 폭`).toBeGreaterThan(300);
      // 날짜 글자("9월 10일")가 한 줄: 높이가 글자 크기의 1.7배 이하
      for (const i of [0, 1]) {
        const date = cards(page).nth(i).locator("span.text-24");
        const h = (await box(date)).height;
        const fs = await date.evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        );
        expect(h, `${PCT[step]}% ${i + 1}번째 날짜 한 줄`).toBeLessThanOrEqual(
          fs * 1.7,
        );
      }
    }
  });

  test("물 기준 날짜 줄: 150%에서 날짜 글자가 한 줄이고 ‹ 는 눌리는 곳 44 이상", async ({
    page,
  }) => {
    await openAt(page, "/water?st=101&crop=apple", "xxlarge");
    const date = page.getByTestId("day-date");
    await expect(date).toBeVisible();
    const h = (await box(date)).height;
    const fs = await date.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(h).toBeLessThanOrEqual(fs * 1.7); // 한 줄
    const prev = page.getByRole("link", { name: "전날" });
    const p = await box(prev);
    expect(p.width).toBeGreaterThanOrEqual(44);
    expect(p.height).toBeGreaterThanOrEqual(44);
    // 날짜 줄이 화면 안에 있고 가로로 넘치지 않는다
    const nav = await box(page.getByRole("navigation", { name: "기준 날짜" }));
    expect(nav.x + nav.width).toBeLessThanOrEqual(390.5);
  });

  test("물 기준 날짜 줄: 지난 날짜(오늘로 버튼이 생김)에서도 150%에서 날짜가 한 줄", async ({
    page,
  }) => {
    await openAt(page, "/water?st=101&crop=apple", "xxlarge");
    await page.getByRole("link", { name: "전날" }).click();
    await expect(page).toHaveURL(/&d=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole("link", { name: "오늘로" })).toBeVisible();
    const date = page.getByTestId("day-date");
    const h = (await box(date)).height;
    const fs = await date.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(h).toBeLessThanOrEqual(fs * 1.7);
    const nav = await box(page.getByRole("navigation", { name: "기준 날짜" }));
    expect(nav.x + nav.width).toBeLessThanOrEqual(390.5);
  });

  // ── 높이 고정 글자 상자 확인에서 겹침 · 잘림이 있던 곳 (PR 본문 표) ──

  test("물(작물 공통) 계절 그래프 월 눈금: 130% 이상에서 이웃 눈금끼리 겹치지 않는다", async ({
    page,
  }) => {
    for (const step of ["xlarge", "xxlarge"] as const) {
      await openAt(page, "/water?st=101&crop=common", step);
      const ticks = page.getByTestId("season-month");
      const n = await ticks.count();
      expect(n, "월 눈금 개수").toBeGreaterThan(6);
      let prevRight = -Infinity;
      for (let i = 0; i < n; i++) {
        const b = await box(ticks.nth(i));
        expect(b.x, `${PCT[step]}% ${i + 1}번째 눈금`).toBeGreaterThanOrEqual(
          prevRight - 0.5,
        );
        prevRight = b.x + b.width;
      }
    }
  });

  test("햇빛 월별 막대: 130% 이상에서 막대 위 퍼센트 글자끼리 겹치지 않고 월 글자도 겹치지 않는다", async ({
    page,
  }) => {
    for (const step of ["xlarge", "xxlarge"] as const) {
      await openAt(page, "/sunlight?st=101&crop=apple", step);
      const pcts = page.locator('[data-testid^="pct-"]');
      const n = await pcts.count();
      expect(n).toBeGreaterThan(6);
      let prevRight = -Infinity;
      for (let i = 0; i < n; i++) {
        const el = pcts.nth(i);
        // 눈에 보이는 글자(숨긴 % 는 빼고)의 상자로 잰다
        const r = await el.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects()).filter(
            (q) => q.width > 0,
          );
          const left = Math.min(...rects.map((q) => q.left));
          const right = Math.max(...rects.map((q) => q.right));
          return { left, right };
        });
        expect(
          r.left,
          `${PCT[step]}% ${i + 1}월 퍼센트`,
        ).toBeGreaterThanOrEqual(prevRight - 0.5);
        prevRight = r.right;
      }
      // 월 글자
      const months = page.getByTestId("sun-month");
      const m = await months.count();
      expect(m).toBe(n);
      let prev = -Infinity;
      for (let i = 0; i < m; i++) {
        const b = await box(months.nth(i));
        expect(
          b.x,
          `${PCT[step]}% ${i + 1}번째 월 글자`,
        ).toBeGreaterThanOrEqual(prev - 0.5);
        prev = b.x + b.width;
      }
    }
  });

  test("내 농장 토성 목록: 150%에서 글자가 칸 테두리에 닿거나 넘치지 않는다", async ({
    page,
  }) => {
    await openAt(page, "/my-farm", "xxlarge");
    const tiles = page.locator("button:has-text('Silty clay loam')");
    await expect(tiles).toHaveCount(1);
    const all = page
      .locator("button")
      .filter({ has: page.locator("span.opacity-75") });
    const n = await all.count();
    expect(n).toBe(12);
    for (let i = 0; i < n; i++) {
      const t = all.nth(i);
      const r = await t.evaluate((el) => {
        const bb = el.getBoundingClientRect();
        const spans = Array.from(el.querySelectorAll("span"));
        const inner = spans.map((s) => {
          const range = document.createRange();
          range.selectNodeContents(s);
          const rs = Array.from(range.getClientRects()).filter(
            (q) => q.width > 0,
          );
          return {
            left: Math.min(...rs.map((q) => q.left)) - bb.left,
            right: bb.right - Math.max(...rs.map((q) => q.right)),
          };
        });
        return { inner, over: el.scrollWidth - el.clientWidth };
      });
      expect(r.over, `${i + 1}번째 칸 넘침`).toBeLessThanOrEqual(0);
      // 글자와 칸 테두리 사이에 숨 쉴 틈(4px 이상)
      for (const sp of r.inner) {
        expect(sp.left, `${i + 1}번째 칸 왼쪽 틈`).toBeGreaterThanOrEqual(4);
        expect(sp.right, `${i + 1}번째 칸 오른쪽 틈`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
