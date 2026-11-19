import { expect, test, type Page } from "./fixtures";

// 글씨 크기 변수 --fz (이슈 #151, 결정 0047). 글씨 크기를 고르는 화면은 아직 없으므로 시험은 <html> 의 --fz 를 직접 바꿔서 한다.
// 같은 클래스(text-17 등)를 구역 안팎에 놓은 시험용 요소로 "상속 함정"(구역 안에서 --fz 를 되돌려도 글자가 안 바뀌는 문제)을 확인한다.
// 휴대폰(mobile 프로젝트 390×844)과 데스크톱(1440)이 한 파일에서 갈라 돈다.

/** [--fz, 기대값] 다섯 단계: 작게 · 보통 · 크게 · 더 크게 · 아주 크게 */
const FZ = [0.9, 1, 1.15, 1.3, 1.5];
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 1);

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const setFz = (page: Page, fz: number) =>
  page.evaluate(
    (v) => document.documentElement.style.setProperty("--fz", String(v)),
    fz,
  );

/** 시험용 요소를 달고 계산된 글자 크기·높이를 돌려준다. */
async function measure(page: Page) {
  return page.evaluate(() => {
    document.getElementById("fz-probe")?.remove();
    const box = document.createElement("div");
    box.id = "fz-probe";
    box.innerHTML = `
      <span data-k="t17" class="text-17">가</span>
      <span data-k="t13" class="text-13">가</span>
      <span data-k="t12" class="text-12">가</span>
      <div class="fz-cap">
        <span data-k="cap14" class="text-14">가</span>
        <span data-k="cap13" class="text-13">가</span>
        <span data-k="cap12" class="text-12">가</span>
        <div class="fz-fixed"><span data-k="capfix17" class="text-17">가</span></div>
      </div>
      <div class="fz-fixed">
        <span data-k="fix17" class="text-17">가</span>
        <span data-k="fix13" class="text-13">가</span>
        <span data-k="fix12" class="text-12">가</span>
        <div data-k="fixh44" class="fh-44">가</div>
      </div>
      <div data-k="h44" class="fh-44">가</div>`;
    document.body.appendChild(box);
    const out: Record<string, number> = {};
    for (const el of box.querySelectorAll<HTMLElement>("[data-k]")) {
      const cs = getComputedStyle(el);
      out[el.dataset.k!] = el.dataset.k!.includes("h44")
        ? el.getBoundingClientRect().height
        : parseFloat(cs.fontSize);
    }
    return out;
  });
}

test.describe("계산된 글자 크기·높이 (--fz 다섯 단계)", () => {
  const T17 = [15.3, 17, 19.55, 22.1, 25.5];
  const T13 = [12, 13, 14.95, 14.95, 14.95]; // --fz2: 115% 상한, 하한 12px
  const T12 = [12, 12, 13.8, 13.8, 13.8];
  const CAP14 = [12.6, 14, 16.1, 18.2, 18.2]; // 배지: 130% 상한
  const CAP13 = [12, 13, 14.95, 16.9, 16.9];
  const CAP12 = [12, 12, 13.8, 15.6, 15.6]; // 탭 글자: 130% 상한, 하한 12px
  const H44 = [44, 44, 50.6, 57.2, 57.2]; // --fh: 130% 상한, 작게에서도 줄이지 않음

  test("본문·13 이하·배지/탭·높이가 표대로 바뀐다", async ({ page }) => {
    await open(page, "/soil?st=101&crop=apple");
    for (const [i, fz] of FZ.entries()) {
      await setFz(page, fz);
      const m = await measure(page);
      near(m.t17, T17[i]);
      near(m.t13, T13[i]);
      near(m.t12, T12[i]);
      near(m.cap14, CAP14[i]);
      near(m.cap13, CAP13[i]);
      near(m.cap12, CAP12[i]);
      near(m.h44, H44[i]);
    }
  });

  test("고정 구역(fz-fixed)은 어느 단계에서도 그대로 — 같은 클래스가 구역 밖에서는 커진다 (상속 함정)", async ({
    page,
  }) => {
    await open(page, "/soil?st=101&crop=apple");
    for (const fz of FZ) {
      await setFz(page, fz);
      const m = await measure(page);
      near(m.fix17, 17);
      near(m.fix13, 13);
      near(m.fix12, 12);
      near(m.capfix17, 17); // 상한 구역 안의 고정 구역도 고정
      near(m.fixh44, 44);
    }
    await setFz(page, 1.5);
    const m = await measure(page);
    expect(m.t17).toBeGreaterThan(m.fix17 + 8); // 구역 밖은 25.5, 안은 17
  });

  test("보통(--fz 1)에서는 본문 17 · 13 · 12 · 높이 44 그대로", async ({
    page,
  }) => {
    await open(page, "/soil?st=101&crop=apple");
    const m = await measure(page);
    expect([m.t17, m.t13, m.t12, m.h44]).toEqual([17, 13, 12, 44]);
  });
});

test.describe("휴대폰", () => {
  test.skip(({ isMobile }) => !isMobile);

  const tabs = (page: Page) =>
    page.getByRole("navigation", { name: "메뉴" }).getByRole("link");

  test("하단 탭 글자는 130% 상한 · 12px 하한, 탭바 높이 54는 그대로, 글자가 잘리지 않는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const expected = [12, 12, 13.8, 15.6, 15.6];
    for (const [i, fz] of FZ.entries()) {
      await setFz(page, fz);
      const bar = (await page
        .getByRole("navigation", { name: "메뉴" })
        .boundingBox())!;
      expect(bar.height).toBe(54);
      for (const link of await tabs(page).all()) {
        near(
          await link.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          ),
          expected[i],
        );
        const clipped = await link.evaluate(
          (el) => el.scrollHeight > el.clientHeight + 1,
        );
        expect(clipped, `fz ${fz}`).toBe(false);
      }
    }
  });

  test("머리 줄·선택 바 글자는 --fz 1.5에서도 그대로", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    const sizes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("header .fz-fixed *")]
          .filter((el) => el.childNodes.length && el.textContent?.trim())
          .slice(0, 12)
          .map((el) => parseFloat(getComputedStyle(el).fontSize)),
      );
    await setFz(page, 1);
    const base = await sizes();
    expect(base.length).toBeGreaterThan(3);
    await setFz(page, 1.5);
    expect(await sizes()).toEqual(base);
  });

  for (const path of ["/", "/water", "/more"]) {
    test(`--fz 1.5: ${path} 셸이 가로로 넘치지 않는다 (390)`, async ({
      page,
    }) => {
      await open(page, `${path}?st=101&crop=apple`);
      await setFz(page, 1.5);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const rect = (sel: string) =>
          document.querySelector(sel)!.getBoundingClientRect();
        const header = document.querySelector("header")!;
        const bar = rect('nav[aria-label="메뉴"]:not([hidden])');
        return {
          vw,
          headerOverflow: header.scrollWidth - header.clientWidth,
          barLeft: bar.left,
          barRight: bar.right,
          headerRight: header.getBoundingClientRect().right,
        };
      });
      expect(r.headerOverflow).toBeLessThanOrEqual(0);
      expect(r.headerRight).toBeLessThanOrEqual(r.vw + 0.5);
      expect(r.barLeft).toBeGreaterThanOrEqual(0);
      expect(r.barRight).toBeLessThanOrEqual(r.vw + 0.5);
    });
  }

  test("--fz 1.5: 더보기 목록 줄이 화면 안에 들어오고 누르는 높이 44 이상", async ({
    page,
  }) => {
    await open(page, "/more?st=101&crop=apple");
    await setFz(page, 1.5);
    const vw = page.viewportSize()!.width;
    const rows = await page.getByRole("main").getByRole("link").all();
    // 서비스 메뉴 10개 + "약관" 줄(#173) + "글씨 크기" 줄(#168) — 둘 다 준비 중 버튼에서 링크가 됨
    expect(rows.length).toBe(12);
    for (const row of rows) {
      const b = (await row.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("데스크톱", () => {
  test.skip(({ isMobile }) => isMobile);

  test("메뉴 줄 글자 17은 어느 단계에서도 그대로, 10개가 넘치지 않는다 (1440)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const nav = page.getByRole("navigation", { name: "메뉴" });
    for (const fz of FZ) {
      await setFz(page, fz);
      const links = await nav.getByRole("link").all();
      expect(links).toHaveLength(10);
      for (const link of links) {
        near(
          await link.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          ),
          17,
        );
      }
      const overflow = await nav.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow, `fz ${fz}`).toBeLessThanOrEqual(0);
    }
  });

  test("--fz 1.5: 머리 줄·선택 바 글자는 그대로이고 머리 줄이 가로로 넘치지 않는다 (1440)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const sizes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("header .fz-fixed *")]
          .filter((el) => el.childNodes.length && el.textContent?.trim())
          .slice(0, 20)
          .map((el) => parseFloat(getComputedStyle(el).fontSize)),
      );
    await setFz(page, 1);
    const base = await sizes();
    expect(base.length).toBeGreaterThan(5);
    await setFz(page, 1.5);
    expect(await sizes()).toEqual(base);
    const overflow = await page.evaluate(() => {
      const h = document.querySelector("header")!;
      return h.scrollWidth - h.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("--fz 1.5: 본문 글자는 커진다 (물 화면 제목)", async ({ page }) => {
    await open(page, "/water?st=101&crop=apple");
    const h1 = page.getByRole("heading", { level: 1 });
    const before = await h1.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    await setFz(page, 1.5);
    const after = await h1.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    near(after, before * 1.5);
  });
});
