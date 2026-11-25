import { expect, test } from "./fixtures";

// /robots.txt — 이름을 밝히는 로봇에게 규칙을 알린다 (이슈 #209, 결정 0073).

test("/robots.txt 가 200 이고 AI 로봇 차단과 물음표 주소 차단을 담는다", async ({
  request,
}) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const text = await res.text();
  // Next.js 는 "User-Agent:" 로 쓴다. 로봇은 대소문자를 가리지 않는다.
  expect(text).toMatch(/^User-agent: GPTBot$/im);
  expect(text).toContain("Disallow: /*?");
  expect(text).toContain("Disallow: /farm$");
  expect(text).not.toMatch(/^Disallow: \/farm$/m);
});
