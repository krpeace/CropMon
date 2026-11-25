import { describe, expect, it } from "vitest";

import robots from "./robots";

const AI_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
];

const asList = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** robots.txt 규칙 한 줄이 주소(물음표 포함)에 걸리는지: 앞부분 일치 · `*` · 끝 `$` 만 지원. */
function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp(
    "^" +
      body
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return re.test(path);
}

const rules = robots().rules;
const list = Array.isArray(rules) ? rules : [rules];
const star = list.find((r) => asList(r.userAgent).includes("*"));
const disallowed = (path: string) =>
  asList(star?.disallow).some((r) => ruleMatches(r, path));

describe("robots()", () => {
  it("AI 학습 로봇 열 곳은 모두 Disallow: / 이다", () => {
    for (const bot of AI_BOTS) {
      const r = list.find((x) => asList(x.userAgent).includes(bot));
      expect(r, bot).toBeDefined();
      expect(asList(r?.disallow), bot).toEqual(["/"]);
    }
  });

  it("그 밖의 로봇(*) 은 /*? 와 개인 경로를 막는다", () => {
    const d = asList(star?.disallow);
    expect(d).toContain("/*?");
    for (const p of ["/api/", "/auth/", "/account", "/consent", "/my-farm"]) {
      expect(d, p).toContain(p);
    }
    expect(d).toContain("/farm$");
    expect(d).toContain("/farm/");
    expect(d).not.toContain("/farm");
  });

  it("/ 와 메뉴 기본 주소는 어떤 Disallow 에도 걸리지 않는다", () => {
    for (const p of [
      "/",
      "/farminfo",
      "/market",
      "/water",
      "/temperature",
      "/sunlight",
      "/soil",
      "/pest",
      "/outlook",
      "/diary",
      "/more",
      "/font-size",
      "/privacy",
      "/terms",
    ]) {
      expect(disallowed(p), p).toBe(false);
    }
  });

  it("물음표 조합 주소와 개인 · 내부 주소는 막힌다", () => {
    for (const p of [
      "/water?st=101&crop=apple",
      "/?st=101",
      "/water?st=101&crop=apple&d=2026-11-01",
      "/farm",
      "/farm/new",
      "/my-farm",
      "/account/settings",
      "/consent",
      "/api/health",
      "/auth/callback",
    ]) {
      expect(disallowed(p), p).toBe(true);
    }
  });

  it("사이트맵은 넣지 않는다", () => {
    expect(robots().sitemap).toBeUndefined();
  });
});
