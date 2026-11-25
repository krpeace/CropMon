import type { MetadataRoute } from "next";

// /robots.txt (결정 0073). 이름을 밝히는 로봇에게만 통한다.
// AI 학습용은 전부 막고, 나머지는 메뉴 기본 주소만 보게 한다(물음표 조합 · 개인 · 내부 주소는 막음).
const AI_TRAINING_BOTS = [
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_TRAINING_BOTS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/*?", // 지점 · 작물 · 날짜 · 흙 · kc 조합 주소
          "/api/",
          "/auth/",
          "/account",
          "/consent",
          // "/farm" 접두어는 /farminfo(농사정보 메뉴)까지 막으므로 정확히 /farm 과 그 아래만 막는다.
          "/farm$",
          "/farm/",
          "/my-farm",
        ],
      },
    ],
  };
}
