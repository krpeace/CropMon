import { expect, test } from "./fixtures";

// 큰 글씨(150%)에서 데스크톱(1440)이 깨지지 않는지만 확인한다 (이슈 #172, 결정 0056).
// 큰 글씨 배치 바꿈(`big:` 변형)은 휴대폰 390 기준이고, 데스크톱 표(NationalTable)는 바꾸지 않는다 — 가로로 안 넘치면 된다.

for (const [name, path] of [
  ["종합", "/?st=101&crop=apple"],
  ["물", "/water?st=101&crop=apple"],
  ["온도", "/temperature?st=101&crop=apple"],
] as const) {
  test(`데스크톱 1440 · 150%: ${name} 화면이 가로로 넘치지 않는다`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "cropmon-font-scale",
        JSON.stringify({ v: 1, step: "xxlarge", follow: false }),
      );
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--fz"),
      ),
    ).toBe("1.5");
    const over = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}
