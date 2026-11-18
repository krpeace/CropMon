import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor, type Rgb } from "@/domain/contrast";

// 실제 tokens.css 의 값을 읽어 확인한다 — 토큰이 바뀌어 대비가 떨어지면 이 시험이 잡는다 (이슈 #161).
const css = readFileSync(
  fileURLToPath(new URL("./tokens.css", import.meta.url)),
  "utf-8",
);

// 라이트 값은 맨 앞 @theme, 다크 값은 :root[data-theme="dark"] 블록 안에 있다.
const DARK_AT = css.indexOf(':root[data-theme="dark"]');
const parts = { light: css.slice(0, DARK_AT), dark: css.slice(DARK_AT) };

function token(mode: "light" | "dark", name: string): Rgb {
  const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(parts[mode]);
  if (!m) throw new Error(`${mode} --color-${name} 이 tokens.css 에 없어요`);
  const color = parseColor(m[1].replace(/\/\*.*?\*\//g, "").trim());
  if (!color) throw new Error(`--color-${name} 을 읽을 수 없어요: ${m[1]}`);
  return color;
}

const MIN_TEXT = 4.5; // 글자 대비 기준 (WCAG AA)

describe("tokens.css 구조", () => {
  it("다크 블록을 찾았다", () => {
    expect(DARK_AT).toBeGreaterThan(0);
  });
});

describe("--color-danger (위험 색: 회원탈퇴 · 지우기 글자)", () => {
  it("라이트 rgb(196 43 28), 다크 rgb(255 105 97) (이슈 #161 · 시안 --cm-danger)", () => {
    expect(token("light", "danger")).toEqual([196, 43, 28]);
    expect(token("dark", "danger")).toEqual([255, 105, 97]);
  });

  it("라이트: 글자가 흰 카드와 바탕(grouped)에서 4.5:1 이상", () => {
    const danger = token("light", "danger");
    expect(
      contrastRatio(danger, token("light", "card")),
    ).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(contrastRatio(danger, token("light", "bg"))).toBeGreaterThanOrEqual(
      MIN_TEXT,
    );
  });

  it("다크: 글자가 다크 카드와 검정 바탕에서 4.5:1 이상", () => {
    const danger = token("dark", "danger");
    expect(contrastRatio(danger, token("dark", "card"))).toBeGreaterThanOrEqual(
      MIN_TEXT,
    );
    expect(contrastRatio(danger, token("dark", "bg"))).toBeGreaterThanOrEqual(
      MIN_TEXT,
    );
  });
});

describe("--color-on-danger (위험 색 바탕 위의 글자: 탈퇴하기 버튼)", () => {
  it("라이트는 흰 글자, 다크는 어두운(검정) 글자", () => {
    expect(token("light", "on-danger")).toEqual([255, 255, 255]);
    expect(token("dark", "on-danger")).toEqual([0, 0, 0]);
  });

  it("위험 색 바탕 위에서 글자 대비 4.5:1 이상 (라이트 · 다크 모두)", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(
        contrastRatio(token(mode, "on-danger"), token(mode, "danger")),
        mode,
      ).toBeGreaterThanOrEqual(MIN_TEXT);
    }
  });

  it("다크에서 흰 글자는 위험 색 바탕 위에서 부족하다 (그래서 글자 색 토큰을 따로 둔다)", () => {
    expect(
      contrastRatio([255, 255, 255], token("dark", "danger")),
    ).toBeLessThan(MIN_TEXT);
  });
});
