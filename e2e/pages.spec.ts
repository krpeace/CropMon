import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "오늘 춘천 사과는 어떤가요?" },
  { path: "/temperature", heading: "온도" },
  { path: "/sunlight", heading: "햇빛" },
  { path: "/water", heading: "물" },
  { path: "/soil", heading: "토양" },
  { path: "/market", heading: "도매시장" },
  { path: "/my-farm", heading: "내 농장" },
];

for (const { path, heading } of PAGES) {
  test(`${path} 가 열린다`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("navigation", { name: "메뉴" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(
      "자료 출처: 기상청",
    );
  });
}

test("종합이 아닌 쪽은 아래에 자료·발표·갱신을 보여 준다", async ({ page }) => {
  await page.goto("/soil");
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("자료");
  await expect(meta).toContainText("발표");
  await expect(meta).toContainText("갱신");
  await expect(meta).toContainText("자료 없음");
});

// 토양·도매시장 "준비 중" 본문 (이슈 #27, 시안 sSoon). 글은 시안 그대로, DB 읽기는 없다.
const soon = (page: Page) => page.getByRole("region", { name: "준비 중 안내" });

test("토양: 준비 중 본문 — 말풍선·캐릭터·질문·항목 4개·쓸 자료", async ({
  page,
}) => {
  await page.goto("/soil?st=101&crop=apple");
  await expect(
    page.getByText("준비 중", { exact: true }).first(),
  ).toBeVisible();

  const body = soon(page);
  await expect(body).toContainText("준비하고 있어요");
  await expect(body.locator("img").first()).toBeVisible();
  await expect(body).toContainText("이 메뉴가 답할 질문");
  await expect(body).toContainText("“우리 밭은 어떤 흙이고 양분은 어떤가?”");

  const items = body.getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toHaveText("1우리 밭 흙의 종류(토성)와 물 빠짐");
  await expect(items.nth(3)).toHaveText("4물 판정에 내 밭 토성을 바로 반영");

  await expect(body).toContainText("쓸 자료");
  await expect(body).toContainText("농촌진흥청 흙토람 (토양 정보)");
  await expect(body).toContainText("지금은 자료 없음");

  // 제목 옆 꼬리표와 자료 상자는 지금처럼
  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("농촌진흥청 흙토람 · 자료 없음");
});

test("도매시장: 같은 모양에 글만 다르고, 사과/배추에 따라 ①이 바뀐다", async ({
  page,
}) => {
  await page.goto("/market?st=101&crop=apple");
  const body = soon(page);
  await expect(body).toContainText("“지금 얼마에 팔리고, 앞으로 값은?”");
  await expect(body.getByRole("listitem").nth(0)).toContainText(
    "오늘 사과 도매 가격",
  );
  await expect(body).toContainText(
    "aT 농산물유통정보 · 한국농촌경제연구원(KREI) 농업관측",
  );
  await expect(body).toContainText("지금은 자료 없음");

  await page
    .getByRole("group", { name: "작물" })
    .getByRole("link", { name: "배추" })
    .click();
  await expect(page).toHaveURL(/\/market\?st=101&crop=cabbage$/);
  await expect(soon(page).getByRole("listitem").nth(0)).toContainText(
    "오늘 배추 도매 가격",
  );
});

test("그동안 물 판정 보기: 물 화면으로 가고 지역·작물이 남는다", async ({
  page,
}) => {
  await page.goto("/soil?st=136&crop=cabbage");
  await soon(page).getByRole("link", { name: "그동안 물 판정 보기" }).click();
  await expect(page).toHaveURL(/\/water\?st=136&crop=cabbage$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("물");
});

test("준비 중 본문: 1280 폭에서는 두 칸이 나란히", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/soil?st=101&crop=apple");
  const left = await page
    .getByRole("region", { name: "열리면 보여 줄 것" })
    .boundingBox();
  const right = await page
    .getByRole("region", { name: "쓸 자료" })
    .boundingBox();
  expect(left && right).toBeTruthy();
  // 같은 줄(위쪽이 거의 같고), 오른쪽 칸이 왼쪽 칸 오른쪽에 있다
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(4);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
});

test("준비 중 본문: 390 폭에서 두 칸이 한 줄로 쌓이고 옆으로 넘치지 않는다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/soil", "/market"]) {
    await page.goto(`${path}?st=101&crop=apple`);
    await expect(soon(page)).toBeVisible();
    const left = await page
      .getByRole("region", { name: "열리면 보여 줄 것" })
      .boundingBox();
    const right = await page
      .getByRole("region", { name: "쓸 자료" })
      .boundingBox();
    expect(right!.y).toBeGreaterThan(left!.y + left!.height - 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

// 파비콘과 홈 화면 아이콘 (이슈 #29)
test("파비콘과 홈 화면 아이콘이 연결되어 있고 이미지로 응답한다", async ({
  page,
  request,
}) => {
  await page.goto("/");

  // <head> 에 rel="icon" 연결이 있고(favicon.ico 와 icon.png), rel="apple-touch-icon" 연결이 있다.
  await expect(page.locator('link[rel="icon"]')).toHaveCount(2);

  const favicon = page.locator('link[rel="icon"][href*="favicon.ico"]');
  const iconPng = page.locator('link[rel="icon"]:not([href*="favicon.ico"])');
  const appleIcon = page.locator('link[rel="apple-touch-icon"]');

  await expect(favicon).toHaveCount(1);
  await expect(iconPng).toHaveCount(1);
  await expect(appleIcon).toHaveCount(1);

  const faviconHref = await favicon.getAttribute("href");
  const iconHref = await iconPng.getAttribute("href");
  const appleHref = await appleIcon.getAttribute("href");

  expect(faviconHref).toBeTruthy();
  expect(iconHref).toBeTruthy();
  expect(appleHref).toBeTruthy();

  // 각 주소로 요청하면 200 이고 content-type 이 이미지다
  for (const href of [faviconHref!, iconHref!, appleHref!]) {
    const res = await request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  }
});

test("다른 쪽(/water)에서도 같은 연결이 나온다", async ({ page }) => {
  await page.goto("/water");

  await expect(page.locator('link[rel="icon"]')).toHaveCount(2);
  await expect(
    page.locator('link[rel="icon"][href*="favicon.ico"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('link[rel="icon"]:not([href*="favicon.ico"])'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
