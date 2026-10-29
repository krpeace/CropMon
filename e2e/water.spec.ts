import { expect, test, type Page } from "@playwright/test";

// 가짜 Supabase(e2e/fake-supabase.mjs) 자료로 본다. 춘천(101)은 자료가 있고, 태백(216)은 오류를 돌려준다.

const now = (page: Page) =>
  page.getByRole("region", { name: "지금 토양 상태" });
const outlook = (page: Page) =>
  page.getByRole("region", { name: "앞으로 3일" });

test("물: 지금 상태·앞으로 3일·작기 돌아보기·자료 상자가 DB 값으로 보인다", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  await expect(now(page)).toContainText("① 지금 토양 상태");
  await expect(now(page)).toContainText("오늘은 괜찮아요, 내일 물 주세요");
  await expect(now(page)).toContainText("내일 관수 필요");
  await expect(now(page)).toContainText("부족한 물 51 mm / 관수 시작점 65 mm");
  await expect(now(page)).toContainText("관수 시작점까지 14 mm 남았어요");

  await expect(outlook(page)).toContainText("02시 예보 기준");
  await expect(outlook(page)).toContainText("관수 필요 예상일 내일");
  await expect(outlook(page)).toContainText(
    "권장 관수량 66 mm (공급 70 mm, 10a당 약 70톤)",
  );
  await expect(outlook(page)).toContainText("글피");
  await expect(outlook(page)).toContainText("참고");

  const season = page.getByRole("region", { name: /작기 돌아보기/ });
  await expect(season).toContainText("월별 요약");
  await expect(season.getByRole("row", { name: /^1월/ })).toContainText(
    "휴면기",
  );

  const meta = page.getByRole("region", { name: "자료 정보" });
  await expect(meta).toContainText("02시 단기예보");
  await expect(meta).toContainText("기상청 ASOS 춘천(101)");
});

test("물: 재배 방식을 바꾸면 주소창에 남고, 지역을 바꿔도 유지된다", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  const kc = page.getByRole("group", { name: "재배 방식" });
  await expect(
    kc.getByRole("link", { name: /초생 재배, 서리 지역/ }),
  ).toHaveAttribute("aria-current", "true");
  await kc.getByRole("link", { name: "청경 재배, 서리 지역" }).click();
  await expect(page).toHaveURL(/\/water\?st=101&crop=apple&kc=1$/);
  await expect(
    kc.getByRole("link", { name: "청경 재배, 서리 지역" }),
  ).toHaveAttribute("aria-current", "true");
  await page
    .getByRole("group", { name: "지역" })
    .getByRole("link", { name: "태백" })
    .click();
  await expect(page).toHaveURL(/\/water\?st=216&crop=apple&kc=1$/);
});

test("물: 전날로 가면 그날 관측값으로 보고, 오늘로 돌아온다", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  await page.getByRole("link", { name: "전날" }).click();
  await expect(page).toHaveURL(/&d=\d{4}-\d{2}-\d{2}$/);
  await expect(now(page)).toContainText("관측 물수지");
  await expect(outlook(page)).toContainText("다음날");
  await page.getByRole("link", { name: "오늘로" }).click();
  await expect(page).toHaveURL(/\/water\?st=101&crop=apple$/);
  await expect(outlook(page)).toContainText("02시 예보 기준");
});

test("물: 작기가 아니면 다음 작기 안내", async ({ page }) => {
  await page.goto("/water?st=101&crop=cabbage");
  await expect(now(page)).toContainText("배추 작기가 아니에요");
  await expect(now(page)).toContainText("정식부터 물을 계산해요");
});

test("물: DB가 오류를 주면 멈추지 않고 '자료 없음'과 이유", async ({
  page,
}) => {
  const response = await page.goto("/water?st=216&crop=apple");
  expect(response?.status()).toBe(200);
  await expect(now(page)).toContainText("자료 없음");
  await expect(now(page)).toContainText("DB에서 물 자료를 읽지 못했어요");
  await expect(page.getByRole("region", { name: "자료 정보" })).toContainText(
    "자료 없음",
  );
});

test("물: 휴대폰 폭(390)에서 옆으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/water?st=101&crop=apple");
  await expect(now(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("물: 춘천 밖 예보 지점은 예보 범위가 검증 전이라고 알린다", async ({
  page,
}) => {
  await page.goto("/water?st=192&crop=apple");
  await expect(outlook(page)).toContainText("02시 예보 기준");
  await expect(outlook(page)).toContainText("춘천 값을 빌려 써서 아직 검증 전");
  await page.goto("/water?st=101&crop=apple");
  await expect(outlook(page)).toContainText("02시 예보 기준");
  await expect(outlook(page)).not.toContainText("검증 전");
});

test("물(작물 공통): 토양 물 상태 카드·건조 예상일·토양 변경·추정값·겨울철·390폭", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=common");

  await expect(now(page)).toContainText("보통");
  await expect(now(page)).toContainText("토양 속 남은 물 48%");
  await expect(now(page)).toContainText("남은 물 31 / 담을 수 있는 물 65 mm");
  await expect(now(page)).toContainText(
    "물이 줄고 있지만 아직 부족하지 않아요.",
  );
  await expect(now(page)).toContainText(
    "비가 오지 않으면 약 6일 뒤 건조 단계에 들어가요.",
  );
  await expect(now(page)).toContainText("최근 7일: 비 3 mm · 증발 수요 24 mm");
  await expect(
    page.getByText(
      "※ 작물과 관계없이 겉토양 50 cm만 본 값이에요. 작물별 관수 판단은 작물을 고르세요.",
    ),
  ).toBeVisible();
  await expect(outlook(page)).toContainText(
    "작물 공통은 앞으로 3일 전망을 아직 제공하지 않아요.",
  );

  // 토양을 사토로 바꾸면 값이 바뀐다
  await now(page)
    .getByRole("button", { name: /계산에 쓴 토양: 양토/ })
    .click();
  const soilList = now(page).getByRole("listbox", { name: "토양 고르기" });
  await expect(
    soilList.getByRole("option", { name: /사질식양토.*추정값/ }),
  ).toBeVisible();
  await soilList.getByRole("option", { name: /^사토$/ }).click();

  await expect(page).toHaveURL(/\/water\?st=101&crop=common&soil=sand$/);
  await expect(now(page)).toContainText("건조");
  await expect(now(page)).toContainText("토양 속 남은 물 20%");
  await expect(now(page)).toContainText("남은 물 6 / 담을 수 있는 물 30 mm");

  // 추정값 토양(사질식양토)을 고르면 '추정값' 배지와 Saxton & Rawls 문구가 보인다
  await now(page)
    .getByRole("button", { name: /계산에 쓴 토양: 사토/ })
    .click();
  await now(page)
    .getByRole("listbox", { name: "토양 고르기" })
    .getByRole("option", { name: /^사질식양토/ })
    .click();
  await expect(page).toHaveURL(
    /\/water\?st=101&crop=common&soil=sandy_clay_loam$/,
  );
  await expect(
    now(page).getByRole("button", {
      name: /계산에 쓴 토양: 사질식양토.*추정값/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Saxton & Rawls \(2006\) 식으로 추정한 값이에요/),
  ).toBeVisible();

  // 겨울 날짜(1월)로 가면 '겨울철' 판정이 나온다
  await page.goto("/water?st=101&crop=common&d=2026-01-15");
  await expect(now(page)).toContainText("겨울철");
  await expect(now(page)).toContainText("12~2월은 판정하지 않아요.");

  // 휴대폰 폭(390)에서 옆으로 넘치지 않는다
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/water?st=101&crop=common");
  await expect(now(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// 작기 돌아보기 그래프: 따라 보기 (이슈 #46). 위 칸(data-plot="top")의 안쪽이 날짜 칸이 깔린 자리다.
const seasonPlot = async (page: Page) => {
  const top = page
    .getByRole("region", { name: /작기 돌아보기/ })
    .locator('[data-plot="top"]');
  await top.scrollIntoViewIfNeeded();
  const box = (await top.boundingBox())!;
  return box;
};

test("물: 작기 그래프에 마우스를 올리면 그날 값 상자가 따라오고, 벗어나면 사라지고, 누르면 그날로 간다", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  const box = await seasonPlot(page);
  const tip = page.getByRole("tooltip");
  await expect(tip).toHaveCount(0);

  // 왼쪽 끝 = 첫날(1월 1일), 사과는 휴면기
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await expect(tip).toContainText("1월 1일");
  await expect(tip).toContainText("휴면기");
  await expect(tip).toContainText("기준 증발산");
  await expect(tip).toContainText("부족한 물");
  await expect(tip.getByRole("link")).toHaveCount(0);

  // 오른쪽 절반에서는 상자가 왼쪽으로 뒤집혀 그래프 안에 머문다
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(tip).not.toContainText("1월 1일");
  await expect(tip).toContainText("부족한 물");
  const t = (await tip.boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(box.x + box.width + 26);

  await page.mouse.move(box.x + box.width / 2, 5);
  await expect(tip).toHaveCount(0);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/&d=\d{4}-\d{2}-\d{2}$/);
});

test.describe("물: 작기 그래프 (휴대폰)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("탭하면 값 상자가 고정되고, '이 날 보기'를 눌러야 그날로 간다", async ({
    page,
  }) => {
    await page.goto("/water?st=101&crop=apple");
    const box = await seasonPlot(page);
    const tip = page.getByRole("tooltip");

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tip).toContainText("부족한 물");
    const go = tip.getByRole("link", { name: /물 화면 보기/ });
    await expect(go).toContainText("이 날 보기");
    await expect(page).toHaveURL(/\/water\?st=101&crop=apple$/);

    await go.click();
    await expect(page).toHaveURL(/&d=\d{4}-\d{2}-\d{2}$/);
  });
});
