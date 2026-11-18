import { describe, expect, it } from "vitest";

import {
  approx,
  formatNumber,
  keepTogether,
  NBSP,
  tieChevron,
  tieMiddleDot,
  valueUnit,
  WJ,
} from "./display";

const N = " "; // 줄바꿈 금지 공백
const W = "⁠"; // 단어 결합자 (가운뎃점 낱말에만)

describe("상수", () => {
  it("NBSP 는 U+00A0, WJ 는 U+2060", () => {
    expect(NBSP).toBe(" ");
    expect(WJ).toBe("⁠");
  });
});

describe("formatNumber — 천 단위 쉼표, 군더더기 0 없음", () => {
  it("정수 · 소수", () => {
    expect(formatNumber(35)).toBe("35");
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(3.2)).toBe("3.2");
    expect(formatNumber(0)).toBe("0");
  });

  it("뒤쪽 0 은 없앤다 (소수 최대 6자리)", () => {
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });

  it("자리수를 정하면 그만큼 고정", () => {
    expect(formatNumber(2, { fixed: 1 })).toBe("2.0");
    expect(formatNumber(1234.5, { fixed: 1 })).toBe("1,234.5");
  });
});

describe("valueUnit — 숫자와 단위를 줄바꿈 금지 공백으로", () => {
  it("'35 mm', '1,000 m²', '300 L'", () => {
    expect(valueUnit(35, "mm")).toBe(`35${N}mm`);
    expect(valueUnit(1000, "m²")).toBe(`1,000${N}m²`);
    expect(valueUnit(2000, "m²")).toBe(`2,000${N}m²`);
    expect(valueUnit(300, "L")).toBe(`300${N}L`);
  });

  it("한글 단위 '톤' 은 붙여 쓴다: '0.3톤'", () => {
    expect(valueUnit(0.3, "톤")).toBe("0.3톤");
  });

  it("approx: '약 3.2톤' — 약과 숫자 사이도 줄바꿈 금지", () => {
    expect(valueUnit(3.2, "톤", { approx: true })).toBe(`약${N}3.2톤`);
    expect(valueUnit(35, "mm", { approx: true })).toBe(`약${N}35${N}mm`);
  });

  it("이미 서식을 입힌 글자(문자열)는 그대로 쓴다", () => {
    expect(valueUnit("1,234", "m²")).toBe(`1,234${N}m²`);
  });

  it("가운뎃점이 든 단위는 점에서도 끊기지 않는다: '1,000 ℃·일'", () => {
    expect(valueUnit(1000, "℃·일")).toBe(`1,000${N}℃${W}·${W}일`);
  });

  it("일반 공백이 하나도 남지 않는다", () => {
    for (const out of [
      valueUnit(35, "mm"),
      valueUnit(1000, "m²"),
      valueUnit(3.2, "톤", { approx: true }),
      valueUnit(0.5, "mm/일"),
    ]) {
      expect(out).not.toMatch(/ /);
    }
  });
});

describe("approx", () => {
  it("'약' + 줄바꿈 금지 공백 + 글자", () => {
    expect(approx("2.6톤")).toBe(`약${N}2.6톤`);
  });
});

describe("tieMiddleDot — 가운뎃점 낱말은 점 앞뒤에서 끊기지 않는다", () => {
  it("'수집·이용', '작목·작형'", () => {
    expect(tieMiddleDot("수집·이용")).toBe(`수집${W}·${W}이용`);
    expect(tieMiddleDot("작목·작형")).toBe(`작목${W}·${W}작형`);
  });

  it("글 속의 낱말만 바꾼다", () => {
    expect(tieMiddleDot("개인정보 수집·이용에 동의해요")).toBe(
      `개인정보 수집${W}·${W}이용에 동의해요`,
    );
  });

  it("앞뒤에 공백이 있는 ' · ' 는 건드리지 않는다 (구분점)", () => {
    expect(tieMiddleDot("기상청 · 단기예보")).toBe("기상청 · 단기예보");
  });

  it("글의 처음·끝의 점은 건드리지 않는다", () => {
    expect(tieMiddleDot("·이용")).toBe("·이용");
    expect(tieMiddleDot("수집·")).toBe("수집·");
  });

  it("두 번 적용해도 같다 (멱등)", () => {
    const once = tieMiddleDot("수집·이용 작목·작형");
    expect(tieMiddleDot(once)).toBe(once);
  });
});

describe("tieChevron — 끝의 '›' 는 앞 낱말에 붙인다", () => {
  it("'바꿔요 ›' → '바꿔요' + NBSP + '›'", () => {
    expect(tieChevron("농장 설정에서 바꿔요 ›")).toBe(
      `농장 설정에서 바꿔요${N}›`,
    );
  });

  it("공백이 여럿이어도 하나의 NBSP 로", () => {
    expect(tieChevron("바꿔요   ›")).toBe(`바꿔요${N}›`);
  });

  it("줄마다 끝의 '›' 를 처리하고, 끝이 아닌 '›' 는 그대로", () => {
    expect(tieChevron("가 ›\n나 ›")).toBe(`가${N}›\n나${N}›`);
    expect(tieChevron("가 › 나")).toBe("가 › 나");
  });

  it("'›' 가 없으면 그대로, 두 번 적용해도 같다", () => {
    expect(tieChevron("바꿔요")).toBe("바꿔요");
    expect(tieChevron(tieChevron("바꿔요 ›"))).toBe(`바꿔요${N}›`);
  });
});

describe("keepTogether — 이미 있는 문구를 한 번에 묶는다", () => {
  it("숫자 + 단위", () => {
    expect(keepTogether("관수 시작점 35 mm")).toBe(`관수 시작점 35${N}mm`);
    expect(keepTogether("1,000 m²와 2,000 m²")).toBe(
      `1,000${N}m²와 2,000${N}m²`,
    );
    expect(keepTogether("300 L 또는 0.3톤")).toBe(`300${N}L 또는 0.3톤`);
    expect(keepTogether("하루 0.5 mm/일")).toBe(`하루 0.5${N}mm/일`);
    expect(keepTogether("3,305 ㎡ · 1,000 평")).toBe(
      `3,305${N}㎡ · 1,000${N}평`,
    );
    expect(keepTogether("4.2 MJ/m²")).toBe(`4.2${N}MJ/m²`);
    expect(keepTogether("10 kg")).toBe(`10${N}kg`);
  });

  it("'약' + 숫자: 약과 숫자 사이도 묶는다", () => {
    expect(keepTogether("약 3.2톤")).toBe(`약${N}3.2톤`);
    expect(keepTogether("약 35 mm")).toBe(`약${N}35${N}mm`);
  });

  it("날짜 조각 사이에서 끊기지 않는다", () => {
    expect(keepTogether("2026년 12월 1일")).toBe(`2026년${N}12월${N}1일`);
    expect(keepTogether("1월 1일로 바뀌어요")).toBe(`1월${N}1일로 바뀌어요`);
    expect(keepTogether("2027년 6월 하순")).toBe(`2027년${N}6월${N}하순`);
    expect(keepTogether("2026년 8월 12일 (수)")).toBe(
      `2026년${N}8월${N}12일${N}(수)`,
    );
  });

  it("가운뎃점 낱말은 U+2060 으로 (숫자 · 단위 · 날짜에는 U+00A0 만)", () => {
    expect(keepTogether("수집·이용")).toBe(`수집${W}·${W}이용`);
    // 날짜 · 숫자 + 단위 줄에는 U+2060 이 없다
    expect(keepTogether("2026년 12월 1일, 35 mm, 약 3.2톤")).not.toContain(W);
  });

  it("'℃·일' 은 숫자 + 단위(NBSP)와 가운뎃점(U+2060) 규칙이 겹쳐도 한 번만 묶인다", () => {
    const once = keepTogether("적산온도 1,000 ℃·일");
    expect(once).toBe(`적산온도 1,000${N}℃${W}·${W}일`);
    expect(keepTogether(once)).toBe(once);
  });

  it("끝의 '›' 도 묶는다", () => {
    expect(keepTogether("농장 설정에서 바꿔요 ›")).toBe(
      `농장 설정에서 바꿔요${N}›`,
    );
  });

  it("허용 목록에 없는 말은 건드리지 않는다", () => {
    expect(keepTogether("35 명이 왔어요")).toBe("35 명이 왔어요");
    expect(keepTogether("3 Level 이상")).toBe("3 Level 이상");
    expect(keepTogether("5 LTE 망")).toBe("5 LTE 망");
    expect(keepTogether("전화 02 1234")).toBe("전화 02 1234");
  });

  it("단위 뒤에 한글 조사가 바로 붙어도 묶는다", () => {
    expect(keepTogether("35 mm를 줘요")).toBe(`35${N}mm를 줘요`);
  });

  it("긴 글을 섞어 써도 일반 낱말 사이 공백은 그대로", () => {
    const text =
      "올해는 2026년 12월 1일부터 약 3.2톤, 35 mm를 줘요. 수집·이용 안내 ›";
    const out = keepTogether(text);
    expect(out).toBe(
      `올해는 2026년${N}12월${N}1일부터 약${N}3.2톤, 35${N}mm를 줘요. 수집${W}·${W}이용 안내${N}›`,
    );
    // 두 번 적용해도 같다 (멱등)
    expect(keepTogether(out)).toBe(out);
  });

  it("빈 글", () => {
    expect(keepTogether("")).toBe("");
  });
});
