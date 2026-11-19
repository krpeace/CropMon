import { describe, expect, it } from "vitest";

import { LOGIN_TOAST_TEXT, readLoginNotice } from "./toast";

describe("readLoginNotice — 돌아온 주소의 login 표시 읽기", () => {
  it("ok · failed · cancelled 를 알아본다", () => {
    expect(readLoginNotice("?login=ok")).toBe("ok");
    expect(readLoginNotice("?st=105&login=failed")).toBe("failed");
    expect(readLoginNotice("?login=cancelled&crop=apple")).toBe("cancelled");
  });

  it("login=1(시트 열기)이나 모르는 값 · 없음은 null", () => {
    for (const s of ["", "?st=105", "?login=1", "?login=", "?login=OK"]) {
      expect(readLoginNotice(s), s).toBeNull();
    }
  });
});

describe("LOGIN_TOAST_TEXT — 알림 문구", () => {
  it("성공 · 실패는 시안 문구, 취소는 아무 말 없음(null)", () => {
    expect(LOGIN_TOAST_TEXT.ok).toBe("로그인했어요");
    expect(LOGIN_TOAST_TEXT.failed).toBe(
      "로그인을 마치지 못했어요. 잠시 뒤 다시 해 주세요",
    );
    expect(LOGIN_TOAST_TEXT.cancelled).toBeNull();
  });
});
