import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// 동의 화면 (이슈 #191, 결정 0065) — 스위치 "켬" 서버(3101), 데스크톱 1440. 가짜 Supabase 가 동의 상태를 흉내 낸다.
// 가짜의 시나리오는 전역 값이라 이 파일은 차례로(serial) 돈다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;
const TERMS = "terms-2027-01-01";
const PRIVACY = "privacy-2027-01-01";
const NEXT = "/water?st=105&crop=apple";
/** 화면은 "수집·이용" 같은 가운뎃점 낱말에 줄바꿈 금지 글자(U+2060)를 둔다(P2, 결정 0048) — 글자는 같고 시험도 같은 규칙으로 견준다. */
const tie = (text: string) =>
  text.replace(/(?<=[\p{L}\p{N}])·(?=[\p{L}\p{N}])/gu, "⁠·⁠");

const scenario = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FAKE}/scenario`, { data: body });
const calls = async (request: APIRequestContext) =>
  (await request.get(`${FAKE}/calls`)).json() as Promise<{
    consent: number;
    consentLast: { terms: string; privacy: string } | null;
  }>;
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const consentDialog = (page: Page) =>
  page.getByRole("dialog", { name: "CropMon을 시작하려면 동의가 필요해요" });
const agreeAll = (page: Page) =>
  page.getByRole("button", { name: "모두 동의하고 시작하기" });
const toast = (page: Page) => page.getByTestId("toast");
const loginUrl = (next = NEXT) =>
  `/auth/login?provider=kakao&next=${enc(next)}`;

/** 동의 전 새 회원(같은 번호)으로 카카오 로그인 → 동의 화면이 뜰 때까지. */
async function loginNeedingConsent(
  page: Page,
  request: APIRequestContext,
  next = NEXT,
) {
  await scenario(request, { consentMode: "needed", sameUser: true });
  await page.goto(loginUrl(next));
  await expect(consentDialog(page)).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/reset`);
});

test.describe("첫 로그인 → 동의 화면", () => {
  test("동의 전 회원은 /consent?next=<보던 화면> 으로 가고, 확정 문구가 글자 그대로 보인다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    expect(here(page)).toBe(`/consent?next=${enc(NEXT)}`);
    const dialog = consentDialog(page);
    for (const text of [
      "(필수) 만 14세 이상입니다",
      "(필수) 이용약관 동의",
      "(필수) 개인정보 수집·이용 안내 확인",
      "· 받는 정보: 소셜 계정 회원 번호·이름(별명)·이메일, 농장 주소와 관수 기록",
      "· 쓰는 곳: 내 농장 토양 수분 계산. 통계에는 알아볼 수 없게 묶어서만 써요",
      "· 보관: 탈퇴하면 바로 삭제(암호화 백업은 최대 7일)",
      "동의하지 않으면 회원 기능(내 농장·관수 기록)은 쓸 수 없어요. 로그인 없이 보던 화면은 그대로 쓸 수 있어요.",
      "동의하지 않고 나가면 로그인 정보는 24시간 안에 자동으로 지워져요.",
    ]) {
      await expect(
        dialog.getByText(tie(text), { exact: true }),
        text,
      ).toBeVisible();
    }
    await expect(
      dialog.getByRole("button", { name: "동의하지 않고 나가기" }),
    ).toBeVisible();
    // 새 줄 안내는 "동의하지 않고 나가기" 버튼 바로 위, 기존 안내 줄 아래
    const y = async (t: string) =>
      (await dialog.getByText(tie(t), { exact: true }).boundingBox())!.y;
    const notice = await y(
      "동의하지 않으면 회원 기능(내 농장·관수 기록)은 쓸 수 없어요. 로그인 없이 보던 화면은 그대로 쓸 수 있어요.",
    );
    const leaveNotice = await y(
      "동의하지 않고 나가면 로그인 정보는 24시간 안에 자동으로 지워져요.",
    );
    const leave = (await dialog
      .getByRole("button", { name: "동의하지 않고 나가기" })
      .boundingBox())!.y;
    expect(notice).toBeLessThan(leaveNotice);
    expect(leaveNotice).toBeLessThan(leave);
  });

  test('모두 동의하고 시작하기 → 보던 화면 + "로그인했어요", 판 값은 서버가 넣은 지금 판', async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await agreeAll(page).click();
    await expect(toast(page)).toHaveText("로그인했어요");
    await expect.poll(() => here(page)).toBe(NEXT);
    const c = await calls(request);
    expect(c.consent).toBe(1);
    expect(c.consentLast).toEqual({ terms: TERMS, privacy: PRIVACY });
  });

  test("다시 로그인하면 동의 화면 없이 바로 보던 화면 + 알림", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await agreeAll(page).click();
    await expect.poll(() => here(page)).toBe(NEXT);
    await page.context().clearCookies();
    await page.goto(loginUrl("/water?st=108"));
    await page.waitForURL(/\/water\?/);
    await expect(toast(page)).toHaveText("로그인했어요");
    expect(here(page)).not.toContain("consent");
    expect((await calls(request)).consent).toBe(1); // 다시 기록하지 않음
  });

  test("동의하지 않고 나가기 → 로그아웃 → 보던 화면, 알림 없음", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await consentDialog(page)
      .getByRole("button", { name: "동의하지 않고 나가기" })
      .click();
    await page.waitForURL(/\/water\?/);
    await expect.poll(() => here(page)).toBe(NEXT);
    await expect(toast(page)).toHaveCount(0);
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "로그인", exact: true }),
    ).toBeVisible();
    expect((await calls(request)).consent).toBe(0);
    expect(
      (await page.context().cookies()).filter((c) =>
        /^sb-.+-auth-token/.test(c.name),
      ),
    ).toHaveLength(0);
  });

  test("동의한 뒤 /consent 를 열면 next 로 실제로 이동한다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await agreeAll(page).click();
    await expect.poll(() => here(page)).toBe(NEXT);
    await page.goto(`/consent?next=${enc("/water?st=108")}`);
    await page.waitForURL(/\/water\?st=108/);
    expect(here(page)).toBe("/water?st=108");
  });

  test("로그인하지 않고 /consent 를 열면 로그인 시트로 간다", async ({
    page,
  }) => {
    await page.goto(`/consent?next=${enc(NEXT)}`);
    await expect(
      page.getByRole("dialog", { name: "로그인", exact: true }),
    ).toBeVisible();
    expect(here(page)).toBe(
      `/?login=1&next=${enc(`/consent?next=${enc(NEXT)}`)}`,
    );
  });
});

test.describe("체크 칸 · 큰 버튼", () => {
  test('셋을 손으로 다 켜면 큰 버튼 글자가 "동의하고 시작하기"로 바뀌고, 하나 끄면 되돌아온다', async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const dialog = consentDialog(page);
    const boxes = [
      dialog.getByRole("checkbox", { name: "(필수) 만 14세 이상입니다" }),
      dialog.getByRole("checkbox", { name: "(필수) 이용약관 동의" }),
      // 접근성 이름에서는 줄바꿈 금지 글자(U+2060)가 빠질 수 있어 \W* 로 받는다
      dialog.getByRole("checkbox", {
        name: /\(필수\) 개인정보 수집\W*·\W*이용 안내 확인/,
      }),
    ];
    await expect(agreeAll(page)).toBeVisible();
    for (const b of boxes) await b.check();
    await expect(
      dialog.getByRole("button", { name: "동의하고 시작하기", exact: true }),
    ).toBeVisible();
    await expect(agreeAll(page)).toHaveCount(0);
    await boxes[1].uncheck();
    await expect(agreeAll(page)).toBeVisible();
  });

  test("일부만 켜고 눌러도 셋 모두로 기록하고 시작한다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await consentDialog(page)
      .getByRole("checkbox", { name: "(필수) 만 14세 이상입니다" })
      .check();
    await agreeAll(page).click();
    await expect.poll(() => here(page)).toBe(NEXT);
    expect((await calls(request)).consentLast).toEqual({
      terms: TERMS,
      privacy: PRIVACY,
    });
  });

  test("동의 폼은 진짜 폼 POST 다 — 자바스크립트 없이도 보낼 수 있는 모양 (체크 칸 이름 · 보낼 곳 · 나가기는 따로 폼)", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const forms = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[role='dialog'] form")).map(
        (f) => ({
          method: (f as HTMLFormElement).method,
          action:
            new URL((f as HTMLFormElement).action).pathname +
            new URL((f as HTMLFormElement).action).search,
          submit:
            (f.querySelector("button[type='submit']") as HTMLElement | null)
              ?.textContent ?? "",
          inputs: Array.from(f.querySelectorAll("input[type='checkbox']")).map(
            (i) => (i as HTMLInputElement).name,
          ),
        }),
      ),
    );
    expect(forms).toEqual([
      {
        method: "post",
        action: `/auth/consent?next=${enc(NEXT)}`,
        submit: "모두 동의하고 시작하기",
        inputs: ["age14", "terms", "privacy"],
      },
      {
        method: "post",
        action: `/auth/signout?next=${enc(NEXT)}`,
        submit: "동의하지 않고 나가기",
        inputs: [],
      },
    ]);
    // 두 단추는 [보기]와 달리 type=submit 이고 서로 다른 폼이다 — [보기]는 type=button 이라 폼을 보내지 않는다
    const viewTypes = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("[role='dialog'] button[aria-label$='보기']"),
      ).map((b) => (b as HTMLButtonElement).type),
    );
    expect(viewTypes).toEqual(["button", "button"]);
  });
});

test.describe("[보기] — 화면을 떠나지 않고 본문을 본다", () => {
  test("이용약관 · 개인정보처리방침 본문이 같은 화면에서 열리고 돌아갈 수 있다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const before = page.url();
    for (const [name, region, heading] of [
      ["이용약관 보기", "이용약관 본문", "CropMon 이용약관"],
      [
        "개인정보처리방침 보기",
        "개인정보처리방침 본문",
        "CropMon 개인정보처리방침",
      ],
    ] as const) {
      await consentDialog(page).getByRole("button", { name }).click();
      const panel = page.getByRole("region", { name: region });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { name: heading })).toBeVisible();
      expect(page.url()).toBe(before);
      await panel
        .getByRole("button", { name: "동의 화면으로 돌아가기" })
        .click();
      await expect(panel).toBeHidden();
      await expect(consentDialog(page)).toBeVisible();
      expect(page.url()).toBe(before);
    }
  });

  test("[보기]를 눌러도 체크 칸 상태가 그대로다", async ({ page, request }) => {
    await loginNeedingConsent(page, request);
    const terms = consentDialog(page).getByRole("checkbox", {
      name: "(필수) 이용약관 동의",
    });
    await terms.check();
    await consentDialog(page)
      .getByRole("button", { name: "이용약관 보기" })
      .click();
    await page.getByRole("button", { name: "동의 화면으로 돌아가기" }).click();
    await expect(terms).toBeChecked();
  });
});

test.describe("데스크톱 창 — 출구는 하나", () => {
  test("× 가 없고, Esc 로도 뒤판을 눌러도 안 닫힌다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const dialog = consentDialog(page);
    expect((await dialog.boundingBox())!.width).toBeCloseTo(520, 0);
    await expect(page.getByRole("button", { name: "닫기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "×" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    expect(here(page)).toBe(`/consent?next=${enc(NEXT)}`);
  });

  test("덮인 머리글로 Tab 이 새지 않는다 (뒤 화면은 inert)", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    // 화면이 살아난 뒤(덮인 것에 inert 가 걸린 뒤)부터 본다 — 서버가 그린 HTML 만 있을 때는 아직 걸리기 전이다
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector("header") as HTMLElement | null)?.inert,
        ),
      )
      .toBe(true);
    // Tab 을 여러 번(끝까지 돌 만큼) 눌러도 초점이 덮인 머리글 · 바닥글 · 탭바에 닿지 않는다
    const landed: boolean[] = [];
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      landed.push(
        await page.evaluate(
          () => !!document.activeElement?.closest("header, footer, nav"),
        ),
      );
    }
    expect(landed.some(Boolean)).toBe(false);
    // 머리글 · 바닥글이 inert 라서 화면 읽기와 키보드에서 빠진다 (동의 화면이 든 main 은 inert 가 아니다)
    const inert = await page.evaluate(() =>
      ["header", "footer"].map(
        (sel) =>
          (document.querySelector(sel) as HTMLElement | null)?.inert ?? true,
      ),
    );
    expect(inert).toEqual([true, true]);
  });
});

test.describe("동의 전 회원 기능 막기", () => {
  test("동의 전에 /account 를 열면 /consent?next=%2Faccount 로 가고, 동의하면 /account 가 열린다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request, "/water?st=105");
    // 동의 화면을 닫지 않고 로그인 필요 주소를 연다(탭을 닫았다 돌아온 상황)
    await page.goto("/account");
    await page.waitForURL(/\/consent/);
    expect(here(page)).toBe(`/consent?next=${enc("/account")}`);
    await agreeAll(page).click();
    await page.waitForURL(/\/account/);
    await expect.poll(() => here(page)).toBe("/account");
    // L6-1(이슈 #195)부터 /account 는 실제 회원 정보 화면이다
    await expect(
      page.getByRole("heading", { name: "회원 정보", level: 1 }),
    ).toBeVisible();
  });

  test("/consent 자신은 관문을 지나지 않는다 — 동의 전 회원이 /consent 를 열어도 돌고 돌지 않는다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    for (let i = 0; i < 3; i += 1) {
      await page.goto(`/consent?next=${enc("/account")}`);
      await expect(consentDialog(page)).toBeVisible();
      expect(here(page)).toBe(`/consent?next=${enc("/account")}`);
    }
  });

  test("동의한 회원은 /account 가 그냥 열린다", async ({ page, request }) => {
    await loginNeedingConsent(page, request);
    await agreeAll(page).click();
    await expect.poll(() => here(page)).toBe(NEXT);
    await page.goto("/account");
    expect(here(page)).toBe("/account");
    // L6-1(이슈 #195)부터 /account 는 실제 회원 정보 화면이다
    await expect(
      page.getByRole("heading", { name: "회원 정보", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("저장 실패 · 읽기 실패 · 위조", () => {
  test("저장에 실패하면 동의 화면에 머물고 안내 한 줄이 뜬다 (로그인한 채)", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    await scenario(request, { consentSave: "fail" });
    await agreeAll(page).click();
    await expect(consentDialog(page)).toBeVisible();
    expect(here(page)).toBe(`/consent?next=${enc(NEXT)}&consent=failed`);
    await expect(
      page.getByText("동의를 저장하지 못했어요. 잠시 뒤 다시 해 주세요", {
        exact: true,
      }),
    ).toBeVisible();
    // 다시 시도하면 된다
    await scenario(request, { consentSave: "ok" });
    await agreeAll(page).click();
    await expect.poll(() => here(page)).toBe(NEXT);
  });

  test("동의 읽기가 실패하면 로그인은 되고 동의 화면이 뜬다", async ({
    page,
    request,
  }) => {
    await scenario(request, { membersRead: "fail", sameUser: true });
    await page.goto(loginUrl());
    await page.waitForURL(/\/consent/);
    await expect(consentDialog(page)).toBeVisible();
    expect(
      (await page.context().cookies()).some((c) =>
        /^sb-.+-auth-token/.test(c.name),
      ),
    ).toBe(true);
  });

  test("폼 · 주소로 위조한 판 값은 무시하고 서버가 지금 판을 넣는다", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const res = await page
      .context()
      .request.post(`/auth/consent?next=${enc("/")}&terms_version=terms-evil`, {
        form: {
          terms_version: "terms-evil",
          privacy_version: "privacy-evil",
          p_terms_version: "hack",
        },
        maxRedirects: 0,
      });
    expect(res.status()).toBe(303);
    expect((await calls(request)).consentLast).toEqual({
      terms: TERMS,
      privacy: PRIVACY,
    });
  });

  test("다른 사이트의 Origin 이면 403 이고 기록하지 않는다 · GET 은 405", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const evil = await page.context().request.post("/auth/consent?next=%2F", {
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(evil.status()).toBe(403);
    const get = await page
      .context()
      .request.get("/auth/consent", { maxRedirects: 0 });
    expect(get.status()).toBe(405);
    expect((await calls(request)).consent).toBe(0);
  });

  test("로그인 쿠키는 SameSite=Lax 다 (다른 사이트에서 보낸 POST 에는 세션이 실리지 않는다)", async ({
    page,
    request,
  }) => {
    await loginNeedingConsent(page, request);
    const session = (await page.context().cookies()).filter((c) =>
      /^sb-.+-auth-token(\.\d+)?$/.test(c.name),
    );
    expect(session.length).toBeGreaterThan(0);
    for (const c of session) expect(c.sameSite, c.name).toBe("Lax");
  });
});
