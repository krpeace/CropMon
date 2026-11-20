import { describe, expect, it } from "vitest";

import {
  cookieValue,
  encodeIntent,
  readIntent,
  reauthLoginProvider,
  reauthTarget,
  WITHDRAW_INTENT_COOKIE,
  WITHDRAW_INTENT_MAX_AGE,
  WITHDRAW_INTENT_PATH,
} from "./withdraw-intent";

const WHO = "0123456789abcdef";
const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);

describe("상수 — 결정 0068", () => {
  it("쿠키 이름 · 경로(콜백만) · 수명 5분", () => {
    expect(WITHDRAW_INTENT_COOKIE).toBe("cm_wd");
    expect(WITHDRAW_INTENT_PATH).toBe("/auth/callback");
    expect(WITHDRAW_INTENT_MAX_AGE).toBe(300);
  });
});

describe("reauthTarget — 누가 재인증을 하나", () => {
  const on = { naverEnabled: true, signupProvider: null } as const;
  it("카카오만 있으면 없음 (L6-1 그대로)", () => {
    expect(reauthTarget({ providers: ["kakao"], ...on })).toBeNull();
  });
  it("공급자를 하나도 못 읽었으면 없음", () => {
    expect(reauthTarget({ providers: [], ...on })).toBeNull();
  });
  it("구글이 있으면 구글, 네이버가 있으면 네이버(켬일 때)", () => {
    expect(reauthTarget({ providers: ["google"], ...on })).toBe("google");
    expect(reauthTarget({ providers: ["naver"], ...on })).toBe("naver");
  });
  it("네이버가 꺼져 있으면 네이버는 대상이 아니다 (자료 삭제 + 안내 줄)", () => {
    expect(
      reauthTarget({
        providers: ["naver"],
        naverEnabled: false,
        signupProvider: null,
      }),
    ).toBeNull();
    expect(
      reauthTarget({
        providers: ["naver", "google"],
        naverEnabled: false,
        signupProvider: "naver",
      }),
    ).toBe("google");
  });
  it("카카오 + 구글이면 구글 (카카오는 어드민 키로 따로 끊는다)", () => {
    expect(reauthTarget({ providers: ["kakao", "google"], ...on })).toBe(
      "google",
    );
  });
  it("구글 + 네이버 둘 다: 처음 가입한 공급자가 구글/네이버면 그것, 아니면 구글 → 네이버", () => {
    const both = ["naver", "google"] as const;
    expect(
      reauthTarget({
        providers: both,
        naverEnabled: true,
        signupProvider: "naver",
      }),
    ).toBe("naver");
    expect(
      reauthTarget({
        providers: both,
        naverEnabled: true,
        signupProvider: "google",
      }),
    ).toBe("google");
    expect(
      reauthTarget({
        providers: both,
        naverEnabled: true,
        signupProvider: "kakao",
      }),
    ).toBe("google");
    expect(
      reauthTarget({
        providers: both,
        naverEnabled: true,
        signupProvider: null,
      }),
    ).toBe("google");
  });
  it("처음 가입한 공급자가 연결 목록에 없으면 따르지 않는다", () => {
    expect(
      reauthTarget({
        providers: ["google"],
        naverEnabled: true,
        signupProvider: "naver",
      }),
    ).toBe("google");
  });
});

describe("reauthLoginProvider — Supabase 에 넘길 공급자 이름", () => {
  it("구글은 google, 네이버는 custom:naver", () => {
    expect(reauthLoginProvider("google")).toBe("google");
    expect(reauthLoginProvider("naver")).toBe("custom:naver");
  });
});

describe("탈퇴 의도 쿠키 값", () => {
  it("만들고 읽으면 회원 번호 해시 · 공급자가 그대로 나온다", () => {
    const raw = encodeIntent({ who: WHO, provider: "google", nowMs: NOW });
    expect(readIntent(raw, NOW + 1000)).toEqual({
      ok: true,
      who: WHO,
      provider: "google",
    });
  });
  it("쿠키에 넣어도 안전한 글자만 쓴다 (따옴표 · 세미콜론 · 공백 · = 없음)", () => {
    const raw = encodeIntent({ who: WHO, provider: "naver", nowMs: NOW });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("값에는 해시와 공급자와 만료 시각뿐이고 회원 번호(UUID) · 메일은 없다", () => {
    const raw = encodeIntent({ who: WHO, provider: "google", nowMs: NOW });
    const json = Buffer.from(raw, "base64url").toString("utf8");
    expect(JSON.parse(json)).toEqual({
      v: 1,
      who: WHO,
      p: "google",
      exp: NOW + WITHDRAW_INTENT_MAX_AGE * 1000,
    });
  });
  it("5분이 지나면 만료 (정확히 만료 시각부터)", () => {
    const raw = encodeIntent({ who: WHO, provider: "google", nowMs: NOW });
    const exp = NOW + 300_000;
    expect(readIntent(raw, exp - 1).ok).toBe(true);
    expect(readIntent(raw, exp)).toEqual({ ok: false, reason: "expired" });
    expect(readIntent(raw, exp + 60_000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
  it("없으면 missing", () => {
    for (const raw of [null, undefined, ""]) {
      expect(readIntent(raw, NOW), String(raw)).toEqual({
        ok: false,
        reason: "missing",
      });
    }
  });
  it("깨졌거나 모양이 틀리면 broken", () => {
    const bad = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
    const exp = NOW + 100_000;
    for (const raw of [
      "not-base64!!",
      "e30", // {}
      bad({ v: 2, who: WHO, p: "google", exp }),
      bad({ v: 1, who: "xyz", p: "google", exp }),
      bad({ v: 1, who: WHO.toUpperCase(), p: "google", exp }),
      bad({ v: 1, who: WHO, p: "kakao", exp }),
      bad({ v: 1, who: WHO, p: "google", exp: "soon" }),
      bad({ v: 1, who: WHO, p: "google" }),
      bad(["v"]),
      "a".repeat(5000),
    ]) {
      expect(readIntent(raw, NOW), raw.slice(0, 20)).toEqual({
        ok: false,
        reason: "broken",
      });
    }
  });
  it("만료 시각이 너무 먼 미래이면 broken (5분보다 길게 살지 못한다)", () => {
    const raw = Buffer.from(
      JSON.stringify({
        v: 1,
        who: WHO,
        p: "google",
        exp: NOW + 3_600_000,
      }),
    ).toString("base64url");
    expect(readIntent(raw, NOW)).toEqual({ ok: false, reason: "broken" });
  });
});

describe("cookieValue — Cookie 머리에서 이름 하나 찾기", () => {
  it("여러 쿠키 가운데 이름이 같은 것 하나", () => {
    expect(cookieValue("a=1; cm_wd=abc; b=2", "cm_wd")).toBe("abc");
  });
  it("이름이 비슷한 다른 쿠키는 읽지 않는다", () => {
    for (const header of ["xcm_wd=1", "cm_wd2=1", "a=cm_wd=1", "", "cm_wd"]) {
      expect(cookieValue(header, "cm_wd"), header).toBeNull();
    }
  });
  it("머리가 없으면 null", () => {
    expect(cookieValue(null, "cm_wd")).toBeNull();
  });
});
