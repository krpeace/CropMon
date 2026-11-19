import { expect, test, type Page } from "./fixtures";

// 약관 · 개인정보처리방침 화면 /terms · /privacy (이슈 #173, 결정 0057). 휴대폰 390.
// 로그인 없이 열리는 공개 주소. 본문은 저장소의 글 파일(content/legal)이고 "예시 글" 배지가 붙는다.

const OPERATOR_LINE =
  "주식회사 파모스 · 대표 이세용 · 사업자등록번호 281-87-02364 · 경기도 안양시 동안구 시민대로248번길 25, 503호(관양동, 경기창조산업안양센터) · 031-360-4152";

const main = (page: Page) => page.getByRole("main");

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.describe("약관 · 개인정보처리방침 (휴대폰)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("더보기 → '약관' → /terms, 맥락 바에 뒤로 화살표 + '약관'", async ({
    page,
  }) => {
    await open(page, "/more?st=101&crop=apple");
    const row = page.getByRole("link", { name: /^약관/ });
    await expect(row).not.toContainText("준비 중");
    await expect(row).toHaveAttribute("href", "/terms");
    await row.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByTestId("context-title")).toHaveText("약관");
    await expect(page.getByRole("button", { name: "뒤로" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "CropMon 이용약관" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page).toHaveURL(/\/more/);
  });

  test("두 문서 바꾸기: 링크 두 칸, 지금 문서 aria-current, 눌러서 주소가 바뀐다", async ({
    page,
  }) => {
    await open(page, "/terms");
    const switcher = page.getByRole("navigation", { name: "문서 바꾸기" });
    const terms = switcher.getByRole("link", { name: "이용약관" });
    const privacy = switcher.getByRole("link", { name: "개인정보처리방침" });
    await expect(terms).toHaveAttribute("href", "/terms");
    await expect(privacy).toHaveAttribute("href", "/privacy");
    await expect(terms).toHaveAttribute("aria-current", "page");
    await expect(privacy).not.toHaveAttribute("aria-current", "page");
    for (const l of [terms, privacy]) {
      expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await privacy.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page
        .getByRole("navigation", { name: "문서 바꾸기" })
        .getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { level: 2, name: "CropMon 개인정보처리방침" }),
    ).toBeVisible();
  });

  test("'예시 글' 배지 · 안내 · 시행일 줄이 본문 위에 있다", async ({
    page,
  }) => {
    for (const path of ["/terms", "/privacy"]) {
      await open(page, path);
      await expect(
        main(page).getByText("예시 글", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText(
          "전문가 확인을 거친 초안이에요. 2027년 1월 1일 시행 전에 바뀔 수 있어요.",
        ),
      ).toBeVisible();
      const eff = main(page).getByText("시행일 2027년 1월 1일 · 제1판");
      await expect(eff).toBeVisible();
      const badgeY = (await main(page)
        .getByText("예시 글", { exact: true })
        .boundingBox())!.y;
      const effY = (await eff.boundingBox())!.y;
      const bodyY = (await main(page)
        .getByRole("heading", { level: 2 })
        .boundingBox())!.y;
      expect(badgeY).toBeLessThan(effY); // 배지는 시행일 줄 위
      expect(effY).toBeLessThan(bodyY); // 시행일 줄은 본문 위
    }
  });

  test("약관 본문: 조 제목 · 번호는 원문 그대로 · 굵은 글씨", async ({
    page,
  }) => {
    await open(page, "/terms");
    await expect(
      main(page).getByRole("heading", {
        level: 3,
        name: "제10조 (책임의 한계)",
      }),
    ).toBeVisible();
    await expect(
      main(page).getByRole("heading", { level: 3, name: "부칙" }),
    ).toBeVisible();
    // 제8조 번호 목록의 셋째 항목 번호는 원문 그대로 3 (li value)
    const li = main(page).locator("li", {
      hasText: "회사가 서비스 전체를 그만두는 경우 30일 전에 알리고",
    });
    await expect(li).toHaveAttribute("value", "3");
    // 제4조 2항의 굵은 글씨
    await expect(
      main(page).locator("strong", {
        hasText: "만 14세 미만은 회원으로 가입할 수 없습니다.",
      }),
    ).toBeVisible();
  });

  test("방침 7번 국외 이전 표: table 로 그려지고, 머리 칸은 th scope=col, 화면 문서 폭이 390을 안 넘는다(표만 스크롤)", async ({
    page,
  }) => {
    await open(page, "/privacy");
    await expect(
      main(page).getByRole("heading", {
        level: 3,
        name: "7. 개인정보의 국외 이전",
      }),
    ).toBeVisible();
    const table = main(page).locator("table", {
      hasText: "이전받는 자(연락처)",
    });
    await expect(table).toHaveCount(1);
    const heads = table.locator("thead th");
    await expect(heads).toHaveCount(6);
    for (const th of await heads.all()) {
      await expect(th).toHaveAttribute("scope", "col");
    }
    await expect(table.locator("tbody tr")).toHaveCount(3);
    // 문서 폭은 화면을 넘지 않는다
    const docOver = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(docOver).toBeLessThanOrEqual(0);
    // 표를 감싼 상자만 가로로 스크롤된다
    const wrap = table.locator("xpath=ancestor::div[1]");
    const info = await wrap.evaluate((el) => ({
      scrolls: el.scrollWidth > el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(info.overflowX).toBe("auto");
    expect(info.scrolls).toBe(true);
    // 방침 3번 표의 굵은 글씨가 칸 안에서 굵게
    await expect(
      main(page).locator("td strong", { hasText: "회원탈퇴 때까지." }),
    ).toBeVisible();
  });

  test("운영자 줄: 글자 = operatorLine(), 번호가 든 마디는 줄바꿈 금지 · 긴 주소 마디만 줄바꿈 허용, 화면 밖으로 안 잘린다 (100%)", async ({
    page,
  }) => {
    for (const path of ["/terms", "/privacy"]) {
      await open(page, path);
      const line = page.getByTestId("legal-operator");
      await expect(line).toBeVisible();
      const txt = (await line.innerText()).replace(/\s+/g, " ").trim();
      expect(txt).toBe(OPERATOR_LINE);
      const nowrap = await line
        .locator("span")
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).whiteSpace));
      // 마디 다섯: 회사 · 대표 · 사업자등록번호 + 번호 · 주소 · 전화
      expect(nowrap).toHaveLength(5);
      expect(nowrap.filter((w) => w === "nowrap")).toHaveLength(4);
      expect(nowrap[3]).toBe("normal"); // 주소 마디만 줄바꿈 허용(390 폭 본문보다 길다)
      // 줄 전체가 화면 안 — 잘리지 않는다
      const fit = await line.evaluate((el) => ({
        sw: el.scrollWidth,
        cw: el.clientWidth,
        right: el.getBoundingClientRect().right,
      }));
      expect(fit.sw).toBeLessThanOrEqual(fit.cw);
      expect(fit.right).toBeLessThanOrEqual(390);
    }
  });

  test("150%에서도 가로로 넘치지 않고 제목이 잘리지 않는다", async ({
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
    for (const path of ["/terms", "/privacy"]) {
      await open(page, path);
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--fz"),
        ),
      ).toBe("1.5");
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(over, path).toBeLessThanOrEqual(0);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main h2, main h3, main p"))
          .filter((el) => !el.closest(".sr-only"))
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el as HTMLElement).innerText.slice(0, 20)),
      );
      expect(clipped, `${path} 글자 잘림`).toEqual([]);
    }
    await context.close();
  });

  test("다크 모드: 배지와 표 선이 바탕과 구분된다", async ({ browser }) => {
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
    await open(page, "/privacy");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const badge = main(page).getByText("예시 글", { exact: true });
    const colors = await badge.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, fg: s.color };
    });
    expect(colors.bg).not.toBe(colors.fg);
    expect(colors.bg).not.toBe("rgba(0, 0, 0, 0)"); // 배지에 바탕이 있다
    const line = main(page)
      .locator("table")
      .first()
      .locator("tbody td")
      .first();
    const border = await line.evaluate((el) => {
      const s = getComputedStyle(el);
      return { w: parseFloat(s.borderBottomWidth), c: s.borderBottomColor };
    });
    expect(border.w).toBeGreaterThan(0);
    expect(border.c).not.toBe("rgba(0, 0, 0, 0)");
    await context.close();
  });
});
