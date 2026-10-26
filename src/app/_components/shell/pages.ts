import type { PageKey } from "@/services/shell";

/** 아이콘 선 모양 (시안 그대로, 24×24). */
export const ICON_PATH = {
  home: "M3 10.5 12 3l9 7.5M5.5 8.8V20h4.5v-5.5h4V20h4.5V8.8",
  temperature: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 10v7.5",
  sunlight:
    "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  water: "M12 3C12 3 5.5 10 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10 12 3 12 3z",
  soil: "M3 15h18M5.5 19h13M12 15V9M12 11.5c0-3.2 2.2-5.5 6-5.5 0 3.4-2.4 5.5-6 5.5zM12 12c0-2.6-1.9-4.5-5-4.5 0 2.7 2 4.5 5 4.5z",
  market: "M4 4v16h16M8 15l3.5-4 3 2.5L20 7M16 7h4v4",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  play: "M8 5.5v13l10.5-6.5z",
  chevron: "M9 6l6 6-6 6",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  check: "M5 12.5l4.5 4.5L19 7.5",
} as const;

type Tab = {
  key: PageKey & keyof typeof ICON_PATH;
  href: string;
  label: string;
};

/** 위 메뉴 순서 (시안 그대로). 내 농장은 메뉴에 없고 로그인·안내에서 들어간다. */
export const TABS: readonly Tab[] = [
  { key: "home", href: "/", label: "종합" },
  { key: "temperature", href: "/temperature", label: "온도" },
  { key: "sunlight", href: "/sunlight", label: "햇빛" },
  { key: "water", href: "/water", label: "물" },
  { key: "soil", href: "/soil", label: "토양" },
  { key: "market", href: "/market", label: "도매시장" },
];

type PageInfo = { title: string; question: string; chip?: string };

/** 쪽 제목, 이 메뉴가 답할 질문, 제목 옆 회색 꼬리표. */
export const PAGE_INFO: Record<Exclude<PageKey, "home">, PageInfo> = {
  water: { title: "물", question: "오늘 물을 줘야 하나, 앞으로 3일은?" },
  temperature: {
    title: "온도",
    question: "생육이 평년보다 빠른가, 개화·수확은 언제쯤인가?",
  },
  sunlight: { title: "햇빛", question: "올해 햇빛은 충분했나?" },
  soil: {
    title: "토양",
    question: "우리 밭은 어떤 흙이고 양분은 어떤가?",
    chip: "준비 중",
  },
  market: {
    title: "도매시장",
    question: "지금 얼마에 팔리고, 앞으로 값은?",
    chip: "준비 중",
  },
  "my-farm": {
    title: "내 농장",
    question: "내 밭을 등록하면 내 밭 단위로 물 판정을 받아요.",
    chip: "회원제 미리보기",
  },
};
