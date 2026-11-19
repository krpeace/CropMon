import { expect, test, type Page } from "./fixtures";

// 종합 맨 위 "글씨 크기 알리기 카드" (이슈 #168, 결정 0055). 휴대폰 390. 이 파일만 카드를 켠다(다른 시험은 기본으로 닫음).
// 새 시험마다 새 브라우저 상태(저장 값 없음)에서 시작한다.

test.use({ showNotice: true });

const TEXT = "글씨가 작으면 크게 볼 수 있어요";
const card = (page: Page) => page.locator('[data-notice="fontSize"]');
const HOME = "/?st=101&crop=apple";

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.describe("알리기 카드 (휴대폰)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("처음 종합에서 보이고, 제목 위에 있다", async ({ page }) => {
    await open(page, HOME);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText(TEXT);
    await expect(
      card(page).getByRole("link", { name: "글씨 크기" }),
    ).toBeVisible();
    await expect(
      card(page).getByRole("button", { name: "닫기" }),
    ).toBeVisible();
    const cardBox = (await card(page).boundingBox())!;
    const titleBox = (await page
      .getByRole("heading", { level: 1 })
      .boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(titleBox.y + 0.5);
    // 닫기 눌림 영역 44 이상
    const x = (await card(page)
      .getByRole("button", { name: "닫기" })
      .boundingBox())!;
    expect(x.width).toBeGreaterThanOrEqual(44);
    expect(x.height).toBeGreaterThanOrEqual(44);
  });

  test("× 를 누르면 사라지고, 새로고침해도 다시 안 나온다 (닫은 표시는 첫 그리기부터)", async ({
    page,
  }) => {
    await open(page, HOME);
    await card(page).getByRole("button", { name: "닫기" }).click();
    await expect(card(page)).toHaveCount(0);

    // 새로고침: 화면 내용(body)이 처음 생기는 순간에 이미 닫은 표시가 달려 있는지("보였다 사라짐" 없음)
    await page.addInitScript(() => {
      const w = window as unknown as { __closedFirst?: string | null };
      const mo = new MutationObserver(() => {
        if (document.body && w.__closedFirst === undefined) {
          w.__closedFirst =
            document.documentElement.getAttribute("data-notice-closed");
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => (window as unknown as { __closedFirst?: string }).__closedFirst,
      ),
    ).toBe("fontSize");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByText(TEXT)).toHaveCount(0);
  });

  test("카드 버튼 → /font-size → 종합으로 돌아오면 안 보인다", async ({
    page,
  }) => {
    await open(page, HOME);
    await card(page).getByRole("link", { name: "글씨 크기" }).click();
    await expect(page).toHaveURL(/\/font-size/);
    await expect(page.getByTestId("font-now")).toBeVisible();
    await open(page, HOME);
    await expect(card(page)).toHaveCount(0);
  });

  test("/font-size 에 주소로 한 번 들어갔다 와도 다시 안 나온다", async ({
    page,
  }) => {
    await open(page, "/font-size?st=101&crop=apple");
    await expect(page.getByTestId("font-now")).toBeVisible();
    await open(page, HOME);
    await expect(card(page)).toHaveCount(0);
  });

  test("130% 이상에서는 버튼이 글자 아래 줄로 내려간다 (100% · 115%에서는 한 줄)", async ({
    page,
  }) => {
    await open(page, HOME);
    const setFz = (v: number) =>
      page.evaluate(
        (n) => document.documentElement.style.setProperty("--fz", String(n)),
        v,
      );
    const boxes = async () => {
      const text = (await page.getByTestId("notice-text").boundingBox())!;
      const btn = (await card(page)
        .getByRole("link", { name: "글씨 크기" })
        .boundingBox())!;
      return { textBottom: text.y + text.height, btnTop: btn.y };
    };
    for (const v of [1, 1.15]) {
      await setFz(v);
      await expect
        .poll(async () => {
          const b = await boxes();
          return b.btnTop < b.textBottom - 1;
        }, `fz ${v}`)
        .toBe(true);
    }
    for (const v of [1.3, 1.5]) {
      await setFz(v);
      await expect
        .poll(async () => {
          const b = await boxes();
          return b.btnTop >= b.textBottom - 0.5;
        }, `fz ${v}`)
        .toBe(true);
    }
    // 가로로 넘치지 않는다
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
