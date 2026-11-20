import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 화면 설정 계정 저장 (이슈 #193, 결정 0066) — 스위치 "켬" 서버(3101), 데스크톱 1440. 가짜 Supabase 가 계정(members 세 열)을 흉내 낸다.
// 가짜의 상태는 전역이라 이 파일은 차례로(serial) 돈다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;
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

type Layout = { v: 1; order: string[]; off: string[] };
const layout = (order: string[], off: string[] = []): Layout => ({
  v: 1,
  order: [...order, ...IDS.filter((id) => !order.includes(id))],
  off,
});
/** 종합 · 온도 · 물 순서로 바꾼 구성 */
const SWAPPED = layout(["home", "temp", "water"]);
/** 물을 끈 구성 */
const WATER_OFF = layout(IDS, ["water"]);
const DEFAULT_LAYOUT = layout(IDS);

const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const calls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<{
    settingsReads: number;
    settingsWrites: number;
    settingsLast: Record<string, unknown> | null;
    settings: Record<
      string,
      { layout?: Layout; font_scale?: unknown; theme?: string }
    >;
  }>;
const account = async (request: APIRequestContext) =>
  Object.values((await calls(request)).settings)[0] ?? {};

const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const sheet = (page: Page) =>
  page.getByRole("dialog", { name: "화면 구성을 계정에 저장할까요?" });
const toast = (page: Page) => page.getByTestId("toast");
const fz = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--fz").trim(),
  );

type Device = {
  menus?: Layout;
  font?: { step: string; follow: boolean };
  theme?: "light" | "dark";
};
/** 기기(localStorage)에 설정을 미리 넣는다 — 공개 화면을 한 번 연 뒤 넣어서, 로그인 뒤에 되돌려 놓지 않게 한다. */
async function setDevice(page: Page, d: Device) {
  await page.goto("/water?st=105");
  await page.evaluate((dev) => {
    if (dev.menus)
      localStorage.setItem("cropmon-menus", JSON.stringify(dev.menus));
    if (dev.font)
      localStorage.setItem(
        "cropmon-font-scale",
        JSON.stringify({ v: 1, ...dev.font }),
      );
    if (dev.theme) localStorage.setItem("cropmon-theme", dev.theme);
  }, d);
}
const device = (page: Page) =>
  page.evaluate(() => ({
    menus: JSON.parse(localStorage.getItem("cropmon-menus") ?? "null"),
    font: JSON.parse(localStorage.getItem("cropmon-font-scale") ?? "null"),
    theme: localStorage.getItem("cropmon-theme"),
  }));

/** 같은 회원(sameUser)으로 카카오 로그인 → 보던 화면(알림 · 주소 정리까지). */
async function login(page: Page) {
  await page.goto(`/auth/login?provider=kakao&next=${enc(NEXT)}`);
  await expect(toast(page)).toHaveText("로그인했어요");
  await expect.poll(() => here(page)).toBe(NEXT);
  await page.waitForLoadState("networkidle");
}

async function newDevice(
  browser: import("@playwright/test").Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: "http://localhost:3101",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        "cropmon-notice-closed",
        JSON.stringify({ v: 1, closed: ["fontSize"] }),
      );
    } catch {}
  });
  return { context, page: await context.newPage() };
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
  await scenario(request, { sameUser: true });
});

test.describe("로그인 직후 — 화면 구성 다섯 갈래", () => {
  test("① 기기 기본값 + 계정 비어 있음 → 아무것도 안 함 (시트 없음 · 쓰기 0, 읽기는 한 번)", async ({
    page,
    request,
  }) => {
    await login(page);
    await expect(sheet(page)).toHaveCount(0);
    const c = await calls(request);
    expect(c.settingsWrites).toBe(0);
    expect(c.settingsReads).toBe(1);
  });

  test("② 기기 기본값 + 계정 값 있음 → 묻지 않고 계정 값을 기기에 쓴다 (글씨 · 다크도) — 바로 적용", async ({
    page,
    request,
  }) => {
    await scenario(request, {
      settings: {
        layout: SWAPPED,
        font_scale: { v: 1, step: "large", follow: false },
        theme: "dark",
      },
    });
    await login(page);
    await expect(sheet(page)).toHaveCount(0);
    await expect
      .poll(async () => (await device(page)).font)
      .toEqual({ v: 1, step: "large", follow: false });
    const d = await device(page);
    expect(d.menus.order.slice(0, 3)).toEqual(["home", "temp", "water"]);
    expect(d.theme).toBe("dark");
    // 새로고침 없이 화면에 적용됨
    expect(await fz(page)).toBe("1.15");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect((await calls(request)).settingsWrites).toBe(0);
  });

  test("③ 기기 다름 + 계정 비어 있음 → 저장할까요 시트 — [저장하기]는 기기 구성을 계정에 쓴다", async ({
    page,
    request,
  }) => {
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    const s = sheet(page);
    await expect(s).toBeVisible();
    await expect(
      s.getByText(
        "이 기기에서 바꿔 둔 하단 탭이에요. 저장하면 다른 기기에서도 같은 구성으로 보여요.",
      ),
    ).toBeVisible();
    await expect(s.getByRole("button", { name: "저장하기" })).toBeVisible();
    await expect(
      s.getByRole("button", { name: "기본 구성 쓰기" }),
    ).toBeVisible();
    await s.getByRole("button", { name: "저장하기" }).click();
    await expect(s).toBeHidden();
    await expect
      .poll(async () => (await account(request)).layout?.order.slice(0, 3))
      .toEqual(["home", "temp", "water"]);
    expect((await device(page)).menus.order.slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]); // 기기는 그대로
  });

  test("③' [기본 구성 쓰기] → 기기를 기본값으로 (저장값 지움), 계정은 그대로 비어 있음", async ({
    page,
    request,
  }) => {
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    await sheet(page).getByRole("button", { name: "기본 구성 쓰기" }).click();
    await expect(sheet(page)).toBeHidden();
    expect((await device(page)).menus).toBeNull();
    expect((await calls(request)).settingsLast).toBeNull();
  });

  test("④ 기기 다름 + 계정과 같음 → 아무것도 안 함", async ({
    page,
    request,
  }) => {
    await scenario(request, { settings: { layout: SWAPPED } });
    await setDevice(page, { menus: layout(["home", "temp"]) }); // 정규 모양으로 같음
    await login(page);
    await expect(sheet(page)).toHaveCount(0);
    expect((await calls(request)).settingsWrites).toBe(0);
  });

  test("⑤ 기기 다름 + 계정과 다름 → 충돌형 시트 — [계정 구성 쓰기]는 계정 값을 기기에 쓴다", async ({
    page,
    request,
  }) => {
    await scenario(request, { settings: { layout: WATER_OFF } });
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    const s = sheet(page);
    await expect(s).toBeVisible();
    await expect(
      s.getByText(
        "이 기기의 하단 탭이 계정에 저장된 구성과 달라요. 저장하면 다른 기기에서도 이 구성으로 보여요.",
      ),
    ).toBeVisible();
    await expect(s.getByRole("button", { name: "기본 구성 쓰기" })).toHaveCount(
      0,
    );
    await s.getByRole("button", { name: "계정 구성 쓰기" }).click();
    await expect(s).toBeHidden();
    await expect
      .poll(async () => (await device(page)).menus?.off)
      .toEqual(["water"]);
    expect((await calls(request)).settingsWrites).toBe(0);
  });

  test("⑤' 충돌형 시트의 [저장하기]는 기기 구성을 계정에 쓴다", async ({
    page,
    request,
  }) => {
    await scenario(request, { settings: { layout: WATER_OFF } });
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    await sheet(page).getByRole("button", { name: "저장하기" }).click();
    await expect
      .poll(async () => (await account(request)).layout?.off)
      .toEqual([]);
    expect((await account(request)).layout?.order.slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
  });

  test("시트 미리보기는 기기 설정으로 만들어질 탭 넷 + 더보기", async ({
    page,
  }) => {
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    const preview = sheet(page).getByTestId("tab-preview");
    await expect(preview.locator("[data-tab]")).toHaveText([
      "종합",
      "온도",
      "물",
      "햇빛",
      "더보기",
    ]);
  });

  test("× · 닫기 · Esc 로 닫으면 아무것도 안 바뀌고(기기 그대로 · 계정 저장 안 함), 새로고침해도 다시 안 묻고, 다음 로그인에는 다시 묻는다", async ({
    page,
    request,
  }) => {
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    await expect(sheet(page)).toBeVisible();
    await sheet(page)
      .getByRole("button", { name: /닫기|×/ })
      .first()
      .click();
    await expect(sheet(page)).toBeHidden();
    expect((await device(page)).menus.order.slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
    expect((await calls(request)).settingsWrites).toBe(0);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(sheet(page)).toHaveCount(0);
    // 다음 로그인
    await page.context().clearCookies();
    await login(page);
    await expect(sheet(page)).toBeVisible();
  });

  test("한 번 처리하면 새로고침해도 다시 안 묻는다", async ({ page }) => {
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    await sheet(page).getByRole("button", { name: "저장하기" }).click();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe("로그인 직후 — 글씨 크기 · 다크 모드는 조용히", () => {
  test("기기가 기본값과 다르고 계정이 비어 있으면 기기 값을 계정에 저장한다 (시트 없음)", async ({
    page,
    request,
  }) => {
    await setDevice(page, {
      font: { step: "large", follow: false },
      theme: "dark",
    });
    await login(page);
    await expect(sheet(page)).toHaveCount(0);
    await expect
      .poll(async () => (await account(request)).font_scale)
      .toEqual({ v: 1, step: "large", follow: false });
    expect((await account(request)).theme).toBe("dark");
  });

  test("기기가 기본값과 다르면 계정에 다른 값이 있어도 기기 값을 계정에 저장한다", async ({
    page,
    request,
  }) => {
    await scenario(request, {
      settings: {
        font_scale: { v: 1, step: "xlarge", follow: false },
        theme: "light",
      },
    });
    await setDevice(page, {
      font: { step: "large", follow: false },
      theme: "dark",
    });
    await login(page);
    await expect
      .poll(async () => (await account(request)).font_scale)
      .toEqual({ v: 1, step: "large", follow: false });
    expect((await account(request)).theme).toBe("dark");
    expect((await device(page)).font.step).toBe("large");
  });
});

test.describe("로그인한 뒤 바꿀 때", () => {
  test("글씨 크기를 바꾸면 기기에 쓰고 계정에도 쓴다 — 빠르게 여러 번 바꿔도 마지막 값 한 번만", async ({
    page,
    request,
  }) => {
    await login(page);
    await page.goto("/font-size?st=105&crop=apple");
    await page.waitForLoadState("networkidle");
    for (const name of ["크게", "더 크게", "아주 크게"]) {
      await page.getByRole("button", { name, exact: true }).click();
    }
    await expect
      .poll(async () => (await account(request)).font_scale)
      .toEqual({ v: 1, step: "xxlarge", follow: false });
    const c = await calls(request);
    expect(c.settingsWrites).toBe(1); // 모아서 한 번
    expect(await fz(page)).toBe("1.5");
  });

  test("화면 구성을 바꾸면 계정에도 쓴다 · 기본값으로 되돌리면 null 이 아니라 기본값 값을 쓴다", async ({
    page,
    request,
  }) => {
    await login(page);
    await page.goto("/layout?st=105&crop=apple");
    await page.waitForLoadState("networkidle");
    await page.getByRole("switch", { name: "토양 사용" }).click();
    await expect
      .poll(async () => (await account(request)).layout?.off)
      .toEqual(["soil"]);
    await page.getByRole("button", { name: "기본값", exact: true }).click();
    await expect
      .poll(async () => (await account(request)).layout)
      .toEqual(DEFAULT_LAYOUT);
  });

  test("다크 모드(내 계정 시트)를 바꾸면 계정에도 쓴다", async ({
    page,
    request,
  }) => {
    await login(page);
    await page
      .locator("header")
      .getByRole("button", { name: "내 계정" })
      .click();
    await page
      .getByRole("dialog", { name: "내 계정" })
      .getByRole("button", { name: "다크 모드로 보기" })
      .click();
    await expect.poll(async () => (await account(request)).theme).toBe("dark");
  });

  test("/layout 안내 줄: 회원은 계정에 저장된다는 글, 비회원은 지금 글 그대로", async ({
    page,
  }) => {
    await page.goto("/layout?st=105");
    await expect(
      page.getByText("이 기기에 저장돼요. 로그인하면 계정에 저장돼요."),
    ).toBeVisible();
    await login(page);
    await page.goto("/layout?st=105");
    await expect(
      page.getByText(
        "내 계정에 저장돼요. 다른 기기에서도 같은 구성으로 보여요.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("이 기기에 저장돼요. 로그인하면 계정에 저장돼요."),
    ).toHaveCount(0);
  });

  test("로그아웃해도 기기 값은 그대로다", async ({ page, request }) => {
    await scenario(request, { settings: { layout: SWAPPED } });
    await login(page);
    await expect
      .poll(async () => (await device(page)).menus?.order[1])
      .toBe("temp");
    await page
      .locator("header")
      .getByRole("button", { name: "내 계정" })
      .click();
    await page
      .getByRole("dialog", { name: "내 계정" })
      .getByRole("button", { name: "로그아웃" })
      .click();
    await page.waitForURL(/\/water\?/);
    expect((await device(page)).menus.order[1]).toBe("temp");
  });
});

test.describe("다른 기기 · 따라오기", () => {
  test("다른 기기(새 브라우저 문맥)에서 로그인하면 계정 값이 따라온다", async ({
    page,
    browser,
    request,
  }) => {
    await login(page);
    await page.goto("/font-size?st=105");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "더 크게", exact: true }).click();
    await expect
      .poll(async () => (await account(request)).font_scale)
      .toEqual({ v: 1, step: "xlarge", follow: false });

    const b = await newDevice(browser);
    await login(b.page);
    await expect
      .poll(async () => (await device(b.page)).font?.step)
      .toBe("xlarge");
    expect(await fz(b.page)).toBe("1.3");
    await expect(sheet(b.page)).toHaveCount(0);
    await b.context.close();
  });

  test("로그인한 채 새 탭을 처음 열면 다른 기기에서 바꾼 값이 새로고침 없이 바로 적용된다 (탭바 · 글씨 · 테마)", async ({
    page,
    request,
  }) => {
    await login(page);
    await scenario(request, {
      settings: {
        layout: SWAPPED,
        font_scale: { v: 1, step: "xlarge", follow: false },
        theme: "dark",
      },
    });
    const tab = await page.context().newPage();
    await tab.goto(NEXT);
    await expect.poll(() => fz(tab)).toBe("1.3");
    await expect(tab.locator("html")).toHaveAttribute("data-theme", "dark");
    // 탭바 순서 (휴대폰 아닌 화면에서는 데스크톱 메뉴 줄은 기본 순서 고정이라 기기 값으로 확인)
    await expect
      .poll(async () => (await device(tab)).menus?.order[1])
      .toBe("temp");
  });

  test("기기가 따로 달라졌으면(시트를 ×로 닫음) 따라오기가 덮어쓰지 않고 시트도 다시 안 띄운다", async ({
    page,
    request,
  }) => {
    await scenario(request, { settings: { layout: WATER_OFF } });
    await setDevice(page, { menus: SWAPPED });
    await login(page);
    await sheet(page)
      .getByRole("button", { name: /닫기|×/ })
      .first()
      .click();
    const tab = await page.context().newPage();
    await tab.goto(NEXT);
    await tab.waitForLoadState("networkidle");
    await expect(sheet(tab)).toHaveCount(0);
    expect((await device(tab)).menus.order.slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
    expect((await device(tab)).menus.off).toEqual([]);
  });

  test("로그인 직후 탭에서는 /auth/settings 읽기를 한 번만 부른다 (판단과 따라오기를 하나로)", async ({
    page,
  }) => {
    let gets = 0;
    page.on("request", (r) => {
      if (
        new URL(r.url()).pathname === "/auth/settings" &&
        r.method() === "GET"
      )
        gets += 1;
    });
    await login(page);
    await page.waitForTimeout(500);
    expect(gets).toBe(1);
  });
});

test.describe("동의 전 · 비회원", () => {
  test("동의 전에는 /consent 에서 부르지 않고, 403 을 받으면 그 탭에서는 다시 부르지 않는다 — 아무것도 안 바뀐다", async ({
    page,
    request,
  }) => {
    await scenario(request, { consentMode: "needed" });
    let settingsRequests = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/auth/settings") settingsRequests += 1;
    });
    await setDevice(page, { menus: SWAPPED });
    await page.goto(`/auth/login?provider=kakao&next=${enc(NEXT)}`);
    await expect(
      page.getByRole("dialog", {
        name: "CropMon을 시작하려면 동의가 필요해요",
      }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect(settingsRequests).toBe(0); // 동의 화면에서는 안 부른다
    // 동의 전에 공개 화면을 열면 한 번 부르고 403, 같은 탭에서 다시 열어도 다시 안 부른다
    await page.goto("/water?st=105");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.goto("/more");
    await page.waitForLoadState("networkidle");
    expect(settingsRequests).toBe(1);
    const c = await calls(request);
    expect(c.settingsReads).toBe(0);
    expect(c.settingsWrites).toBe(0);
    // 서버도 거절한다
    const r = await page.context().request.get("/auth/settings");
    expect(r.status()).toBe(403);
    const w = await page
      .context()
      .request.post("/auth/settings", { data: { theme: "dark" } });
    expect(w.status()).toBe(403);
    expect((await calls(request)).settingsWrites).toBe(0);
    expect((await device(page)).menus.order.slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
  });

  test("동의한 뒤 돌아온 화면(login=ok)에서 시트가 뜬다 — 첫 로그인의 알림은 동의 뒤 한 번", async ({
    page,
    request,
  }) => {
    await scenario(request, { consentMode: "needed" });
    await setDevice(page, { menus: SWAPPED });
    await page.goto(`/auth/login?provider=kakao&next=${enc(NEXT)}`);
    await page.getByRole("button", { name: "모두 동의하고 시작하기" }).click();
    await expect(toast(page)).toHaveText("로그인했어요");
    await expect(sheet(page)).toBeVisible();
  });

  test("비회원은 요청 0 — 설정을 바꿔도 계정 요청이 없다", async ({
    page,
    request,
  }) => {
    let settingsRequests = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/auth/settings") settingsRequests += 1;
    });
    await page.goto("/font-size?st=105");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "크게", exact: true }).click();
    await page.goto("/layout?st=105");
    await page.waitForLoadState("networkidle");
    await page.getByRole("switch", { name: "토양 사용" }).click();
    await page.waitForTimeout(800);
    expect(settingsRequests).toBe(0);
    const c = await calls(request);
    expect(c.settingsReads).toBe(0);
    expect(c.settingsWrites).toBe(0);
    expect((await device(page)).font.step).toBe("large");
  });
});

test.describe("/auth/settings 직접 호출", () => {
  test("로그인 전 401 · 로그인 뒤 읽기 200 (캐시 안 함) · 틀린 값 400 · 다른 Origin 403", async ({
    page,
    request,
  }) => {
    expect(
      (await request.get("http://localhost:3101/auth/settings")).status(),
    ).toBe(401);
    await login(page);
    const ok = await page.context().request.get("/auth/settings");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toMatch(/no-store/);
    const bad = await page
      .context()
      .request.post("/auth/settings", { data: { theme: "blue" } });
    expect(bad.status()).toBe(400);
    const evil = await page.context().request.post("/auth/settings", {
      data: { theme: "dark" },
      headers: { origin: "https://evil.example" },
    });
    expect(evil.status()).toBe(403);
    expect((await calls(request)).settingsWrites).toBe(0);
  });
});
