import { expect, test } from "./fixtures";

// 약관 · 개인정보처리방침 — 데스크톱 1440과 공개 주소 확인 (이슈 #173, 결정 0057).

test.describe("데스크톱 1440", () => {
  test.skip(({ isMobile }) => isMobile);

  test("바닥글: '약관' → /terms, '개인정보처리방침'(굵게) → /privacy, 공지 · 문의 · FAQ 는 글자만", async ({
    page,
  }) => {
    await page.goto("/?st=101&crop=apple");
    const list = page.getByRole("contentinfo").getByTestId("footer-notices");
    const terms = list.getByRole("link", { name: "약관", exact: true });
    const privacy = list.getByRole("link", {
      name: "개인정보처리방침",
      exact: true,
    });
    await expect(terms).toHaveAttribute("href", "/terms");
    await expect(privacy).toHaveAttribute("href", "/privacy");
    expect(
      Number(await privacy.evaluate((el) => getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(700);
    expect(
      Number(await terms.evaluate((el) => getComputedStyle(el).fontWeight)),
    ).toBeLessThan(600);
    // 나머지 셋은 아직 글자만
    await expect(list.getByRole("link")).toHaveCount(2);
    await terms.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(
      "CropMon 이용약관",
    );
  });

  test("두 쪽의 <title>", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveTitle("CropMon · 이용약관");
    await page.goto("/privacy");
    await expect(page).toHaveTitle("CropMon · 개인정보처리방침");
  });

  test("본문 폭은 읽기 좋게 제한된다(720px 안팎)", async ({ page }) => {
    await page.goto("/terms");
    const w = await page
      .getByTestId("legal-body")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(720.5);
    expect(w).toBeGreaterThan(500);
  });

  test("데스크톱에서도 두 문서 바꾸기 · 예시 글 배지 · 운영자 줄이 있다", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page
        .getByRole("navigation", { name: "문서 바꾸기" })
        .getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("예시 글", { exact: true })).toBeVisible();
    await expect(page.getByTestId("legal-operator")).toBeVisible();
  });
});

test.describe("공개 주소 (로그인 · 브라우저 없이)", () => {
  for (const [path, marker] of [
    ["/terms", "제10조 (책임의 한계)"],
    ["/privacy", "7. 개인정보의 국외 이전"],
  ] as const) {
    test(`${path}: 200 이고 본문이 서버가 보낸 HTML 에 이미 들어 있다 (검색 로봇용)`, async ({
      request,
    }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(marker);
      expect(html).toContain("예시 글");
      expect(html).not.toContain("<!--  본문");
    });
  }
});
