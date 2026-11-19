import type { MenuId } from "@/domain/menus";
import type { PageKey } from "@/services/shell";

/** 아이콘 선 모양 (시안 그대로, 24×24). */
export const ICON_PATH = {
  crop: "M12 20.5V11M12 13c0-4 2.8-7 7.5-7 0 4.2-3 7-7.5 7zM12 14.5c0-3.2-2.4-5.6-6.3-5.6 0 3.3 2.5 5.6 6.3 5.6z",
  home: "M3 10.5 12 3l9 7.5M5.5 8.8V20h4.5v-5.5h4V20h4.5V8.8",
  temperature: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 10v7.5",
  sunlight:
    "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  water: "M12 3C12 3 5.5 10 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10 12 3 12 3z",
  soil: "M3 15h18M5.5 19h13M12 15V9M12 11.5c0-3.2 2.2-5.5 6-5.5 0 3.4-2.4 5.5-6 5.5zM12 12c0-2.6-1.9-4.5-5-4.5 0 2.7 2 4.5 5 4.5z",
  market: "M4 4v16h16M8 15l3.5-4 3 2.5L20 7M16 7h4v4",
  outlook: "M6 3h9l4 4v14H6zM14 3v5h5M9.5 17v-3M12.5 17v-6M15.5 17v-4",
  farminfo:
    "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6",
  pest: "M12 8a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0v-3a4 4 0 0 1 4-4zM9.5 8.5 8 6M14.5 8.5 16 6M8 12H4.5M19.5 12H16M8 15.5l-3 2M16 15.5l3 2M12 8v11",
  diary:
    "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7zM7 3v18M4.5 7.5H7M4.5 12H7M4.5 16.5H7M11 8h4M11 12h4",
  more: "M4 7h16M4 12h16M4 17h16",
  notice: "M4 10v4h3l6 4V6l-6 4zM16.5 9.5a3.5 3.5 0 0 1 0 5",
  inquiry: "M4 5h16v11H9l-5 4z",
  faq: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.5v.01",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5",
  layout: "M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4",
  text: "M3 19 8 6l5 13M4.8 14.5h6.4M14.5 19l3.2-8.5L21 19M15.6 16h4.3",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  play: "M8 5.5v13l10.5-6.5z",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5 20 20",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  sun: "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7z",
  // 내 계정 시트(이슈 #189)
  user: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0",
  farm: "M3 20.5h18M5 20.5V10l7-5 7 5v10.5M9.5 20.5v-5h5v5",
  logout: "M10 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H10M15 8l4 4-4 4M19 12H9.5",
} as const;

/** 메뉴 ID → 아이콘 이름. 메뉴의 ID·이름·주소는 src/domain/menus.ts 가 갖는다. */
export const MENU_ICON: Record<MenuId, keyof typeof ICON_PATH> = {
  home: "home",
  water: "water",
  temp: "temperature",
  sun: "sunlight",
  outlook: "outlook",
  price: "market",
  farminfo: "farminfo",
  pest: "pest",
  soil: "soil",
  diary: "diary",
};

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
    title: "시세",
    question: "지금 얼마에 팔리고, 앞으로 값은?",
    chip: "준비 중",
  },
  outlook: {
    title: "관측",
    question: "이번 달 재배면적과 작황, 출하는 어떤가?",
    chip: "준비 중",
  },
  farminfo: {
    title: "농사정보",
    question: "이번 주에는 어떤 농사일을 해야 하나?",
    chip: "준비 중",
  },
  pest: {
    title: "병해충",
    question: "지금 조심해야 할 병해충은?",
    chip: "준비 중",
  },
  diary: {
    title: "일지",
    question: "오늘 한 농사일을 어떻게 남길까?",
    chip: "준비 중",
  },
  "my-farm": {
    title: "내 농장",
    question: "내 밭을 등록하면 내 밭 단위로 물 판정을 받아요.",
    chip: "회원제 미리보기",
  },
};
