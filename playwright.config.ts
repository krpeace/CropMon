import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * 화면 테스트. 실제 브라우저로 쪽을 열어 본다.
 * 배포용으로 만든 화면(npm run build)을 띄워서 검사하므로, 먼저 build 를 해 둔다.
 * 개발 서버(npm run dev, 3000)와 섞이지 않게 3100 번에 따로 띄운다.
 * DB 는 진짜 대신 가짜 Supabase(54321)를 읽는다.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// "오늘" 맞추기. E2E_TODAY(YYYY-MM-DD)를 주면 그날로 돌려 본다. 안 줬는데 한국 날짜가 1월 1~3일이면
// 올해 자료가 거의 없어(서귀포 189 의 "3일 전"이 작년 12월 31일이 됨) 그해 1월 4일로 자동으로 잡는다 (회원제 개시일 PR 이 막히지 않게).
// 가짜 Supabase · 화면 서버는 NODE_OPTIONS 로, 시험 실행기와 브라우저는 e2e/fixtures.ts 가 같은 날로 맞춘다.
const realToday = new Date(Date.now() + 9 * 3_600_000)
  .toISOString()
  .slice(0, 10);
if (!process.env.E2E_TODAY && /^\d{4}-01-0[123]$/.test(realToday)) {
  process.env.E2E_TODAY = `${realToday.slice(0, 4)}-01-04`;
}
// 서버 둘(가짜 Supabase · 화면)에만 시계 옮기기 파일을 미리 읽힌다. 시험 실행기는 e2e/fixtures.ts 의 e2eNow() 를 쓴다.
const serverEnv: Record<string, string> = process.env.E2E_TODAY
  ? {
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(path.resolve("e2e/fake-clock.mjs")).href}`.trim(),
    }
  : {};

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
        /(theme|national-mobile|crop-sheet-mobile|tap-targets|selection-mobile)\.spec\.ts/,
    },
    // 휴대폰 크기 전용 화면 테스트 (testMatch 의 spec 만 돈다)
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch:
        /(theme|national-mobile|tabbar|more|font-scale|context-bar-mobile|bottom-sheet-mobile|crop-sheet-mobile|tap-targets|selection-mobile)\.spec\.ts/,
    },
  ],
  // 가짜 Supabase(e2e/fake-supabase.mjs)를 먼저 띄운다. 화면은 build 때 NEXT_PUBLIC_SUPABASE_URL 을
  // http://127.0.0.1:54321 로 만들어 두어야 이 가짜를 읽는다 (CI 와 같음).
  webServer: [
    {
      command: "node e2e/fake-supabase.mjs",
      env: serverEnv,
      url: "http://127.0.0.1:54321/",
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `npm run start -- -p ${PORT}`,
      env: serverEnv,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
