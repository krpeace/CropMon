import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";

const DAY = 86_400_000;
const kstDate = (ms: number) =>
  new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * 시험이 보는 "지금"(ms). 평소에는 진짜 시각. E2E_TODAY(YYYY-MM-DD)가 있으면 그날로 하루 단위만 옮긴다(시각은 그대로).
 * 시험 코드의 Date.now() 대신 이것을 쓴다. 서버 쪽 시계는 e2e/fake-clock.mjs 가 같은 규칙으로 옮긴다.
 * (시험 실행기의 전역 Date 는 옮기지 않는다 — Playwright 내부 시계 설정이 어긋난다.)
 */
export const e2eNow = () => {
  const real = Date.now();
  const target = process.env.E2E_TODAY;
  if (!target) return real;
  const days =
    (Date.parse(`${target}T00:00:00Z`) -
      Date.parse(`${kstDate(real)}T00:00:00Z`)) /
    DAY;
  return real + days * DAY;
};

/** 시험이 보는 오늘의 한국 날짜 (YYYY-MM-DD). */
export const e2eToday = () => kstDate(e2eNow());

/**
 * 모든 화면 테스트가 쓰는 test. E2E_TODAY 가 있으면(날짜 바꿔 돌려 볼 때, 또는 1월 1~2일 자동 처리)
 * 브라우저 시계도 서버와 같은 날로 맞춘다. 없으면 진짜 시계 그대로.
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    if (process.env.E2E_TODAY) {
      await context.clock.install({ time: e2eNow() });
    }
    await provide(context);
  },
});
