import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 휴대폰 동의 화면 (이슈 #191, 결정 0065) — 스위치 "켬" 서버(3101). 꽉 찬 화면 · 낮은 화면 390×667 · 글씨 150%.
// 실제 손가락 · 홈 막대는 이 시험으로 못 본다(실기 확인은 O3 — 스위치가 꺼져 있어 운영에서는 볼 것이 없다).

test.describe.configure({ mode: "serial" });
test.use({ baseURL: "http://localhost:3101" });

const FAKE = "http://127.0.0.1:54321/__fake";
const NEXT = "/water?st=105&crop=apple";

const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const consentDialog = (page: Page) =>
  page.getByRole("dialog", { name: "CropMon을 시작하려면 동의가 필요해요" });
const agreeAll = (page: Page) =>
  page.getByRole("button", { name: "모두 동의하고 시작하기" });

async function openConsent(page: Page, request: APIRequestContext) {
  await scenario(request, { consentMode: "needed", sameUser: true });
  await page.goto(
    `/auth/login?provider=kakao&next=${encodeURIComponent(NEXT)}`,
  );
  await expect(consentDialog(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** 큰 버튼이 화면 안에 완전히 보이고(스크롤 없이), 위에서 가려지지 않는다. */
async function expectBigButtonVisible(page: Page) {
  const box = (await agreeAll(page).boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.height).toBeGreaterThanOrEqual(44 - 0.5);
  // 가장 위에 보이는 요소가 이 버튼(안쪽)이다 — 탭바나 다른 겹침이 덮지 않는다
  const top = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(top).toContain("동의하고 시작하기");
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test("휴대폰: 꽉 찬 화면 — 탭바 · 맥락 바 · 도깨비가 보이지 않고 닫는 단추가 없다", async ({
  page,
  request,
}) => {
  await openConsent(page, request);
  const dialog = consentDialog(page);
  const box = (await dialog.boundingBox())!;
  const { width, height } = page.viewportSize()!;
  expect(box.x).toBeCloseTo(0, 0);
  expect(box.y).toBeCloseTo(0, 0);
  expect(box.width).toBeCloseTo(width, 0);
  expect(box.height).toBeCloseTo(height, 0);
  // 덮인 화면의 탭바 · 맥락 바는 눌러지지 않는다(맨 위 요소가 동의 화면)
  const covered = await page.evaluate(() => {
    const h = window.innerHeight;
    return [
      document.elementFromPoint(40, h - 20),
      document.elementFromPoint(40, 20),
    ].map((el) => !!el?.closest("[role='dialog']"));
  });
  expect(covered).toEqual([true, true]);
  await expect(page.getByRole("button", { name: "닫기" })).toHaveCount(0);
});

test("낮은 화면 390×667: 큰 버튼이 스크롤 없이 보인다", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openConsent(page, request);
  await expectBigButtonVisible(page);
  // 화면 전체가 넘치지 않는다
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test.describe("글씨 150%", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "cropmon-font-scale",
          JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
        );
      } catch {
        // 저장소가 막힌 환경은 그대로 둔다
      }
    });
  });

  test("큰 버튼이 잘리지 않고 닿을 수 있다 (스크롤하면 끝까지) · 가로로 안 넘친다", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await openConsent(page, request);
    const big = agreeAll(page);
    await big.scrollIntoViewIfNeeded();
    const box = (await big.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44 - 0.5);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
    const top = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(top).toContain("동의하고 시작하기");
    const overflow = await page.evaluate(() => ({
      doc:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      dialog: (() => {
        const el = document.querySelector("[role='dialog']") as HTMLElement;
        return el.scrollWidth - el.clientWidth;
      })(),
    }));
    expect(overflow.doc).toBeLessThanOrEqual(1);
    expect(overflow.dialog).toBeLessThanOrEqual(1);
  });

  test('"수집·이용"은 가운데서 끊기지 않는다 (한 덩어리)', async ({
    page,
    request,
  }) => {
    await openConsent(page, request);
    const label = consentDialog(page).getByText(
      /개인정보 수집\W*·\W*이용 안내 확인/,
    );
    const text = await label.first().textContent();
    // 가운뎃점 앞뒤에 줄바꿈 금지 글자(U+2060)가 있다 — 150%에서 가운데서 끊기지 않는다
    expect(text).toContain("수집⁠·⁠이용");
  });
});

test("동의하고 시작하기를 누르면 보던 화면으로 돌아와 알림이 뜬다 (탭 대상 44 이상)", async ({
  page,
  request,
}) => {
  await openConsent(page, request);
  const leave = consentDialog(page).getByRole("button", {
    name: "동의하지 않고 나가기",
  });
  expect((await leave.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 0.5);
  await agreeAll(page).click();
  await expect(page.getByTestId("toast")).toHaveText("로그인했어요");
  await expect
    .poll(() => {
      const u = new URL(page.url());
      return `${u.pathname}${u.search}`;
    })
    .toBe(NEXT);
});
