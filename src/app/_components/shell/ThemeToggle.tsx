"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  parseSavedTheme,
  resolveTheme,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/domain/theme";

import { Icon } from "../ui/Icon";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 사생활 보호 모드 등에서 저장소가 막혀 있어도 화면은 돌아가야 한다. */
function readSaved(): Theme | null {
  try {
    return parseSavedTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 화면 테마와 주소창 색(theme-color meta)을 함께 바꾼다. meta 가 없으면 화면 테마만 바꾼다. */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

/** 화면의 현재 테마는 <html data-theme> 하나가 갖는다. 바뀌면 다시 그린다. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const getTheme = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const getServerTheme = (): Theme => "light";

/** 헤더의 해·달 버튼. 누르면 바꾸고 기억한다. 기억이 없을 땐 휴대폰 설정이 바뀌는 대로 따른다. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
      if (readSaved() === null) applyTheme(resolveTheme(null, media.matches));
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const dark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "라이트 모드로 보기" : "다크 모드로 보기"}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // 저장이 안 돼도 이번 화면은 바뀐다.
        }
      }}
      className="bg-fill/12 text-ink flex size-11 flex-none cursor-pointer items-center justify-center rounded-full"
    >
      <Icon name={dark ? "sun" : "moon"} size={22} />
    </button>
  );
}
