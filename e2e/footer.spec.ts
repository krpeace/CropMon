import { expect, test, type Page } from "./fixtures";

// 데스크톱 바닥글 (이슈 #161, 결정 0052): 링크 줄 다섯(개인정보처리방침만 굵게, 아직 글자만)과 운영자 표기(12px 회색).
// 휴대폰 바닥글은 바꾸지 않는다 — 링크 줄 · 운영자 표기는 폭 1024 이상에서만 보인다.

/** 이슈 #161 본문의 운영자 표기 문구 그대로 (약관 · 개인정보처리방침 초안과 같은 글자). */
const OPERATOR =
  "주식회사 파모스 · 대표 이세용 · 사업자등록번호 281-87-02364 · 경기도 안양시 동안구 시민대로248번길 25, 503호(관양동, 경기창조산업안양센터) · 031-360-4152";

const footer = (page: Page) => page.getByRole("contentinfo");
const items = (page: Page) =>
  footer(page).getByTestId("footer-notices").getByRole("listitem");
const operator = (page: Page) => footer(page).getByTestId("operator");

async function open(page: Page, path = "/water?st=101&crop=apple") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 글자 조각이 몇 줄에 걸쳐 그려지는지 (한 줄이면 1). */
async function linesOf(page: Page, selector: string, needle: string) {
  return page.evaluate(
    ({ selector, needle }) => {
      const root = document.querySelector(selector)!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.textContent ?? "").indexOf(needle);
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + needle.length);
        return new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        ).size;
      }
      return -1; // 못 찾음
    },
    { selector, needle },
  );
}

test.describe("데스크톱 1440", () => {
  test.skip(({ isMobile }) => isMobile);

  test("링크 줄: 공지 · 문의 · FAQ · 약관 · 개인정보처리방침 다섯, 개인정보처리방침만 굵게", async ({
    page,
  }) => {
    await open(page);
    await expect(items(page)).toHaveText([
      "공지",
      "문의",
      "FAQ",
      "약관",
      "개인정보처리방침",
    ]);
    const weights = await items(page).evaluateAll((els) =>
      els.map((el) => Number(getComputedStyle(el).fontWeight)),
    );
    expect(weights[4]).toBeGreaterThanOrEqual(700); // 개인정보처리방침
    for (const w of weights.slice(0, 4)) expect(w).toBeLessThan(600);
  });

  test("링크 줄은 아직 글자만이다 — 링크 아님, '준비 중' 표시 없음, 회색", async ({
    page,
  }) => {
    await open(page);
    const list = footer(page).getByTestId("footer-notices");
    await expect(list.getByRole("link")).toHaveCount(0);
    await expect(list.getByRole("button")).toHaveCount(0);
    await expect(list).not.toContainText("준비 중");
    const colors = await items(page).evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color),
    );
    // 라이트의 회색 글자(--color-gray-ink rgb(99 99 102))
    for (const c of colors) expect(c).toBe("rgb(99, 99, 102)");
  });

  test("운영자 표기: 문구가 이슈의 인용과 같고 12px 회색이다", async ({
    page,
  }) => {
    await open(page);
    await expect(operator(page)).toHaveText(OPERATOR);
    const style = await operator(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), color: s.color };
    });
    expect(style.size).toBe(12);
    expect(style.color).toBe("rgb(99, 99, 102)");
  });

  test("지금 바닥글의 자료 출처 줄 · 판 번호 · CropMon 소개는 그대로다", async ({
    page,
  }) => {
    await open(page);
    await expect(footer(page)).toContainText(
      "자료 출처: 기상청 (ASOS 종관기상관측 · 단기예보)",
    );
    await expect(footer(page)).toContainText(/CropMon v\d+\.\d+\.\d+/);
    await expect(
      footer(page).getByRole("button", { name: "CropMon 소개" }),
    ).toBeVisible();
  });

  test("사업자등록번호 · 전화는 좁은 칸에서도 줄에서 쪼개지지 않는다 (글자는 안 바꿈)", async ({
    page,
  }) => {
    await open(page);
    // 대조: 마디 묶음이 없는 일반 글자는 하이픈 뒤에서 줄이 끊긴다 (이 시험이 쪼개짐을 잡아낼 수 있다는 증거)
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "control";
      box.style.cssText = "width:70px;font-size:12px;position:absolute;top:0";
      box.textContent = "281-87-02364 031-360-4152";
      document.body.appendChild(box);
    });
    expect(await linesOf(page, "#control", "281-87-02364")).toBeGreaterThan(1);

    // 운영자 표기를 좁은 칸에 넣어도 두 번호는 한 줄
    await operator(page).evaluate((el) => {
      el.style.width = "240px";
    });
    expect(
      await linesOf(page, '[data-testid="operator"]', "281-87-02364"),
    ).toBe(1);
    expect(
      await linesOf(page, '[data-testid="operator"]', "031-360-4152"),
    ).toBe(1);
    // 줄 처음에 가운뎃점이 오지 않는다 (점은 앞 마디 끝에 붙는다)
    const dotAtLineStart = await operator(page).evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent ?? "";
        for (let i = 0; i < t.length; i += 1) {
          if (t[i] !== "·") continue;
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const dot = range.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          if (dot.left - box.left < 4) return true;
        }
      }
      return false;
    });
    expect(dotAtLineStart).toBe(false);
  });

  test("폭 1024 · 1280 에서도 링크 줄과 운영자 표기가 보이고 가로로 넘치지 않는다", async ({
    page,
  }) => {
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await expect(operator(page)).toBeVisible();
      await expect(items(page)).toHaveCount(5);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `폭 ${width}`).toBeLessThanOrEqual(0);
    }
  });

  test("운영자 표기는 글씨 크기를 따르되 하한 12 (--fz 0.9 → 12, 1.5 → 13.8)", async ({
    page,
  }) => {
    await open(page);
    const size = () =>
      operator(page).evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      );
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--fz", "0.9"),
    );
    expect(await size()).toBe(12);
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--fz", "1.5"),
    );
    expect(await size()).toBeCloseTo(13.8, 1);
  });
});

test.describe("휴대폰 390", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("휴대폰 바닥글은 바꾸지 않는다 — 링크 줄 · 운영자 표기가 없다", async ({
    page,
  }) => {
    await open(page);
    await expect(footer(page).getByTestId("footer-notices")).toBeHidden();
    await expect(operator(page)).toBeHidden();
    await expect(footer(page)).toContainText("자료 출처: 기상청");
    await expect(
      footer(page).getByRole("button", { name: "CropMon 소개" }),
    ).toBeVisible();
  });
});
