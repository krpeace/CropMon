/** 화면 테마(밝게·어둡게) 고르기 규칙. 저장된 선택 → 휴대폰·PC 설정 → 라이트 순서. */
export type Theme = "light" | "dark";

/** 직접 고른 테마를 브라우저에 기억해 두는 이름. */
export const THEME_STORAGE_KEY = "cropmon-theme";

/** 저장된 글자를 테마로 읽는다. light·dark 가 아니면 null (기억 없음으로 본다). */
export function parseSavedTheme(value: string | null): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** 저장된 선택이 있으면 그것, 없으면 휴대폰·PC 설정을 따른다. */
export function resolveTheme(saved: Theme | null, systemDark: boolean): Theme {
  if (saved) return saved;
  return systemDark ? "dark" : "light";
}

/** 휴대폰 주소창·상태 표시줄 색(theme-color). 결정 0024 값 그대로. */
export const THEME_COLOR: Record<Theme, string> = {
  light: "rgb(242 242 247)",
  dark: "#000",
};
