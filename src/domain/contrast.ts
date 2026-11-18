/**
 * 색 대비 (WCAG 2.x). 글자는 배경과 4.5:1 이상이어야 한다 (이슈 #161: 위험 색 토큰 확인).
 * 화면 부품은 안 쓰고, 토큰이 바뀌어 대비가 떨어지는 것을 시험(`src/app/tokens.test.ts`)이 잡는 데 쓴다.
 */

export type Rgb = readonly [number, number, number];

/**
 * CSS 색 글자를 [r, g, b] 로 읽는다. `#rgb` · `#rrggbb` · `rgb(r g b)` · `rgb(r, g, b)`만 읽고,
 * 투명도(`/ 0.5`) · `var(…)` · 색 이름처럼 대비를 잴 수 없는 것은 null.
 */
export function parseColor(css: string): Rgb | null {
  const text = css.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const h =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) =>
      parseInt(h.slice(i, i + 2), 16),
    ) as unknown as Rgb;
  }

  const rgb =
    /^rgb\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})\s*\)$/.exec(
      text,
    );
  if (rgb) {
    const parts = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (parts.every((n) => n >= 0 && n <= 255)) return parts as unknown as Rgb;
  }
  return null;
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 상대 휘도 (0 = 검정, 1 = 흰색). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 대비비 (1 ~ 21). 두 색의 순서는 상관없다. 글자는 4.5 이상이 기준. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
