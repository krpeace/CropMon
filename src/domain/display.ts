/**
 * 공통 표시 규칙: 줄바꿈 금지 공백으로 묶기 (이슈 #153, 결정 0048, 디자인 규칙 v0.4.6 12절).
 * 숫자와 단위("35 mm"), 날짜 조각("2026년 12월 1일"), "약"과 숫자, 끝의 "›"가 따로 떨어져 다음 줄로 넘어가지 않게 한다.
 * 두 가지로 쓴다: ① 값을 만드는 함수(valueUnit 등)가 처음부터 묶인 글을 돌려준다 — 새 화면의 기본 방법.
 * ② 이미 있는 고정 문구는 keepTogether(text) 로 한 번에 묶는다.
 * U+00A0 은 숫자 · 단위 · 날짜에, U+2060 은 가운뎃점 낱말에만 쓴다(복사 · 찾기에 보이지 않는 문자가 섞이는 단점이 있어서).
 */

/** 줄바꿈 금지 공백 (no-break space). 숫자 + 단위, 날짜 조각, "약" + 숫자에 쓴다. */
export const NBSP = " ";

/** 단어 결합자 (word joiner, 보이지 않음). 가운뎃점 낱말("수집·이용")이 점에서 끊기지 않게 점 앞뒤에 둔다. */
export const WJ = "⁠";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

/** 천 단위 쉼표를 넣는다. 뒤쪽 0 은 없앤다(소수 최대 6자리). `fixed` 를 주면 그 자리수로 고정한다. */
export function formatNumber(
  value: number,
  opts: { fixed?: number } = {},
): string {
  if (opts.fixed !== undefined) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: opts.fixed,
      maximumFractionDigits: opts.fixed,
    });
  }
  return NUMBER.format(value);
}

/** "약" + 줄바꿈 금지 공백 + 글자: "약 2.6톤". */
export function approx(text: string): string {
  return `약${NBSP}${text}`;
}

/** 숫자 뒤에 공백 없이 붙여 쓰는 단위(한글 "톤", "%", "℃"). 나머지는 공백 한 칸. */
const ATTACHED_UNITS: ReadonlySet<string> = new Set(["톤", "%", "℃"]);

/**
 * 숫자 + 단위를 줄바꿈 금지 공백으로 묶는다: "35 mm", "1,000 m²", "300 L", "0.3톤", "약 3.2톤".
 * value 가 숫자면 천 단위 쉼표를 넣고, 이미 서식을 입힌 글자면 그대로 쓴다.
 */
export function valueUnit(
  value: number | string,
  unit: string,
  opts: { approx?: boolean } = {},
): string {
  const number = typeof value === "number" ? formatNumber(value) : value;
  const tiedUnit = tieMiddleDot(unit);
  const body = ATTACHED_UNITS.has(unit)
    ? `${number}${tiedUnit}`
    : `${number}${NBSP}${tiedUnit}`;
  return opts.approx ? approx(body) : body;
}

const MIDDLE_DOT = /(?<=[\p{L}\p{N}℃])·(?=[\p{L}\p{N}])/gu;

/**
 * 가운뎃점 낱말("수집·이용", "작목·작형", "℃·일")은 점 앞뒤에서 끊기지 않게 U+2060 을 둔다.
 * 앞뒤에 공백이 있는 " · " 구분점과 글의 처음 · 끝의 점은 건드리지 않는다. 두 번 적용해도 같다.
 */
export function tieMiddleDot(text: string): string {
  return text.replace(MIDDLE_DOT, `${WJ}·${WJ}`);
}

/** 줄 끝의 "›"(더 보기 표시)는 앞 낱말에 붙인다: "바꿔요 ›" → "바꿔요" + U+00A0 + "›". 두 번 적용해도 같다. */
export function tieChevron(text: string): string {
  return text.replace(/[ \t]+›(?=[ \t]*$)/gm, `${NBSP}›`);
}

/** keepTogether 가 숫자 뒤에서 알아보는 단위. 목록에 없는 말("35 명", "3 Level")은 건드리지 않는다. */
const SPACED_UNITS = "mm/일|mm|m²|㎡|MJ/m²|℃·일|L|평|kg";

// 숫자(쉼표·소수 포함) + 공백 + 단위. 숫자는 낱말 중간에서 시작하지 않고, 라틴 단위 뒤에 영문·숫자가 이어지면("Level", "LTE") 단위가 아니다.
const NUMBER_UNIT = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(\\d[\\d,]*(?:\\.\\d+)?) (?=(?:${SPACED_UNITS})(?![A-Za-z0-9]))`,
  "gu",
);

/**
 * 이미 있는 문구를 한 번에 묶는다: 숫자 + 단위, "약" + 숫자, 날짜 조각, 가운뎃점 낱말, 줄 끝의 "›".
 * 허용 목록(mm, mm/일, m², ㎡, MJ/m², ℃·일, L, 평, kg)에 없는 단위는 건드리지 않는다. 두 번 적용해도 같다.
 */
export function keepTogether(text: string): string {
  let out = text
    // 날짜: "2026년 12월 1일 (수)", "1월 1일로", "2027년 6월 하순"
    .replace(/(\d{4}년) (?=\d{1,2}월)/g, `$1${NBSP}`)
    .replace(/(\d{1,2}월) (?=(?:\d{1,2}일|[상중하]순))/g, `$1${NBSP}`)
    .replace(/(\d{1,2}일) (?=\([월화수목금토일]\))/g, `$1${NBSP}`)
    // "약" + 숫자
    .replace(/약 (?=\d)/g, `약${NBSP}`)
    // 숫자 + 단위
    .replace(NUMBER_UNIT, `$1${NBSP}`);
  out = tieMiddleDot(out);
  return tieChevron(out);
}
