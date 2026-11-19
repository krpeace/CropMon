import { describe, expect, it } from "vitest";

import {
  addClosedNotice,
  buildNoticeScript,
  NOTICE_CLOSED_KEY,
  parseClosedNotices,
  pickNotice,
  serializeClosedNotices,
} from "./notice";

describe("pickNotice — 카드는 한 번에 하나: ① 농장 등록 권하기 → ② 가온 시작일 → ③ 글씨 크기", () => {
  it("셋 다 보일 수 있으면 ①", () => {
    expect(
      pickNotice({ farmPromo: true, heatingStart: true, fontSize: true }),
    ).toBe("farmPromo");
  });

  it("①이 없으면 ②", () => {
    expect(
      pickNotice({ farmPromo: false, heatingStart: true, fontSize: true }),
    ).toBe("heatingStart");
  });

  it("③만이면 ③", () => {
    expect(
      pickNotice({ farmPromo: false, heatingStart: false, fontSize: true }),
    ).toBe("fontSize");
    expect(pickNotice({ fontSize: true })).toBe("fontSize");
  });

  it("모두 거짓이면 없음", () => {
    expect(
      pickNotice({ farmPromo: false, heatingStart: false, fontSize: false }),
    ).toBeNull();
    expect(pickNotice({})).toBeNull();
  });
});

describe("닫은 카드 기억", () => {
  it("저장 이름은 기존 키와 같은 대시 모양", () => {
    expect(NOTICE_CLOSED_KEY).toBe("cropmon-notice-closed");
  });

  it("저장한 값을 되살린다 · 중복은 한 번만 · 순서는 카드 순서", () => {
    const raw = serializeClosedNotices(["fontSize", "fontSize", "farmPromo"]);
    expect(parseClosedNotices(raw)).toEqual(["farmPromo", "fontSize"]);
  });

  it.each([
    ["null", null],
    ["빈 문자열", ""],
    ["망가진 JSON", "{closed:"],
    ["배열", "[]"],
    ["모르는 판", '{"v":2,"closed":["fontSize"]}'],
    ["closed 가 배열이 아님", '{"v":1,"closed":"fontSize"}'],
  ])("%s → 아무것도 안 닫음", (_name, raw) => {
    expect(parseClosedNotices(raw)).toEqual([]);
  });

  it("모르는 카드 이름은 버린다", () => {
    expect(
      parseClosedNotices('{"v":1,"closed":["fontSize","evil","\\"><x"]}'),
    ).toEqual(["fontSize"]);
  });

  it("닫기를 더한다(이미 있으면 그대로)", () => {
    expect(addClosedNotice([], "fontSize")).toEqual(["fontSize"]);
    expect(addClosedNotice(["fontSize"], "fontSize")).toEqual(["fontSize"]);
    expect(addClosedNotice(["farmPromo"], "fontSize")).toEqual([
      "farmPromo",
      "fontSize",
    ]);
  });
});

/** 머리 스크립트가 순수 함수와 같은 결과(<html data-notice-closed>)를 내는지. */
function runScript(raw: string | null, storageThrows = false) {
  const attrs: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
    },
  };
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("blocked");
      return k === NOTICE_CLOSED_KEY ? raw : null;
    },
  };
  new Function("document", "localStorage", buildNoticeScript())(
    document,
    localStorage,
  );
  return attrs["data-notice-closed"];
}

describe("머리 스크립트 ↔ 순수 함수 일치", () => {
  it("닫은 카드를 공백으로 이어 <html data-notice-closed> 에 단다", () => {
    const raw = serializeClosedNotices(["fontSize", "farmPromo"]);
    expect(runScript(raw)).toBe(parseClosedNotices(raw).join(" "));
    expect(runScript(raw)).toBe("farmPromo fontSize");
  });

  it("없거나 망가졌거나 모르는 이름이면 표시를 달지 않는다(빈 글자)", () => {
    for (const raw of [
      null,
      "",
      "{closed:",
      "[]",
      '{"v":2,"closed":["fontSize"]}',
      '{"v":1,"closed":["evil"]}',
    ]) {
      expect(runScript(raw) ?? "", String(raw)).toBe("");
    }
  });

  it("저장소가 막혀도 오류 없이 넘어간다", () => {
    expect(() => runScript(null, true)).not.toThrow();
  });
});
