import { expect, test } from "./fixtures";

// 글씨 크기 화면 /font-size — 데스크톱(1440, 주소로 열림). 들어가는 길(내 계정)은 로그인 이슈에서 붙인다 (이슈 #168).

test("데스크톱: /font-size 가 열리고 단계를 바꾸면 --fz 가 바뀐다", async ({
  page,
}) => {
  await page.goto("/font-size?st=101&crop=apple");
  await expect(
    page.getByRole("heading", { level: 1, name: "글씨 크기" }),
  ).toBeVisible();
  const fz = () =>
    page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fz").trim(),
    );
  expect(await fz()).toBe("1");
  await page.getByRole("button", { name: "크게", exact: true }).click();
  await expect.poll(fz).toBe("1.15");
  await expect(page.getByTestId("font-now")).toHaveText(
    "지금 글씨 크기 크게 115%",
  );
  // 새로고침해도 그대로
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await fz()).toBe("1.15");
});
