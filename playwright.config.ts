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
// 회원제 스위치를 "켠" 서버(이슈 #182, 결정 0061). 같은 빌드를 환경변수만 달리해 따로 띄운다. 3100(끔)은 지금 알파와 똑같아야 한다.
const PORT_MEMBERS_ON = 3101;
const BASE_URL_MEMBERS_ON = `http://localhost:${PORT_MEMBERS_ON}`;
// 회원제 켬 + 네이버 켬 (이슈 #189, 결정 0064). 같은 빌드에 서버 변수 NAVER_LOGIN_ENABLED 만 더한다.
const PORT_NAVER_ON = 3102;
const BASE_URL_NAVER_ON = `http://localhost:${PORT_NAVER_ON}`;

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
        /(theme|national-mobile|crop-sheet-mobile|tap-targets|selection-mobile|home-mobile|phone-feedback-mobile|font-size-mobile|home-notice|large-text-mobile|legal-mobile|layout-mobile|members-auth|members-sheet|members-naver|login-sheet-mobile)\.spec\.ts/,
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
        /(theme|national-mobile|tabbar|more|font-scale|context-bar-mobile|bottom-sheet-mobile|auto-hide-mobile|more-bottom|footer|crop-sheet-mobile|tap-targets|selection-mobile|home-mobile|phone-feedback-mobile|font-size-mobile|home-notice|large-text-mobile|legal-mobile|layout-mobile)\.spec\.ts/,
    },
    // 회원제 스위치 "켬" 전용 (로그인 → 돌아옴 → 로그아웃). 가짜 로그인 흉내의 시나리오가 전역 값이라 한 파일 안에서 차례로 돈다.
    {
      name: "members-on",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: BASE_URL_MEMBERS_ON,
      },
      testMatch: /(members-auth|members-sheet)\.spec\.ts/,
      fullyParallel: false,
      // 가짜 로그인 흉내의 호출 횟수 · 시나리오는 전역 값이라, 다른 시험이 다 끝난 뒤에 돈다(끔 서버 시험과 섞이지 않게).
      dependencies: ["desktop", "mobile"],
    },
    // 회원제 켬 · 휴대폰 크기 (로그인 시트 · 내 계정 시트). 가짜 로그인 흉내가 전역 값이라 members-on 이 끝난 뒤에 돈다.
    {
      name: "members-on-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        baseURL: BASE_URL_MEMBERS_ON,
      },
      testMatch: /login-sheet-mobile\.spec\.ts/,
      fullyParallel: false,
      dependencies: ["members-on"],
    },
    // 회원제 켬 + 네이버 켬. 마찬가지로 앞 프로젝트가 끝난 뒤에 돈다.
    {
      name: "members-naver",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: BASE_URL_NAVER_ON,
      },
      testMatch: /members-naver\.spec\.ts/,
      fullyParallel: false,
      dependencies: ["members-on-mobile"],
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
    {
      command: `npm run start -- -p ${PORT_MEMBERS_ON}`,
      env: { ...serverEnv, MEMBERS_ENABLED: "true" },
      url: BASE_URL_MEMBERS_ON,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run start -- -p ${PORT_NAVER_ON}`,
      env: {
        ...serverEnv,
        MEMBERS_ENABLED: "true",
        NAVER_LOGIN_ENABLED: "true",
      },
      url: BASE_URL_NAVER_ON,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
