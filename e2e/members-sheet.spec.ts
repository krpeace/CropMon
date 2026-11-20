import type { APIRequestContext } from "@playwright/test";

import { expect, test, type Page } from "./fixtures";

// 회원제 스위치 "켬" — 로그인 시트 · 알림 · 헤더 로그인 ↔ 프로필 · 내 계정 시트 (이슈 #189, 결정 0064). 데스크톱 1440.
// 이 서버(3101)는 MEMBERS_ENABLED=true 이고 NAVER_LOGIN_ENABLED 는 없다(네이버 "준비 중"). 로그인은 가짜 Supabase 의 흉내다.
// 가짜의 시나리오는 전역 값이라 이 파일은 차례로(serial) 돈다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const STATE_COOKIE = "cm_m";
const enc = encodeURIComponent;

const setScenario = (request: APIRequestContext, scenario: string) =>
  request.post(`${FAKE}/scenario`, { data: { scenario } });
const stateCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === STATE_COOKIE);
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const loginButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "로그인", exact: true });
const profileButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "내 계정" });
const loginDialog = (page: Page) =>
  page.getByRole("dialog", { name: "로그인" });
const accountDialog = (page: Page) =>
  page.getByRole("dialog", { name: "내 계정" });
const toast = (page: Page) => page.getByTestId("toast");

/** 화면이 뜨고 눌러도 되는 상태(헤더 단추가 살아난 뒤)까지 기다린다. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 가짜 카카오로 로그인해 path 로 돌아온다(알림이 뜬 뒤 주소에서 login 이 지워질 때까지). */
async function signIn(page: Page, path = "/water?st=105&crop=apple") {
  await open(page, path);
  await loginButton(page).click();
  await loginDialog(page).getByRole("link", { name: "카카오 로그인" }).click();
  await expect(profileButton(page)).toBeVisible();
  await expect.poll(() => here(page)).toBe(path);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test.describe("표시 쿠키 · 헤더", () => {
  test('첫 방문 응답에 cm_m=a 가 붙고(HttpOnly 아님), 헤더는 처음부터 "로그인" 하나(곧 열려요 배지 없음)', async ({
    page,
    request,
  }) => {
    const res = await request.get("/water?st=105", { maxRedirects: 0 });
    expect(res.headers()["set-cookie"]).toMatch(/cm_m=a/);
    expect(res.headers()["set-cookie"].toLowerCase()).not.toContain("httponly");

    await open(page, "/water?st=105");
    expect((await stateCookie(page))?.value).toBe("a");
    await expect(loginButton(page)).toHaveCount(1);
    await expect(loginButton(page)).toBeVisible();
    await expect(page.locator("header").getByText("곧 열려요")).toBeHidden();
    // 프로필 모양도 HTML 에는 있다(데스크톱 헤더 · 휴대폰 맥락 바 각각). display:none 이라 보이지 않고, 접근성 목록에서도 빠진다
    const hidden = await page
      .locator("[data-members-show='in']")
      .evaluateAll((els) =>
        els.map((e) => getComputedStyle(e).display === "none"),
      );
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every(Boolean)).toBe(true);
    await expect(profileButton(page)).toHaveCount(0);
  });

  test('숨긴 모양은 화면 읽기에서도 빠진다 — 접근성 이름으로 "로그인" 단추가 정확히 하나', async ({
    page,
  }) => {
    await open(page, "/");
    await expect(page.getByRole("button", { name: /로그인/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "내 계정" })).toHaveCount(0);
  });

  test("쿠키 값이 모르는 값이면 헤더는 알파 모양으로 시작한다 (프록시가 곧 고친다)", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: STATE_COOKIE, value: "zzz", url: "http://localhost:3101" },
    ]);
    await open(page, "/");
    expect((await stateCookie(page))?.value).toBe("a");
    await expect(loginButton(page)).toBeVisible();
  });
});

test.describe("로그인 시트", () => {
  test('"로그인"을 누르면 가운데 창(폭 520 · 손잡이 없음)이 열리고, 버튼 셋이 카카오 · 네이버 · 구글 순서이며 href 가 맞다', async ({
    page,
  }) => {
    await open(page, "/water?st=105&crop=apple&soil=loam");
    await loginButton(page).click();
    const dialog = loginDialog(page);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.width).toBeCloseTo(520, 0);
    await expect(page.getByTestId("sheet-grip")).toHaveCount(0);

    const next = enc("/water?st=105&crop=apple&soil=loam");
    const links = dialog.locator("a[href^='/auth/login']");
    await expect(links).toHaveCount(2); // 네이버는 준비 중이라 링크가 아니다
    expect(
      await links.evaluateAll((a) => a.map((x) => x.getAttribute("href"))),
    ).toEqual([
      `/auth/login?provider=kakao&next=${next}`,
      `/auth/login?provider=google&next=${next}`,
    ]);

    // 순서: 카카오 → 네이버 → 구글, 같은 크기
    const order = await dialog
      .locator("a[href^='/auth/login'], button[disabled]")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(order[0]).toContain("카카오");
    expect(order[1]).toContain("네이버");
    expect(order[2]).toContain("Google");
    const boxes = await Promise.all(
      [
        dialog.getByRole("link", { name: "카카오 로그인" }),
        dialog.getByRole("button", { name: /네이버 로그인/ }),
        dialog.getByRole("link", { name: "Google 계정으로 로그인" }),
      ].map(async (l) => (await l.boundingBox())!),
    );
    for (const b of boxes) {
      expect(b.height).toBeCloseTo(52, 0);
      expect(b.width).toBeCloseTo(boxes[0].width, 0);
    }
    // 약관 안내
    await expect(
      dialog.getByRole("link", { name: "이용약관" }),
    ).toHaveAttribute("href", "/terms");
    await expect(
      dialog.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy");
    // 시트가 열린 동안 모든 단추는 <a> 이고 <Link> 미리 불러오기가 아니다
    expect(
      await dialog
        .locator("a[href^='/auth/login']")
        .evaluateAll((a) => a.every((x) => x.tagName === "A")),
    ).toBe(true);
  });

  test("네이버는 준비 중 — 같은 자리 · 같은 크기, 흐리게, 못 누름 (NAVER_LOGIN_ENABLED 꺼짐)", async ({
    page,
  }) => {
    await open(page, "/");
    await loginButton(page).click();
    const naver = loginDialog(page).getByRole("button", {
      name: /네이버 로그인/,
    });
    await expect(naver).toBeDisabled();
    await expect(naver).toContainText("준비 중");
    const opacity = await naver.evaluate((e) => getComputedStyle(e).opacity);
    expect(Number(opacity)).toBeLessThan(0.6);
  });

  test("× · 바깥 · Esc 로 닫으면 보던 화면 그대로(주소 · 선택 그대로)", async ({
    page,
  }) => {
    await open(page, "/water?st=105&crop=apple");
    for (const close of [
      () => loginDialog(page).getByRole("button", { name: "닫기" }).click(),
      () => page.mouse.click(5, 5),
      () => page.keyboard.press("Escape"),
    ]) {
      await loginButton(page).click();
      await expect(loginDialog(page)).toBeVisible();
      await close();
      await expect(loginDialog(page)).toBeHidden();
      expect(here(page)).toBe("/water?st=105&crop=apple");
    }
  });

  test('시트가 열려도 접근성 이름 "로그인" 단추 외에 "로그인" 이름이 둘로 읽히지 않는다', async ({
    page,
  }) => {
    await open(page, "/");
    await loginButton(page).click();
    await expect(loginDialog(page)).toBeVisible();
    // 창 자체가 "로그인" 대화상자이고, 헤더의 단추는 하나뿐이다
    await expect(page.getByRole("dialog", { name: "로그인" })).toHaveCount(1);
    await expect(loginButton(page)).toHaveCount(1);
  });

  test("누르면 진행 표시가 뜨고 나머지 버튼은 흐려져 못 누른다 (두 번 누름 막기)", async ({
    page,
  }) => {
    await open(page, "/water?st=105");
    await loginButton(page).click();
    const dialog = loginDialog(page);
    const kakao = dialog.getByRole("link", { name: "카카오 로그인" });
    const google = dialog.getByRole("link", { name: "Google 계정으로 로그인" });
    // 공급자로 이동하는 중간 모습을 볼 수 있게 이동만 막는다(화면의 누름 처리는 먼저 돈다)
    await page.evaluate(() =>
      document.addEventListener("click", (e) => {
        if ((e.target as Element).closest("a[href^='/auth/login']")) {
          e.preventDefault();
        }
      }),
    );
    await kakao.click();
    await expect(kakao).toHaveAttribute("aria-busy", "true");
    await expect(dialog.getByTestId("login-spinner")).toHaveCount(1);
    await expect(google).toHaveAttribute("aria-disabled", "true");
    expect(
      Number(await google.evaluate((e) => getComputedStyle(e).opacity)),
    ).toBeLessThan(0.6);
    // 나머지를 눌러도 진행 중인 것이 바뀌지 않는다
    await google.click({ force: true });
    await expect(kakao).toHaveAttribute("aria-busy", "true");
    await expect(google).not.toHaveAttribute("aria-busy", "true");
  });
});

test.describe("로그인 → 돌아옴 알림", () => {
  test('성공: "로그인했어요" 알림 + 주소에서 login 지워짐 + 헤더가 프로필로 바뀜(다크 모드 단추도 사라짐) + 쿠키 i', async ({
    page,
  }) => {
    await open(page, "/water?st=105&crop=apple");
    await expect(
      page.getByRole("button", { name: "다크 모드로 보기" }),
    ).toBeVisible();
    await loginButton(page).click();
    await loginDialog(page)
      .getByRole("link", { name: "카카오 로그인" })
      .click();
    await expect(toast(page)).toHaveText("로그인했어요");
    await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
    await expect(profileButton(page)).toBeVisible();
    await expect(loginButton(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "다크 모드로 보기" }),
    ).toBeHidden();
    expect((await stateCookie(page))?.value).toBe("i");
    // 알림은 몇 초 뒤 사라진다
    await expect(toast(page)).toBeHidden({ timeout: 8000 });
    // 새로고침해도 알림이 다시 뜨지 않는다
    await page.reload();
    await expect(toast(page)).toHaveCount(0);
  });

  test("알림 자리는 화면 읽기가 읽도록 role=status", async ({ page }) => {
    await signIn(page);
    // 알림이 사라져도 자리는 남아 있다
    await expect(page.getByRole("status")).toHaveCount(1);
  });

  test("취소: 아무 말 없이 주소만 정리된다", async ({ page, request }) => {
    await setScenario(request, "cancel");
    await open(page, "/water?st=105&crop=apple");
    await loginButton(page).click();
    await loginDialog(page)
      .getByRole("link", { name: "카카오 로그인" })
      .click();
    await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
    await expect(toast(page)).toHaveCount(0);
    await expect(loginButton(page)).toBeVisible();
  });

  test("실패: 안내 알림 + 주소에서 login 지워짐 + 로그인 단추 그대로", async ({
    page,
    request,
  }) => {
    await setScenario(request, "exchange-fail");
    await open(page, "/water?st=105");
    await loginButton(page).click();
    await loginDialog(page)
      .getByRole("link", { name: "Google 계정으로 로그인" })
      .click();
    await expect(toast(page)).toHaveText(
      "로그인을 마치지 못했어요. 잠시 뒤 다시 해 주세요",
    );
    await expect.poll(() => here(page)).toBe("/water?st=105");
    await expect(loginButton(page)).toBeVisible();
  });
});

test.describe("로그인 필요 주소 → 시트", () => {
  test("/farm/settings 를 열면 /?login=1&next=… 로 가서 시트가 열리고, 로그인하면 그 주소로 간다", async ({
    page,
  }) => {
    await page.goto("/farm/settings?st=105");
    await expect(loginDialog(page)).toBeVisible();
    expect(here(page)).toBe(`/?login=1&next=${enc("/farm/settings?st=105")}`);
    const kakao = loginDialog(page).getByRole("link", {
      name: "카카오 로그인",
    });
    await expect(kakao).toHaveAttribute(
      "href",
      `/auth/login?provider=kakao&next=${enc("/farm/settings?st=105")}`,
    );
    await kakao.click();
    await page.waitForURL(/\/farm\/settings/);
    await expect.poll(() => here(page)).toBe("/farm/settings?st=105");
  });

  test("닫으면 주소에서 login · next 가 지워지고, 새로고침해도 다시 안 열린다", async ({
    page,
  }) => {
    await page.goto("/farm/settings");
    await expect(loginDialog(page)).toBeVisible();
    await loginDialog(page).getByRole("button", { name: "닫기" }).click();
    await expect(loginDialog(page)).toBeHidden();
    expect(here(page)).toBe("/");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(loginDialog(page)).toHaveCount(0);
  });

  test("위험한 next(남의 사이트)는 시트 버튼에서도 / 가 된다", async ({
    page,
  }) => {
    await page.goto(`/?login=1&next=${enc("https://evil.example")}`);
    await expect(
      loginDialog(page).getByRole("link", { name: "카카오 로그인" }),
    ).toHaveAttribute("href", `/auth/login?provider=kakao&next=${enc("/")}`);
  });
});

test.describe("내 계정 시트 · 로그아웃", () => {
  test("프로필을 누르면 내 계정 시트: 시안 순서, 있는 화면만 연결, 나머지는 준비 중", async ({
    page,
  }) => {
    await signIn(page);
    await profileButton(page).click();
    const dialog = accountDialog(page);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.width).toBeCloseTo(520, 0);

    const labels = await dialog
      .locator("li, form button")
      .evaluateAll((els) =>
        els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
      );
    expect(labels.map((t) => t.replace(/준비 중|›/g, "").trim())).toEqual([
      "알림",
      "농장 설정",
      "작물 설정",
      "화면 구성",
      "글씨 크기",
      "다크 모드",
      "회원 정보",
      "알림 설정",
      "로그아웃",
    ]);
    for (const soon of ["알림", "농장 설정", "작물 설정", "알림 설정"]) {
      const row = dialog.getByRole("button", {
        name: `${soon} 준비 중`,
        exact: true,
      });
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row).toContainText("준비 중");
    }
    await expect(
      dialog.getByRole("link", { name: /화면 구성/ }),
    ).toHaveAttribute("href", /^\/layout/);
    await expect(
      dialog.getByRole("link", { name: /글씨 크기/ }),
    ).toHaveAttribute("href", /^\/font-size/);
    // 회원 정보는 이슈 #195(결정 0067)부터 화면이 있는 줄이다
    await expect(
      dialog.getByRole("link", { name: /회원 정보/ }),
    ).toHaveAttribute("href", "/account");
  });

  test("제목 줄(×)이 안에서 스크롤해도 고정이고 잘리지 않는다 · 다크 모드가 시트 안에 있다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await signIn(page);
    await profileButton(page).click();
    const dialog = accountDialog(page);
    const close = dialog.getByRole("button", { name: "닫기" });
    await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
    const box = (await close.boundingBox())!;
    const win = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(win.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(win.y + win.height + 1);

    await dialog.getByRole("button", { name: "다크 모드로 보기" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("화면 구성 줄을 누르면 시트가 닫히고 그 화면이 열린다", async ({
    page,
  }) => {
    await signIn(page);
    await profileButton(page).click();
    await accountDialog(page)
      .getByRole("link", { name: /화면 구성/ })
      .click();
    await page.waitForURL(/\/layout/);
    await expect(accountDialog(page)).toHaveCount(0);
  });

  test('로그아웃 → 보던 화면으로 돌아오고 헤더가 "로그인"으로, 쿠키 a', async ({
    page,
  }) => {
    await signIn(page, "/water?st=105&crop=apple");
    await profileButton(page).click();
    await accountDialog(page).getByRole("button", { name: "로그아웃" }).click();
    await page.waitForURL(/\/water\?st=105&crop=apple$/);
    await expect(loginButton(page)).toBeVisible();
    await expect(profileButton(page)).toBeHidden();
    expect((await stateCookie(page))?.value).toBe("a");
    expect(
      (await page.context().cookies()).filter((c) =>
        /^sb-.+-auth-token/.test(c.name),
      ),
    ).toHaveLength(0);
  });
});
