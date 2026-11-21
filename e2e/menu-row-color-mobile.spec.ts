import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 메뉴 줄 글자 색 (이슈 #200) — 스위치 "켬" 서버(3101), 휴대폰 390×844, 가짜 Supabase.
// 시안 v0.4.6 은 더보기 · 내 계정 시트의 모든 줄 글자가 보통 글자색(--color-ink)이고 아이콘만 초록이다.
// 링크 줄(<a>)이 기본 링크 색(라이트 진초록 · 다크 연두)으로 나와 버튼 줄(흰색)과 갈리면 안 된다.
// 가짜 로그인 시나리오는 전역 값이라 serial.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const NEXT = "/water?st=105&crop=apple";

/** 줄 = 이름 칸(span.flex-1)이 바로 아래 있는 목록 항목의 링크 · 버튼. */
const ROW_SELECTOR = "ul > li > :is(a, button):has(> span.flex-1)";

const SHEET_NAMES = [
  "알림",
  "농장 설정",
  "작물 설정",
  "화면 구성",
  "글씨 크기",
  "다크 모드",
  "회원 정보",
  "알림 설정",
];
const MORE_NAMES = [
  "종합",
  "공지",
  "문의",
  "FAQ",
  "약관",
  "화면 구성",
  "글씨 크기",
  "다크 모드",
];

type Row = { name: string; color: string };

const rowColors = (scope: Locator): Promise<Row[]> =>
  scope.locator(ROW_SELECTOR).evaluateAll((rows) =>
    rows.map((row) => {
      const name = row.querySelector(":scope > span.flex-1") as HTMLElement;
      return {
        name: (name.textContent ?? "").trim(),
        color: getComputedStyle(name).color,
      };
    }),
  );

/** 토큰(`--color-ink` 등)을 쓰는 요소를 만들어 계산 색을 읽는다 — 토큰 값이 바뀌어도 시험이 따라간다. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);

const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });

async function openAccountSheet(page: Page, request: APIRequestContext) {
  await scenario(request, { sameUser: true });
  await page.goto(
    `/auth/login?provider=kakao&next=${encodeURIComponent(NEXT)}`,
  );
  await page.waitForURL(/\/water\?/);
  await page.waitForLoadState("networkidle");
  const profile = page
    .locator("header")
    .getByRole("button", { name: "내 계정" });
  await expect(profile).toBeVisible();
  await profile.click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`${scheme === "dark" ? "다크" : "라이트"} 모드`, () => {
    test.use({ colorScheme: scheme });

    test("내 계정 시트: 줄 이름 글자 색 8줄이 모두 같고 보통 글자색(--color-ink)이다", async ({
      page,
      request,
    }, testInfo) => {
      const dialog = await openAccountSheet(page, request);
      const rows = await rowColors(dialog);
      expect(rows.map((r) => r.name)).toEqual(SHEET_NAMES);

      const ink = await tokenColor(page, "--color-ink");
      expect(new Set(rows.map((r) => r.color)).size).toBe(1);
      for (const r of rows) expect(r.color, r.name).toBe(ink);
      if (scheme === "dark") {
        // 시험이 우연히 통과하지 않게: 다크에서 기본 링크 색(연두)과는 다른 색이어야 한다
        expect(ink).not.toBe(await tokenColor(page, "--color-brand-ink"));
      }

      await page.screenshot({
        path: testInfo.outputPath(`account-sheet-${scheme}.png`),
      });
    });

    test("더보기(비회원): 줄 이름 글자 색이 모두 같고 보통 글자색이다 — 링크 줄에 올려 놓아도 그대로", async ({
      page,
    }, testInfo) => {
      await page.goto("/more?st=101&crop=apple");
      await page.waitForLoadState("networkidle");
      const rows = await rowColors(page.locator("main"));
      const names = rows.map((r) => r.name);
      for (const name of MORE_NAMES) expect(names, name).toContain(name);
      expect(rows.length).toBeGreaterThanOrEqual(MORE_NAMES.length);

      const ink = await tokenColor(page, "--color-ink");
      expect(new Set(rows.map((r) => r.color)).size).toBe(1);
      for (const r of rows) expect(r.color, r.name).toBe(ink);
      if (scheme === "dark") {
        expect(ink).not.toBe(await tokenColor(page, "--color-brand-ink"));
      }

      // 기본 층 a:hover(초록)가 메뉴 줄에는 걸리지 않는다 (시안의 줄은 버튼이라 호버로 색이 바뀌지 않는다)
      const terms = page.locator("main").locator(ROW_SELECTOR, {
        hasText: "약관",
      });
      await terms.hover();
      const hovered = await terms
        .locator(":scope > span.flex-1")
        .evaluate((el) => getComputedStyle(el).color);
      expect(hovered).toBe(ink);

      await page.mouse.move(0, 0);
      await page.screenshot({
        path: testInfo.outputPath(`more-${scheme}.png`),
      });
    });
  });
}
