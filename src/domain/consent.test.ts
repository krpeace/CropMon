import { describe, expect, it } from "vitest";

import {
  CONSENT_COPY,
  CONSENT_SAVE_FAILED_TEXT,
  consentButtonLabel,
  consentHref,
  consentGate,
  consentPostAction,
  postLoginDestination,
  readConsentFailed,
  readConsentNext,
} from "./consent";
import { LEGAL_DOCS } from "./legal";

describe("확정 문구 — 글자 하나도 바꾸지 않는다 (11/19 확정, 이슈 #191 2절)", () => {
  it("제목 · 큰 버튼 · 체크 셋 · 요약 셋 · 안내 둘 · 나가기 버튼", () => {
    expect(CONSENT_COPY.title).toBe("CropMon을 시작하려면 동의가 필요해요");
    expect(CONSENT_COPY.agreeAll).toBe("모두 동의하고 시작하기");
    expect(CONSENT_COPY.agreeAllWhenChecked).toBe("동의하고 시작하기");
    expect(CONSENT_COPY.checks).toEqual([
      { id: "age14", label: "(필수) 만 14세 이상입니다", view: null },
      { id: "terms", label: "(필수) 이용약관 동의", view: "terms" },
      {
        id: "privacy",
        label: "(필수) 개인정보 수집·이용 안내 확인",
        view: "privacy",
      },
    ]);
    expect(CONSENT_COPY.viewButton).toBe("보기");
    expect(CONSENT_COPY.summary).toEqual([
      "· 받는 정보: 소셜 계정 회원 번호·이름(별명)·이메일, 농장 주소와 관수 기록",
      "· 쓰는 곳: 내 농장 토양 수분 계산. 통계에는 알아볼 수 없게 묶어서만 써요",
      "· 보관: 탈퇴하면 바로 삭제(암호화 백업은 최대 7일)",
    ]);
    expect(CONSENT_COPY.notice).toBe(
      "동의하지 않으면 회원 기능(내 농장·관수 기록)은 쓸 수 없어요. 로그인 없이 보던 화면은 그대로 쓸 수 있어요.",
    );
    expect(CONSENT_COPY.noticeLeave).toBe(
      "동의하지 않고 나가면 로그인 정보는 24시간 안에 자동으로 지워져요.",
    );
    expect(CONSENT_COPY.leave).toBe("동의하지 않고 나가기");
  });

  it("저장 실패 문장은 확정 문구 밖 — 검토 채팅 승인(11/20)으로 따로 둔다", () => {
    expect(CONSENT_SAVE_FAILED_TEXT).toBe(
      "동의를 저장하지 못했어요. 잠시 뒤 다시 해 주세요",
    );
    const confirmed = JSON.stringify(CONSENT_COPY);
    expect(confirmed).not.toContain(CONSENT_SAVE_FAILED_TEXT);
  });
});

describe("consentButtonLabel — 셋을 손으로 다 켜면 글자만 바뀐다", () => {
  it("모두 켜졌을 때만 '동의하고 시작하기'", () => {
    expect(
      consentButtonLabel({ age14: true, terms: true, privacy: true }),
    ).toBe("동의하고 시작하기");
  });

  it("하나라도 꺼져 있으면(아무것도 안 켠 때 포함) '모두 동의하고 시작하기'", () => {
    expect(
      consentButtonLabel({ age14: false, terms: false, privacy: false }),
    ).toBe("모두 동의하고 시작하기");
    expect(
      consentButtonLabel({ age14: true, terms: true, privacy: false }),
    ).toBe("모두 동의하고 시작하기");
    expect(
      consentButtonLabel({ age14: false, terms: true, privacy: true }),
    ).toBe("모두 동의하고 시작하기");
  });
});

describe("consentHref — 동의 화면 주소", () => {
  it("next 를 검사해서 인코딩해 싣는다", () => {
    expect(consentHref("/water?st=105&crop=apple")).toBe(
      "/consent?next=%2Fwater%3Fst%3D105%26crop%3Dapple",
    );
    expect(consentHref("/")).toBe("/consent?next=%2F");
  });

  it("위험하거나 /consent 자신이면 next 는 /", () => {
    expect(consentHref("//evil.example")).toBe("/consent?next=%2F");
    expect(consentHref("https://evil.example")).toBe("/consent?next=%2F");
    expect(consentHref("/auth/login")).toBe("/consent?next=%2F");
  });

  it("동의 화면이 자기 자신으로 돌고 도는 일이 없다 — next 가 /consent 로 시작하면 /", () => {
    expect(consentHref("/consent")).toBe("/consent?next=%2F");
    expect(consentHref("/consent?next=%2Fwater")).toBe("/consent?next=%2F");
    expect(consentHref("/consent/x")).toBe("/consent?next=%2F");
  });
});

describe("readConsentNext — 동의 화면 주소에서 돌아갈 곳 읽기", () => {
  it("안전하면 그 next, 없거나 위험하면 /", () => {
    expect(readConsentNext("/water?st=105")).toBe("/water?st=105");
    expect(readConsentNext(null)).toBe("/");
    expect(readConsentNext(undefined)).toBe("/");
    expect(readConsentNext("//evil.example")).toBe("/");
    expect(readConsentNext("/consent")).toBe("/");
  });
});

describe("consentPostAction — 동의하고 시작하기 폼의 보낼 곳", () => {
  it("POST /auth/consent?next=<검사한 next>", () => {
    expect(consentPostAction("/water?st=105")).toBe(
      "/auth/consent?next=%2Fwater%3Fst%3D105",
    );
    expect(consentPostAction("//evil.example")).toBe("/auth/consent?next=%2F");
  });
});

describe("consentHref(…, 저장 실패) · readConsentFailed", () => {
  it("저장에 실패하면 consent=failed 를 붙여 돌려보낸다", () => {
    expect(consentHref("/water?st=105", true)).toBe(
      "/consent?next=%2Fwater%3Fst%3D105&consent=failed",
    );
  });

  it("주소에서 consent=failed 만 알아본다", () => {
    expect(readConsentFailed("?next=%2F&consent=failed")).toBe(true);
    for (const q of [
      "",
      "?next=%2F",
      "?consent=1",
      "?consent=",
      "?consent=FAILED",
    ]) {
      expect(readConsentFailed(q), q).toBe(false);
    }
  });
});

describe("postLoginDestination — 콜백이 로그인 직후 보낼 곳 (이슈 #191 1절)", () => {
  const T = LEGAL_DOCS.terms.version;
  const P = LEGAL_DOCS.privacy.version;

  it("동의가 필요 없으면 next 에 login=ok", () => {
    expect(
      postLoginDestination(
        { ok: true, termsVersion: T, privacyVersion: P },
        "/water?st=105",
      ),
    ).toBe("/water?st=105&login=ok");
  });

  it("줄이 없거나 비었거나 모르는 판이면 동의 화면 (next 는 원래 next)", () => {
    for (const read of [
      { ok: true as const, termsVersion: null, privacyVersion: null },
      { ok: true as const, termsVersion: T, privacyVersion: null },
      {
        ok: true as const,
        termsVersion: "terms-1999-01-01",
        privacyVersion: P,
      },
    ]) {
      expect(postLoginDestination(read, "/water?st=105")).toBe(
        "/consent?next=%2Fwater%3Fst%3D105",
      );
    }
  });

  it("읽기가 실패하면 동의 화면 (로그인은 막지 않는다)", () => {
    expect(postLoginDestination({ ok: false }, "/water")).toBe(
      "/consent?next=%2Fwater",
    );
  });

  it("next 가 /consent 로 시작해도 동의 화면 next 는 / (돌고 도는 일 없음)", () => {
    expect(postLoginDestination({ ok: false }, "/consent?next=%2Fwater")).toBe(
      "/consent?next=%2F",
    );
  });
});

describe("consentGate — 로그인 필요 쪽의 공통 관문 판단", () => {
  const T = LEGAL_DOCS.terms.version;
  const P = LEGAL_DOCS.privacy.version;
  const done = { ok: true as const, termsVersion: T, privacyVersion: P };
  const empty = { ok: true as const, termsVersion: null, privacyVersion: null };

  it("스위치 끔이면 어디서든 404 (알파와 같다)", () => {
    for (const onConsentPage of [true, false]) {
      expect(
        consentGate({
          switchOn: false,
          signedIn: true,
          read: done,
          onConsentPage,
        }),
      ).toBe("not-found");
    }
  });

  it("로그인하지 않았으면 로그인 시트로", () => {
    for (const onConsentPage of [true, false]) {
      expect(
        consentGate({
          switchOn: true,
          signedIn: false,
          read: null,
          onConsentPage,
        }),
      ).toBe("login");
    }
  });

  it("관문(동의 화면 밖): 동의했으면 통과, 동의 전 · 읽기 실패면 동의 화면으로", () => {
    const g = (read: Parameters<typeof consentGate>[0]["read"]) =>
      consentGate({
        switchOn: true,
        signedIn: true,
        read,
        onConsentPage: false,
      });
    expect(g(done)).toBe("ok");
    expect(g(empty)).toBe("consent");
    expect(g({ ok: false })).toBe("consent");
  });

  it("동의 화면 자신: 이미 동의했으면 next 로 떠나고, 아니면(읽기 실패 포함) 그린다 — 자기 자신으로 보내지 않는다", () => {
    const g = (read: Parameters<typeof consentGate>[0]["read"]) =>
      consentGate({
        switchOn: true,
        signedIn: true,
        read,
        onConsentPage: true,
      });
    expect(g(done)).toBe("leave");
    expect(g(empty)).toBe("show");
    expect(g({ ok: false })).toBe("show");
    // 어떤 입력으로도 동의 화면에서 "consent"(= 동의 화면으로 보내기)는 나오지 않는다
    for (const read of [done, empty, { ok: false as const }, null]) {
      for (const signedIn of [true, false]) {
        for (const switchOn of [true, false]) {
          expect(
            consentGate({ switchOn, signedIn, read, onConsentPage: true }),
          ).not.toBe("consent");
        }
      }
    }
  });
});
