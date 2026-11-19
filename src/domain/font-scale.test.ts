import { describe, expect, it } from "vitest";

import {
  buildFontScaleScript,
  DEFAULT_FONT_PREF,
  effectiveStep,
  FONT_SCALE_KEY,
  FONT_STEPS,
  nearestStep,
  parseFontScalePref,
  percentOf,
  phoneRatio,
  serializeFontScalePref,
  stepByValue,
} from "./font-scale";

describe("단계 다섯 개", () => {
  it("작게 0.9 · 보통 1 · 크게 1.15 · 더 크게 1.3 · 아주 크게 1.5", () => {
    expect(FONT_STEPS.map((s) => [s.id, s.label, s.value])).toEqual([
      ["small", "작게", 0.9],
      ["normal", "보통", 1],
      ["large", "크게", 1.15],
      ["xlarge", "더 크게", 1.3],
      ["xxlarge", "아주 크게", 1.5],
    ]);
  });

  it("기본은 보통 · 휴대폰 설정 따르기 꺼짐", () => {
    expect(DEFAULT_FONT_PREF).toEqual({ step: "normal", follow: false });
  });

  it("저장 이름은 기존 키와 같은 대시 모양", () => {
    expect(FONT_SCALE_KEY).toBe("cropmon-font-scale");
  });

  it("퍼센트 글자: 값 × 100 을 반올림", () => {
    expect(FONT_STEPS.map((s) => percentOf(s.value))).toEqual([
      90, 100, 115, 130, 150,
    ]);
  });

  it("값으로 단계 찾기 — 모르는 값은 null", () => {
    expect(stepByValue(1.3)?.label).toBe("더 크게");
    expect(stepByValue(1.2)).toBeNull();
  });
});

describe("저장 값 읽기", () => {
  it("저장한 값을 되살린다", () => {
    const p = { step: "xxlarge", follow: true } as const;
    expect(parseFontScalePref(serializeFontScalePref(p))).toEqual(p);
  });

  it.each([
    ["빈 값(null)", null],
    ["빈 문자열", ""],
    ["망가진 JSON", "{step:"],
    ["JSON 이 아닌 글자", "xxlarge"],
    ["배열", "[]"],
    ["모르는 판", '{"v":2,"step":"large"}'],
    ["판 없음", '{"step":"large"}'],
  ])("%s → 기본값", (_name, raw) => {
    expect(parseFontScalePref(raw)).toEqual(DEFAULT_FONT_PREF);
  });

  it("모르는 단계는 보통, follow 가 true 가 아니면 꺼짐", () => {
    expect(parseFontScalePref('{"v":1,"step":"huge","follow":"yes"}')).toEqual({
      step: "normal",
      follow: false,
    });
    expect(parseFontScalePref('{"v":1,"step":"large"}')).toEqual({
      step: "large",
      follow: false,
    });
  });
});

describe("휴대폰 글자 배율 → 가장 가까운 단계", () => {
  it("예: 1.07 → 보통, 1.2 → 크게, 0.5 → 작게, 2 → 아주 크게", () => {
    expect(nearestStep(1.07).id).toBe("normal");
    expect(nearestStep(1.2).id).toBe("large");
    expect(nearestStep(0.5).id).toBe("small");
    expect(nearestStep(2).id).toBe("xxlarge");
  });

  it("단계 값 그대로면 그 단계", () => {
    for (const s of FONT_STEPS) expect(nearestStep(s.value).id).toBe(s.id);
  });

  it("읽을 수 없는 값(NaN · 0 · 음수 · 무한대)은 null", () => {
    for (const bad of [NaN, 0, -1, Infinity]) {
      expect(phoneRatio(bad, 16), String(bad)).toBeNull();
    }
  });

  it("측정 글자 크기(px) ÷ 기준(아이폰 17 · 그 밖 16)", () => {
    expect(phoneRatio(17, 17)).toBe(1);
    expect(phoneRatio(24, 16)).toBe(1.5);
  });

  it("따르기가 켜지면 측정값의 단계, 측정 실패(null)면 저장한 단계", () => {
    const base = { step: "small", follow: true } as const;
    expect(effectiveStep(base, 1.3).id).toBe("xlarge");
    expect(effectiveStep(base, null).id).toBe("small");
    expect(effectiveStep({ ...base, follow: false }, 1.5).id).toBe("small");
  });
});

/**
 * 머리 스크립트(첫 그리기 전)와 순수 함수가 같은 결과를 내는지 같은 표로 확인한다.
 * 스크립트는 문서 · 저장소 · CSS · getComputedStyle 만 쓰므로 가짜를 넣어 돌린다.
 */
function runScript(
  raw: string | null,
  opts: {
    measuredPx?: number | "throw";
    ios?: boolean;
    storageThrows?: boolean;
  } = {},
) {
  const style: Record<string, string> = {};
  const root = {
    style: {
      setProperty: (k: string, v: string) => {
        style[k] = v;
      },
    },
    appendChild: () => {},
  };
  const probe = {
    style: {} as Record<string, string>,
    remove: () => {},
  };
  const document = {
    documentElement: root,
    createElement: () => probe,
  };
  const localStorage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      return k === FONT_SCALE_KEY ? raw : null;
    },
  };
  const CSS = { supports: () => opts.ios === true };
  const getComputedStyle = () => {
    if (opts.measuredPx === "throw") throw new Error("boom");
    return { fontSize: `${opts.measuredPx ?? 16}px` };
  };
  new Function(
    "document",
    "localStorage",
    "CSS",
    "getComputedStyle",
    buildFontScaleScript(),
  )(document, localStorage, CSS, getComputedStyle);
  return style["--fz"];
}

describe("머리 스크립트 ↔ 순수 함수 일치", () => {
  it("저장 값이 없거나 망가졌으면 --fz 는 1(보통)", () => {
    for (const raw of [null, "", "{step:", "[]", '{"v":2,"step":"large"}']) {
      expect(runScript(raw), String(raw)).toBe("1");
    }
  });

  it('허용 목록 밖의 단계("huge")는 둘 다 보통 — --fz 2 같은 값은 만들어지지 않는다', () => {
    expect(runScript('{"v":1,"step":"huge"}')).toBe("1");
    expect(runScript('{"v":1,"step":"2"}')).toBe("1");
    expect(runScript('{"v":1,"step":"large","fz":2}')).toBe("1.15");
    expect(parseFontScalePref('{"v":1,"step":"huge"}').step).toBe("normal");
  });

  it("다섯 단계는 순수 함수와 같은 값", () => {
    for (const s of FONT_STEPS) {
      const raw = serializeFontScalePref({ step: s.id, follow: false });
      expect(runScript(raw), s.id).toBe(String(s.value));
    }
  });

  it("따르기 켜짐: 측정값 → 가장 가까운 단계(안드로이드 기준 16 · 아이폰 기준 17)", () => {
    const raw = serializeFontScalePref({ step: "normal", follow: true });
    for (const px of [8, 16, 17.12, 19.2, 24, 32]) {
      const expected = String(
        effectiveStep({ step: "normal", follow: true }, phoneRatio(px, 16))
          .value,
      );
      expect(runScript(raw, { measuredPx: px }), `android ${px}`).toBe(
        expected,
      );
    }
    for (const px of [17, 22, 25.5, 40]) {
      const expected = String(
        effectiveStep({ step: "normal", follow: true }, phoneRatio(px, 17))
          .value,
      );
      expect(runScript(raw, { measuredPx: px, ios: true }), `ios ${px}`).toBe(
        expected,
      );
    }
  });

  it("측정이 실패(예외 · 0px)하면 저장된 단계 값", () => {
    const raw = serializeFontScalePref({ step: "large", follow: true });
    expect(runScript(raw, { measuredPx: "throw" })).toBe("1.15");
    expect(runScript(raw, { measuredPx: 0 })).toBe("1.15");
  });

  it("저장소가 막혀도 오류 없이 넘어간다(--fz 를 건드리지 않음)", () => {
    expect(() => runScript(null, { storageThrows: true })).not.toThrow();
  });
});
