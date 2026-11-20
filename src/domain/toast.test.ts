import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TOAST,
  LOGIN_TOAST_TEXT,
  readAccountNotice,
  readLoginNotice,
  TOAST_MS,
} from "./toast";

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

describe("account= 알림 (이슈 #195, 결정 0067)", () => {
  it("withdraw-other(다른 계정으로 재로그인, 이슈 #197)도 알아본다", () => {
    expect(readAccountNotice("?account=withdraw-other")).toBe("withdraw-other");
    expect(ACCOUNT_TOAST["withdraw-other"]).toEqual({
      text: "다른 계정으로 로그인해서 탈퇴하지 않았어요. 원래 계정으로 다시 로그인해 주세요",
      ms: 7000,
    });
  });
  it("withdrawn · withdrawn-unlinked 를 알아본다", () => {
    expect(readAccountNotice("?account=withdrawn")).toBe("withdrawn");
    expect(readAccountNotice("?st=105&account=withdrawn-unlinked")).toBe(
      "withdrawn-unlinked",
    );
  });
  it("모르는 값 · 없음은 null", () => {
    for (const s of [
      "",
      "?account=",
      "?account=1",
      "?account=WITHDRAWN",
      "?login=ok",
    ]) {
      expect(readAccountNotice(s), s).toBeNull();
    }
  });
  it("문구: 탈퇴했어요 / 안내가 붙으면 한 알림의 두 줄(줄바꿈)이고 더 오래 뜬다", () => {
    expect(ACCOUNT_TOAST.withdrawn).toEqual({
      text: "탈퇴했어요",
      ms: TOAST_MS,
    });
    expect(ACCOUNT_TOAST["withdrawn-unlinked"].text).toBe(
      "탈퇴했어요\n연결된 서비스는 각 계정 설정에서 해제할 수 있어요",
    );
    expect(ACCOUNT_TOAST["withdrawn-unlinked"].ms).toBe(7000);
  });
});
