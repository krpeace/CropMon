import type { APIRequestContext } from "@playwright/test";

import { expect, test, type Page } from "./fixtures";

// 네이버 켬 (이슈 #189, 결정 0064). 이 서버(3102)는 MEMBERS_ENABLED=true · NAVER_LOGIN_ENABLED=true 다.
// 같은 빌드를 변수만 달리해 띄운 것 — 다시 빌드하지 않고 서버 변수만으로 네이버가 켜지는 것을 못 박는다.

test.describe.configure({ mode: "serial" });

const FAKE = "http://127.0.0.1:54321/__fake";
const enc = encodeURIComponent;

const reset = (request: APIRequestContext) => request.post(`${FAKE}/reset`);
const here = (page: Page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};
const loginButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "로그인", exact: true });

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test("표시 쿠키에 n 이 붙는다 (an)", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "cm_m",
  );
  expect(cookie?.value).toBe("an");
});

test("/auth/login?provider=custom:naver 는 공급자 화면으로 보낸다 (302)", async ({
  request,
}) => {
  const res = await request.get(
    "/auth/login?provider=custom%3Anaver&next=%2F",
    {
      maxRedirects: 0,
    },
  );
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toContain("provider=custom%3Anaver");
});

test("로그인 시트의 네이버 버튼이 링크가 되고, 누르면 로그인되어 보던 화면으로 돌아온다", async ({
  page,
}) => {
  await page.goto("/water?st=105&crop=apple");
  await page.waitForLoadState("networkidle");
  await loginButton(page).click();
  const dialog = page.getByRole("dialog", { name: "로그인" });
  const naver = dialog.getByRole("link", { name: "네이버 로그인" });
  await expect(naver).toHaveAttribute(
    "href",
    `/auth/login?provider=custom%3Anaver&next=${enc("/water?st=105&crop=apple")}`,
  );
  await expect(dialog.getByRole("button", { name: /준비 중/ })).toHaveCount(0);
  await naver.click();
  await expect(page.getByTestId("toast")).toHaveText("로그인했어요");
  await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
  await expect(
    page.locator("header").getByRole("button", { name: "내 계정" }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "cm_m",
  );
  expect(cookie?.value).toBe("in");
});

// 네이버 회원 탈퇴 — 한 번 더 로그인 + 토큰 삭제 (이슈 #197, 결정 0068). 이 서버(3102)는 가짜 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET ·
// 고리 주소 NAVER_API_BASE 를 가진다(진짜 네이버 호출 0). ⚠ 네이버 공식 문서를 못 읽어 요청 모양은 "우리가 이렇게 보낸다"를 못 박는 것이다.
test.describe("네이버 회원 탈퇴 (재로그인 + 토큰 삭제)", () => {
  type NaverCalls = {
    withdrawn: string[];
    reauth: {
      lastProviderToken: string | null;
      naverDeletes: {
        contentType: string;
        params: Record<string, string>;
      }[];
      authorizeCalls: {
        provider: string;
        authType: string | null;
        prompt: string | null;
        flow: string | null;
      }[];
    };
  };
  const calls = async (request: APIRequestContext) =>
    (await request.get(`${FAKE}/calls`)).json() as Promise<NaverCalls>;

  async function loginNaver(page: Page, request: APIRequestContext) {
    await request.post(`${FAKE}/scenario`, { data: { sameUser: true } });
    await page.goto(
      `/auth/login?provider=custom%3Anaver&next=${enc("/water?st=105&crop=apple")}`,
    );
    await page.waitForURL(/\/water\?/);
    await expect.poll(() => here(page)).toBe("/water?st=105&crop=apple");
  }
  async function pressWithdraw(page: Page) {
    await page.goto("/account/withdraw");
    await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
    await page.getByRole("button", { name: "탈퇴하기" }).click();
  }

  test("안내 줄이 네이버로 보인다 → 탈퇴하기 → 재인증 옵션으로 이동 → 돌아오면 지워지고 토큰 삭제 요청이 간다 → '탈퇴했어요' 한 줄", async ({
    page,
    request,
  }) => {
    await loginNaver(page, request);
    await page.goto("/account/withdraw");
    await expect(
      page.getByText(
        "탈퇴하기를 누르면 연결을 끊기 위해 네이버 로그인을 한 번 더 해요.",
      ),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
    await page.getByRole("button", { name: "탈퇴하기" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByTestId("toast")).toHaveText("탈퇴했어요");

    const c = await calls(request);
    expect(c.reauth.authorizeCalls.at(-1)).toEqual({
      provider: "custom:naver",
      prompt: null,
      authType: "reauthenticate",
      flow: "withdraw",
    });
    expect(c.withdrawn).toHaveLength(1);
    expect(c.reauth.naverDeletes).toHaveLength(1);
    const del = c.reauth.naverDeletes[0];
    expect(del.contentType).toContain("application/x-www-form-urlencoded");
    expect(del.params).toEqual({
      grant_type: "delete",
      client_id: "e2e-fake-naver-id",
      client_secret: "e2e-fake-naver-secret",
      access_token: c.reauth.lastProviderToken,
      service_provider: "NAVER",
    });
  });

  test("토큰 삭제가 실패해도 탈퇴는 끝나고 안내 한 줄이 더 붙는다", async ({
    page,
    request,
  }) => {
    await loginNaver(page, request);
    await request.post(`${FAKE}/scenario`, { data: { naverDelete: "fail" } });
    await pressWithdraw(page);
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByTestId("toast")).toContainText(
      "연결된 서비스는 각 계정 설정에서 해제할 수 있어요",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(1);
    expect(c.reauth.naverDeletes).toHaveLength(1);
  });

  test("다른 네이버 계정으로 다시 로그인하면 아무것도 지우지 않는다", async ({
    page,
    request,
  }) => {
    await loginNaver(page, request);
    await page.goto("/account/withdraw");
    await request.post(`${FAKE}/scenario`, { data: { reauthOther: true } });
    await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
    await page.getByRole("button", { name: "탈퇴하기" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByTestId("toast")).toContainText(
      "다른 계정으로 로그인해서 탈퇴하지 않았어요",
    );
    const c = await calls(request);
    expect(c.withdrawn).toHaveLength(0);
    expect(c.reauth.naverDeletes).toHaveLength(0);
  });
});
