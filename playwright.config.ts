import { defineConfig, devices } from "@playwright/test";

/**
 * 화면 테스트. 실제 브라우저로 쪽을 열어 본다.
 * 배포용으로 만든 화면(npm run build)을 띄워서 검사하므로, 먼저 build 를 해 둔다.
 * 개발 서버(npm run dev, 3000)와 섞이지 않게 3100 번에 따로 띄운다.
 * DB 는 진짜 대신 가짜 Supabase(54321)를 읽는다.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
      testIgnore:
        /(theme|national-mobile|crop-sheet-mobile|tap-targets)\.spec\.ts/,
    },
    // 다크모드 화면 테스트 전용 휴대폰 크기 (theme·national-mobile spec 만 돈다)
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch:
        /(theme|national-mobile|tabbar|crop-sheet-mobile|tap-targets)\.spec\.ts/,
    },
  ],
  // 가짜 Supabase(e2e/fake-supabase.mjs)를 먼저 띄운다. 화면은 build 때 NEXT_PUBLIC_SUPABASE_URL 을
  // http://127.0.0.1:54321 로 만들어 두어야 이 가짜를 읽는다 (CI 와 같음).
  webServer: [
    {
      command: "node e2e/fake-supabase.mjs",
      url: "http://127.0.0.1:54321/",
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `npm run start -- -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
