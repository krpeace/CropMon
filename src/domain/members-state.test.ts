import { describe, expect, it } from "vitest";

import {
  buildMembersScript,
  MEMBERS_STATE_COOKIE,
  membersCookieAction,
  parseMembersFromCookieHeader,
  parseMembersState,
  wantedMembersCookie,
} from "./members-state";

describe("parseMembersState — 표시 쿠키 값 읽기 (모르는 값은 끔 = 지금 알파 모양)", () => {
  it("a · i 는 켬(비로그인 · 로그인함), 뒤의 n 은 네이버 켬", () => {
    expect(parseMembersState("a")).toEqual({ mode: "anon", naver: false });
    expect(parseMembersState("i")).toEqual({ mode: "in", naver: false });
    expect(parseMembersState("an")).toEqual({ mode: "anon", naver: true });
    expect(parseMembersState("in")).toEqual({ mode: "in", naver: true });
  });

  it("없거나 비었거나 모르는 값은 끔", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "x",
      "A",
      "I",
      "ai",
      "na",
      "inn",
      "1",
      "true",
      " a",
      "a ",
      "in;",
      "<script>",
    ]) {
      expect(parseMembersState(bad), String(bad)).toEqual({
        mode: "off",
        naver: false,
      });
    }
  });

  it("끔일 때 naver 는 항상 false", () => {
    expect(parseMembersState("n").naver).toBe(false);
  });
});

describe("parseMembersFromCookieHeader — document.cookie 에서 읽기", () => {
  it("여러 쿠키 가운데서 cm_m 하나를 찾는다", () => {
    expect(parseMembersFromCookieHeader("a=1; cm_m=i; b=2")).toEqual({
      mode: "in",
      naver: false,
    });
    expect(parseMembersFromCookieHeader("cm_m=an")).toEqual({
      mode: "anon",
      naver: true,
    });
  });

  it("이름이 비슷한 다른 쿠키는 읽지 않는다", () => {
    for (const header of ["xcm_m=in", "cm_m2=in", "a=cm_m=in", "", "cm_m="]) {
      expect(parseMembersFromCookieHeader(header), header).toEqual({
        mode: "off",
        naver: false,
      });
    }
  });
});

describe("wantedMembersCookie — 프록시가 심고 싶은 값", () => {
  it("스위치 끔이면 쿠키를 원하지 않는다(null) — 네이버 · 로그인 값과 상관없이", () => {
    expect(
      wantedMembersCookie({ membersOn: false, naverOn: true, signedIn: true }),
    ).toBeNull();
  });

  it("켬: 비로그인 a · 로그인함 i, 네이버 켬이면 뒤에 n", () => {
    const w = (naverOn: boolean, signedIn: boolean) =>
      wantedMembersCookie({ membersOn: true, naverOn, signedIn });
    expect(w(false, false)).toBe("a");
    expect(w(false, true)).toBe("i");
    expect(w(true, false)).toBe("an");
    expect(w(true, true)).toBe("in");
  });

  it("만든 값은 읽는 쪽이 그대로 알아본다 (이름 · 이메일 같은 개인 값이 들어갈 틈이 없다)", () => {
    for (const naverOn of [true, false]) {
      for (const signedIn of [true, false]) {
        const v = wantedMembersCookie({ membersOn: true, naverOn, signedIn });
        expect(v).toMatch(/^[ai]n?$/);
        expect(parseMembersState(v).mode).toBe(signedIn ? "in" : "anon");
        expect(parseMembersState(v).naver).toBe(naverOn);
      }
    }
  });
});

describe("membersCookieAction — 다를 때만 쓰고, 끔일 때는 있을 때만 지운다", () => {
  it("끔 + 쿠키 없음 → 아무것도 안 한다 (쿠키 없는 방문자는 알파와 같다)", () => {
    expect(membersCookieAction(undefined, null)).toEqual({ kind: "none" });
  });

  it("끔 + 쿠키 있음(켰다가 끔 · 위조 포함) → 지운다", () => {
    expect(membersCookieAction("in", null)).toEqual({ kind: "clear" });
    expect(membersCookieAction("whatever", null)).toEqual({ kind: "clear" });
    expect(membersCookieAction("", null)).toEqual({ kind: "clear" });
  });

  it("켬 + 쿠키 없음 → 쓴다", () => {
    expect(membersCookieAction(undefined, "a")).toEqual({
      kind: "set",
      value: "a",
    });
  });

  it("켬 + 값이 다름 → 쓴다 / 같음 → 안 쓴다", () => {
    expect(membersCookieAction("a", "i")).toEqual({ kind: "set", value: "i" });
    expect(membersCookieAction("in", "an")).toEqual({
      kind: "set",
      value: "an",
    });
    expect(membersCookieAction("x", "a")).toEqual({ kind: "set", value: "a" });
    expect(membersCookieAction("a", "a")).toEqual({ kind: "none" });
    expect(membersCookieAction("in", "in")).toEqual({ kind: "none" });
  });
});

describe("buildMembersScript — 첫 그리기 전에 <html> 에 속성을 다는 스크립트", () => {
  type FakeDoc = {
    cookie: string;
    documentElement: { dataset: Record<string, string> };
  };
  const run = (fake: FakeDoc) => {
    new Function("document", buildMembersScript())(fake);
    return fake.documentElement.dataset;
  };
  const withCookie = (cookie: string): FakeDoc => ({
    cookie,
    documentElement: { dataset: {} },
  });

  it("쿠키 값에 맞춰 data-members(anon | in) 와 data-naver 를 단다", () => {
    expect(run(withCookie(`${MEMBERS_STATE_COOKIE}=a`))).toEqual({
      members: "anon",
    });
    expect(run(withCookie(`x=1; ${MEMBERS_STATE_COOKIE}=in`))).toEqual({
      members: "in",
      naver: "1",
    });
    expect(run(withCookie(`${MEMBERS_STATE_COOKIE}=an`))).toEqual({
      members: "anon",
      naver: "1",
    });
  });

  it("쿠키가 없거나 모르는 값이면 아무 속성도 달지 않는다 (= 지금 알파 모양)", () => {
    for (const cookie of [
      "",
      "a=1",
      `${MEMBERS_STATE_COOKIE}=zzz`,
      `${MEMBERS_STATE_COOKIE}=`,
      "xcm_m=in",
    ]) {
      expect(run(withCookie(cookie)), cookie).toEqual({});
    }
  });

  it("쿠키를 읽다 오류가 나도 던지지 않는다 (화면을 막지 않는다)", () => {
    const broken = {
      get cookie(): string {
        throw new Error("blocked");
      },
      documentElement: { dataset: {} as Record<string, string> },
    };
    expect(() =>
      new Function("document", buildMembersScript())(broken),
    ).not.toThrow();
    expect(broken.documentElement.dataset).toEqual({});
  });

  it("스크립트는 쿠키 이름만 알고 개인 값은 모른다", () => {
    expect(buildMembersScript()).toContain(MEMBERS_STATE_COOKIE);
  });
});
