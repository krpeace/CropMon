import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 휴대폰 화면 설정 저장 시트 (이슈 #193, 결정 0066) — 스위치 "켬" 서버(3101), 390. 아래에서 올라오는 BottomSheet(결정 0050).
// 실제 손가락 · 홈 막대는 이 시험으로 못 본다(실기 확인은 O3 — 스위치가 꺼져 있어 운영에서는 볼 것이 없다).

test.describe.configure({ mode: "serial" });
test.use({ baseURL: "http://localhost:3101" });

const FAKE = "http://127.0.0.1:54321/__fake";
const NEXT = "/water?st=105&crop=apple";
const IDS = [
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
];
const SWAPPED = {
  v: 1,
  order: [
    "home",
    "temp",
    "water",
    ...IDS.filter((i) => !["home", "temp", "water"].includes(i)),
  ],
  off: [] as string[],
};

const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const sheet = (page: Page) =>
  page.getByRole("dialog", { name: "화면 구성을 계정에 저장할까요?" });

async function openSheet(page: Page, request: APIRequestContext) {
  await request.post(`${FAKE}/reset`);
  await scenario(request, { sameUser: true });
  await page.goto("/water?st=105");
  await page.evaluate(
    (m) => localStorage.setItem("cropmon-menus", JSON.stringify(m)),
    SWAPPED,
  );
  await page.goto(
    `/auth/login?provider=kakao&next=${encodeURIComponent(NEXT)}`,
  );
  await expect(sheet(page)).toBeVisible();
}

test("휴대폰: 아래에서 올라오는 시트(끌기 손잡이 있음) — 탭 미리보기와 두 단추가 보이고 탭 대상이 44 이상이다", async ({
  page,
  request,
}) => {
  await openSheet(page, request);
  await expect(page.getByTestId("sheet-grip")).toBeVisible();
  const s = sheet(page);
  await expect(s.getByTestId("tab-preview").locator("[data-tab]")).toHaveText([
    "종합",
    "온도",
    "물",
    "햇빛",
    "더보기",
  ]);
  const vh = page.viewportSize()!.height;
  await expect
    .poll(async () => {
      const b = (await s.boundingBox())!;
      return Math.round(b.y + b.height);
    })
    .toBe(vh);
  for (const name of ["저장하기", "기본 구성 쓰기"]) {
    const b = (await s.getByRole("button", { name }).boundingBox())!;
    expect(b.height, name).toBeGreaterThanOrEqual(44 - 0.5);
  }
});

test("휴대폰: [저장하기]가 계정에 저장하고 시트가 닫힌다", async ({
  page,
  request,
}) => {
  await openSheet(page, request);
  await sheet(page).getByRole("button", { name: "저장하기" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect
    .poll(async () => {
      const c = await (await request.get(`${FAKE}/calls`)).json();
      return Object.values(
        c.settings as Record<string, { layout?: { order: string[] } }>,
      )[0]?.layout?.order.slice(0, 3);
    })
    .toEqual(["home", "temp", "water"]);
});

test("휴대폰: 닫기로 닫으면 아무것도 안 바뀌고 쓰기도 없다", async ({
  page,
  request,
}) => {
  await openSheet(page, request);
  await sheet(page).getByRole("button", { name: "닫기" }).click();
  await expect(sheet(page)).toBeHidden();
  const c = await (await request.get(`${FAKE}/calls`)).json();
  expect(c.settingsWrites).toBe(0);
});

test.describe("글씨 150%", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "cropmon-font-scale",
          JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
        );
      } catch {}
    });
  });

  test("시트가 가로로 넘치지 않고 두 단추에 닿을 수 있다", async ({
    page,
    request,
  }) => {
    await openSheet(page, request);
    const s = sheet(page);
    for (const name of ["저장하기", "기본 구성 쓰기"]) {
      const btn = s.getByRole("button", { name });
      await btn.scrollIntoViewIfNeeded();
      const b = (await btn.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390 + 0.5);
    }
    const overflow = await s.evaluate((el) => ({
      own: el.scrollWidth - el.clientWidth,
      doc:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    expect(overflow.own).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
  });
});
