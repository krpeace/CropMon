import { expect, test, type Page } from "@playwright/test";

// 누르는 곳 44px 이상 (시안 규칙). 보이는 크기가 아니라 "실제로 눌리는 영역"을 잰다:
// 요소 가운데에서 위아래(너비가 44 미만이면 좌우도) 21px 떨어진 점을 누르면 그 요소가 눌려야 한다.
// 휴대폰 390×844 (playwright.config 의 mobile 프로젝트). 가짜 Supabase 자료를 읽는다.

/** 정말 어쩔 수 없는 요소만 이유와 함께 적는다. 글자(앞부분)로 찾는다. 기본은 빈 목록. */
const EXCEPTIONS: { text: string; reason: string }[] = [];

const PAGES = [
  "/?st=101&crop=apple",
  "/water?st=101&crop=apple",
  "/water?st=101&crop=common",
  "/temperature?st=101&crop=apple",
  "/sunlight?st=101&crop=apple",
  "/soil?st=101&crop=apple",
  "/my-farm?st=101&crop=apple",
];

/** 눌리는 영역이 44 에 못 미치는 보이는 요소의 이름 목록. */
async function smallTargets(
  page: Page,
  rootSelector = "body",
): Promise<string[]> {
  const found = await page.evaluate((rootSel) => {
    const SEL = "a,button,[role=tab]";
    const MIN = 44;
    const half = MIN / 2 - 1; // 21
    const out: string[] = [];
    const root = document.querySelector(rootSel)!;
    for (const el of root.querySelectorAll<HTMLElement>(SEL)) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.getClientRects().length === 0) {
        continue;
      }
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const points = [
        [cx, cy - half],
        [cx, cy + half],
      ];
      if (r.width < MIN) points.push([cx - half, cy], [cx + half, cy]);
      const hit = points.every(([x, y]) => {
        const top = document.elementFromPoint(x, y);
        return top?.closest(SEL) === el;
      });
      if (!hit) {
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 30);
        out.push(
          `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
      }
    }
    return out;
  }, rootSelector);
  return found.filter((f) => !EXCEPTIONS.some((e) => f.includes(`"${e.text}`)));
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

for (const path of PAGES) {
  test(`누르는 곳 44px 이상: ${path}`, async ({ page }) => {
    await open(page, path);
    expect(await smallTargets(page)).toEqual([]);
  });
}

test("누르는 곳 44px 이상: 작물 공통 '계산에 쓴 토양' 목록을 연 상태", async ({
  page,
}) => {
  await open(page, "/water?st=101&crop=common");
  await page.getByRole("button", { name: /계산에 쓴 토양/ }).click();
  await expect(
    page.getByRole("listbox", { name: "토양 고르기" }),
  ).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
});

// 작물·지역 고르기 판: 판 안의 버튼만 잰다 (뒤 화면은 덮개에 덮여 눌리지 않는다).
const DIALOG = '[role="dialog"]';

test("누르는 곳 44px 이상: 작물 고르기 판을 연 상태", async ({ page }) => {
  await open(page, "/water?st=101&crop=apple");
  await page
    .getByRole("group", { name: "작물" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "작물 고르기" })).toBeVisible();
  expect(await smallTargets(page, DIALOG)).toEqual([]);
});

test("누르는 곳 44px 이상: 지역 고르기 판을 연 상태", async ({ page }) => {
  await open(page, "/water?st=101&crop=apple");
  await page
    .getByRole("group", { name: "지역" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "지역 고르기" })).toBeVisible();
  expect(await smallTargets(page, DIALOG)).toEqual([]);
});

test("누르는 곳 44px 이상: 지역 판에 검색어를 넣어 '지우기'가 보이는 상태", async ({
  page,
}) => {
  await open(page, "/water?st=101&crop=apple");
  await page
    .getByRole("group", { name: "지역" })
    .getByRole("button")
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "지역 고르기" });
  await dialog.getByRole("searchbox", { name: "지역 검색" }).fill("홍");
  await expect(dialog.getByRole("button", { name: "지우기" })).toBeVisible();
  expect(await smallTargets(page, DIALOG)).toEqual([]);
});
