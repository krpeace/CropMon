import { describe, expect, it } from "vitest";

import {
  buildAccountInfo,
  editionLabel,
  koreanDate,
  pickKakaoUserId,
  providerOf,
  providersOf,
  withdrawOutcome,
} from "./account-info";
import { LEGAL_DOCS } from "./legal";

describe("providerOf — 로그인 공급자 이름", () => {
  it("카카오 · 구글 · 네이버(custom:naver 포함)", () => {
    expect(providerOf("kakao")).toBe("kakao");
    expect(providerOf("google")).toBe("google");
    expect(providerOf("naver")).toBe("naver");
    expect(providerOf("custom:naver")).toBe("naver");
  });
  it("모르거나 비면 null", () => {
    for (const v of [null, undefined, "", "email", "github", "KAKAO"]) {
      expect(providerOf(v as never), String(v)).toBeNull();
    }
  });
});

describe("koreanDate — 한국 날짜로 (UTC 가 아니라 KST)", () => {
  it("2026년 8월 12일 꼴, 0 을 붙이지 않는다", () => {
    expect(koreanDate("2026-08-12T01:00:00Z")).toBe("2026년 8월 12일");
    expect(koreanDate("2027-01-05T00:00:00+09:00")).toBe("2027년 1월 5일");
  });
  it("UTC 로는 어제인 늦은 저녁도 한국 날짜로 (15시 UTC = 다음 날 0시 KST)", () => {
    expect(koreanDate("2026-12-31T15:30:00Z")).toBe("2027년 1월 1일");
  });
  it("없거나 읽을 수 없으면 null", () => {
    for (const v of [null, undefined, "", "어제", "2026-13-45"]) {
      expect(koreanDate(v as never), String(v)).toBeNull();
    }
  });
});

describe("editionLabel — 동의한 판 이름", () => {
  it("지금 판이면 제N판", () => {
    expect(editionLabel("terms", LEGAL_DOCS.terms.version)).toBe(
      `제${LEGAL_DOCS.terms.edition}판`,
    );
    expect(editionLabel("privacy", LEGAL_DOCS.privacy.version)).toBe(
      `제${LEGAL_DOCS.privacy.edition}판`,
    );
  });
  it("모르는 이전 판이면 판 번호 글자 그대로", () => {
    expect(editionLabel("terms", "terms-2026-01-01")).toBe("terms-2026-01-01");
  });
  it("비어 있으면 null", () => {
    expect(editionLabel("terms", null)).toBeNull();
    expect(editionLabel("terms", "")).toBeNull();
  });
});

describe("buildAccountInfo — 회원 정보 화면에 보일 값", () => {
  const base = {
    provider: "kakao",
    displayName: "가짜별명",
    email: "tester@example.invalid",
    createdAt: "2026-08-12T01:00:00Z",
    termsVersion: LEGAL_DOCS.terms.version,
    termsAgreedAt: "2026-08-12T01:00:00Z",
    privacyVersion: LEGAL_DOCS.privacy.version,
    privacyConfirmedAt: "2026-08-12T01:00:00Z",
  };

  it("공급자 이름 · 이름 · 메일 · 가입한 날 · 동의한 약관 두 줄", () => {
    const info = buildAccountInfo(base);
    expect(info.providerLabel).toBe("카카오");
    expect(info.name).toBe("가짜별명");
    expect(info.email).toBe("tester@example.invalid");
    expect(info.joined).toBe("2026년 8월 12일");
    // 이용약관은 "동의", 개인정보처리방침은 "안내 확인"(동의가 아니다)
    expect(info.termsLine).toBe("2026년 8월 12일 동의 · 제1판");
    expect(info.privacyLine).toBe("2026년 8월 12일 안내 확인 · 제1판");
  });

  it("공급자 셋의 이름", () => {
    expect(
      buildAccountInfo({ ...base, provider: "google" }).providerLabel,
    ).toBe("구글");
    expect(buildAccountInfo({ ...base, provider: "naver" }).providerLabel).toBe(
      "네이버",
    );
  });

  it("메일이 없으면 줄째로 뺀다 (null)", () => {
    expect(buildAccountInfo({ ...base, email: null }).email).toBeNull();
    expect(buildAccountInfo({ ...base, email: "" }).email).toBeNull();
    expect(buildAccountInfo({ ...base, email: "  " }).email).toBeNull();
  });

  it("이름이 없으면 null (공급자 이름 줄만 남는다)", () => {
    expect(buildAccountInfo({ ...base, displayName: null }).name).toBeNull();
    expect(buildAccountInfo({ ...base, displayName: " " }).name).toBeNull();
  });

  it("모르는 공급자면 공급자 이름도 null", () => {
    expect(
      buildAccountInfo({ ...base, provider: null }).providerLabel,
    ).toBeNull();
  });

  it("동의 시각이 없으면 날짜 없이 판 이름만, 판도 없으면 null", () => {
    const info = buildAccountInfo({
      ...base,
      termsAgreedAt: null,
      privacyVersion: null,
      privacyConfirmedAt: null,
    });
    expect(info.termsLine).toBe("동의 · 제1판");
    expect(info.privacyLine).toBeNull();
  });
});

describe("providersOf · pickKakaoUserId — 지우기 전에 읽어 두는 로그인 정보", () => {
  const id = (provider: string, extra: Record<string, unknown> = {}) => ({
    provider,
    id: "999",
    identity_data: {},
    ...extra,
  });

  it("공급자 목록: 알려진 것만, 중복 없이 (custom:naver 는 naver)", () => {
    expect(
      providersOf([
        id("kakao"),
        id("google"),
        id("custom:naver"),
        id("email"),
        id("kakao"),
      ]),
    ).toEqual(["kakao", "google", "naver"]);
    expect(providersOf(undefined)).toEqual([]);
    expect(providersOf([null, 3, "x", {}] as never)).toEqual([]);
  });

  it("카카오 회원번호: identity_data.provider_id → sub → id 순서, 숫자(1~20자리)만", () => {
    expect(
      pickKakaoUserId([
        id("kakao", { identity_data: { provider_id: "123456789", sub: "1" } }),
      ]),
    ).toBe("123456789");
    expect(
      pickKakaoUserId([id("kakao", { identity_data: { sub: "42" } })]),
    ).toBe("42");
    expect(
      pickKakaoUserId([id("kakao", { id: "77", identity_data: {} })]),
    ).toBe("77");
    expect(
      pickKakaoUserId([
        id("kakao", { identity_data: { provider_id: 123456789 } }),
      ]),
    ).toBe("123456789");
  });

  it("숫자가 아니거나 너무 길거나 비면 null — 본문에 다른 값이 끼어들 길을 막는다", () => {
    for (const bad of [
      "12 34",
      "12&target_id=9",
      "abc",
      "",
      "1".repeat(21),
      "-5",
      "1.5",
    ]) {
      expect(
        pickKakaoUserId([
          id("kakao", { id: bad, identity_data: { provider_id: bad } }),
        ]),
        bad,
      ).toBeNull();
    }
  });

  it("카카오 줄이 없으면 null (구글 · 네이버만)", () => {
    expect(pickKakaoUserId([id("google"), id("custom:naver")])).toBeNull();
    expect(pickKakaoUserId(undefined)).toBeNull();
  });
});

describe("withdrawOutcome — 알림에 안내 한 줄을 더 붙일지", () => {
  it("카카오 회원이고 끊기가 성공했을 때만 안내 없이 끝", () => {
    expect(withdrawOutcome(["kakao"], "ok")).toBe("withdrawn");
  });
  it("끊기 실패 · 키 없음 · 안 부름은 안내 한 줄을 더", () => {
    expect(withdrawOutcome(["kakao"], "failed")).toBe("withdrawn-unlinked");
    expect(withdrawOutcome(["kakao"], "skipped")).toBe("withdrawn-unlinked");
  });
  it("카카오 밖 공급자(구글 · 네이버)나 둘 이상 연결이면 늘 안내", () => {
    expect(withdrawOutcome(["google"], "skipped")).toBe("withdrawn-unlinked");
    expect(withdrawOutcome(["naver"], "skipped")).toBe("withdrawn-unlinked");
    expect(withdrawOutcome(["kakao", "google"], "ok")).toBe(
      "withdrawn-unlinked",
    );
  });
  it("공급자를 하나도 못 읽었으면 안내(알 수 없으니 안전한 쪽)", () => {
    expect(withdrawOutcome([], "skipped")).toBe("withdrawn-unlinked");
  });
});
