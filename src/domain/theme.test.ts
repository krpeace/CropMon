import { describe, expect, it } from "vitest";

import { parseSavedTheme, resolveTheme, THEME_STORAGE_KEY } from "./theme";

describe("resolveTheme", () => {
  it("저장된 선택이 있으면 휴대폰 설정보다 우선한다", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("저장된 선택이 없으면 휴대폰 설정을 따른다", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });
});

describe("parseSavedTheme", () => {
  it("light·dark 만 읽는다", () => {
    expect(parseSavedTheme("light")).toBe("light");
    expect(parseSavedTheme("dark")).toBe("dark");
  });

  it("잘못된 값은 null 로 읽어 설정을 따르게 한다", () => {
    expect(parseSavedTheme("blue")).toBeNull();
    expect(parseSavedTheme("")).toBeNull();
    expect(parseSavedTheme(null)).toBeNull();
  });

  it("저장 이름은 cropmon-theme", () => {
    expect(THEME_STORAGE_KEY).toBe("cropmon-theme");
  });
});
