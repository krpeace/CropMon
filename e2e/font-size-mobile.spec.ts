import { expect, test, type Page } from "./fixtures";

// 글씨 크기 화면 /font-size (이슈 #168, 결정 0055). 휴대폰(mobile 프로젝트 390×844).
// 고르는 즉시 <html> 의 --fz 가 바뀌고 기기에 저장되며, 새로고침해도 첫 그리기부터 그 값이다.
// 실제 휴대폰 설정 따르기(갤럭시 크롬 · 아이폰 사파리 · 카카오톡 인앱)는 이 시험으로 못 본다(PR 본문의 "휴대폰에서 확인할 목록").

const fz = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--fz").trim(),
  );

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const slider = (page: Page) => page.getByRole("slider", { name: "글씨 크기" });
const step = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const follow = (page: Page) =>
  page.getByRole("switch", { name: "휴대폰 설정 따르기" });

test.describe("글씨 크기 화면 (휴대폰)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("더보기 → '글씨 크기' → 맥락 바에 뒤로 화살표 + 제목", async ({
    page,
  }) => {
    await open(page, "/more?st=101&crop=apple");
    // 더보기 줄에는 지금 단계 이름이 보인다
    const row = page.getByRole("link", { name: /^글씨 크기/ });
    await expect(row).toContainText("보통");
    await expect(row).not.toContainText("준비 중");
    await row.click();
    await expect(page).toHaveURL(/\/font-size/);
    await expect(page.getByTestId("context-title")).toHaveText("글씨 크기");
    await expect(page.getByRole("button", { name: "뒤로" })).toBeVisible();
    await page.getByRole("button", { name: "뒤로" }).click();
    await expect(page).toHaveURL(/\/more/);
  });

  test("'아주 크게' → --fz 1.5 · '지금 글씨 크기 아주 크게 150%' · 새로고침해도 1.5 (첫 그리기부터)", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    await expect(page.getByTestId("font-now")).toHaveText(
      "지금 글씨 크기 보통 100%",
    );
    expect(await fz(page)).toBe("1");
    await step(page, "아주 크게").click();
    await expect.poll(() => fz(page)).toBe("1.5");
    await expect(page.getByTestId("font-now")).toHaveText(
      "지금 글씨 크기 아주 크게 150%",
    );
    await expect(step(page, "아주 크게")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 새로고침: 화면 내용(body)이 처음 생기는 순간에 이미 1.5 인지(100% → 150% 로 튀지 않음)
    await page.addInitScript(() => {
      const w = window as unknown as { __fzFirst?: string };
      const mo = new MutationObserver(() => {
        if (document.body && w.__fzFirst === undefined) {
          w.__fzFirst = document.documentElement.style
            .getPropertyValue("--fz")
            .trim();
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => (window as unknown as { __fzFirst?: string }).__fzFirst,
      ),
    ).toBe("1.5");
    expect(await fz(page)).toBe("1.5");
    await expect(page.getByTestId("font-now")).toHaveText(
      "지금 글씨 크기 아주 크게 150%",
    );
    // 다른 화면에서도 그대로
    await open(page, "/water?st=101&crop=apple");
    expect(await fz(page)).toBe("1.5");
  });

  test("다섯 단계가 모두 --fz 값과 이름 · 퍼센트로 이어진다", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    const table: [string, string, string][] = [
      ["작게", "0.9", "90%"],
      ["보통", "1", "100%"],
      ["크게", "1.15", "115%"],
      ["더 크게", "1.3", "130%"],
      ["아주 크게", "1.5", "150%"],
    ];
    for (const [name, value, pct] of table) {
      await step(page, name).click();
      await expect.poll(() => fz(page), name).toBe(value);
      await expect(page.getByTestId("font-now")).toHaveText(
        `지금 글씨 크기 ${name} ${pct}`,
      );
      for (const b of await page
        .getByTestId("font-steps")
        .getByRole("button")
        .all()) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("슬라이더: 키보드 →/← 로 단계가 바뀌고 읽어 주는 글자가 있다", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    const s = slider(page);
    await expect(s).toHaveAttribute("aria-valuetext", "글씨 크기, 보통 100%");
    await s.focus();
    await s.press("ArrowRight");
    await expect.poll(() => fz(page)).toBe("1.15");
    await expect(s).toHaveAttribute("aria-valuetext", "글씨 크기, 크게 115%");
    await s.press("ArrowRight");
    await expect.poll(() => fz(page)).toBe("1.3");
    await s.press("ArrowLeft");
    await s.press("ArrowLeft");
    await s.press("ArrowLeft");
    await expect.poll(() => fz(page)).toBe("0.9");
    // 5칸뿐 — 끝에서 더 가지 않는다
    await s.press("ArrowLeft");
    expect(await fz(page)).toBe("0.9");
  });

  test("작은 '가' · 큰 '가'는 150%에서도 글자 크기가 그대로(15 · 28)", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    await step(page, "아주 크게").click();
    await expect.poll(() => fz(page)).toBe("1.5");
    const size = (id: string) =>
      page.getByTestId(id).evaluate((el) => getComputedStyle(el).fontSize);
    expect(await size("ga-small")).toBe("15px");
    expect(await size("ga-large")).toBe("28px");
    // 보통에서도 같다
    await step(page, "보통").click();
    await expect.poll(() => fz(page)).toBe("1");
    expect(await size("ga-small")).toBe("15px");
    expect(await size("ga-large")).toBe("28px");
  });

  test("미리보기 카드: '예시 값' 표시가 있고, 글씨 크기를 바꾸면 이 카드도 바로 바뀐다", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    const card = page.getByTestId("font-preview");
    await expect(card).toContainText("미리보기 · 예시 값");
    const size = () =>
      card
        .getByText("오늘은 괜찮아요, 내일 물 주세요")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const before = await size();
    await step(page, "아주 크게").click();
    await expect.poll(size).toBeGreaterThan(before * 1.4);
  });

  test("'휴대폰 설정 따르기': 켜면 슬라이더 · 단계 칸이 흐려지고(0.4) 누를 수 없고, 끄면 돌아온다", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    const box = page.getByTestId("font-controls");
    await expect(follow(page)).toHaveAttribute("aria-checked", "false");
    expect(await box.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await follow(page).click();
    await expect(follow(page)).toHaveAttribute("aria-checked", "true");
    expect(await box.evaluate((el) => getComputedStyle(el).opacity)).toBe(
      "0.4",
    );
    await expect(slider(page)).toBeDisabled();
    await expect(step(page, "크게")).toBeDisabled();
    // 새로고침해도 켜진 채
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(follow(page)).toHaveAttribute("aria-checked", "true");
    await follow(page).click();
    await expect(follow(page)).toHaveAttribute("aria-checked", "false");
    expect(await box.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await expect(slider(page)).toBeEnabled();
    await expect(step(page, "크게")).toBeEnabled();
  });

  test("'휴대폰 설정 따르기': 브라우저 기본 글자 크기를 24px 로 바꾸면 '아주 크게'가 된다 (크롬 시험용 CDP)", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24 } });
    await open(page, "/font-size?st=101&crop=apple");
    await follow(page).click();
    await expect.poll(() => fz(page)).toBe("1.5");
    await expect(page.getByTestId("font-now")).toHaveText(
      "지금 글씨 크기 아주 크게 150%",
    );
    // 새로고침: 머리 스크립트가 같은 측정으로 첫 그리기부터 1.5
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await fz(page)).toBe("1.5");
  });
});
