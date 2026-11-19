import { describe, expect, it } from "vitest";

import {
  LOGIN_REQUIRED_PATHS,
  classifyOAuthCallbackError,
  hasAuthCookie,
  isAllowedProvider,
  loginRequiredRedirect,
  requiresLogin,
  validateRedirectPath,
  withLoginNotice,
} from "./auth";

describe("validateRedirectPath — 돌아갈 주소 검사 (열린 리디렉션 막기)", () => {
  it("우리 사이트 안의 경로는 그대로 통과 (검색어 · # 를 살린다)", () => {
    expect(validateRedirectPath("/")).toBe("/");
    expect(validateRedirectPath("/water")).toBe("/water");
    expect(validateRedirectPath("/water?st=105&crop=apple")).toBe(
      "/water?st=105&crop=apple",
    );
    expect(validateRedirectPath("/water?st=105&crop=apple#top")).toBe(
      "/water?st=105&crop=apple#top",
    );
    expect(validateRedirectPath("/farm/settings")).toBe("/farm/settings");
  });

  it("지금 쓰는 검색어(st · crop · soil · kc · d · run)가 모두 통과한다", () => {
    const p = "/water?st=101&crop=apple&soil=loam&kc=1.05&d=2026-11-19&run=3";
    expect(validateRedirectPath(p)).toBe(p);
  });

  it("검색어 '값' 안의 %2F 는 경로가 아니므로 의도대로 통과한다 (정상 주소를 막지 않는다)", () => {
    // 경로 부분만 디코딩해 본다. 값 안의 %2F%2F · %5C 는 거절하지 않는다.
    expect(validateRedirectPath("/water?back=%2F%2Fx")).toBe(
      "/water?back=%2F%2Fx",
    );
    expect(validateRedirectPath("/water?u=https%3A%2F%2Fx.example")).toBe(
      "/water?u=https%3A%2F%2Fx.example",
    );
    expect(validateRedirectPath("/water?u=https://x.example/a")).toBe(
      "/water?u=https://x.example/a",
    );
    expect(validateRedirectPath("/water?p=a%5Cb")).toBe("/water?p=a%5Cb");
  });

  it("남의 사이트 · 스킴 · 이중 슬래시 · 역슬래시를 거절하고 / 로 바꾼다", () => {
    for (const bad of [
      "//evil.example",
      "//evil.example/path",
      "https://evil.example",
      "http://evil.example/x",
      "javascript:alert(1)",
      "data:text/html,x",
      "/\\evil.example",
      "\\\\evil.example",
      "\\evil",
      "/a\\b",
      "evil.example",
      "water",
      "?x=1",
      "#top",
    ]) {
      expect(validateRedirectPath(bad), bad).toBe("/");
    }
  });

  it("인코딩으로 숨긴 것(경로 앞머리)을 거절한다", () => {
    for (const bad of [
      "/%2f%2fevil.example",
      "/%2F%2Fevil.example",
      "/%5cevil.example",
      "/%5Cevil.example",
      "%2f%2fevil.example",
      "/%252f%252fevil.example", // 두 번 인코딩
      "/%255cevil.example",
      "/%2e%2e%5cevil",
    ]) {
      expect(validateRedirectPath(bad), bad).toBe("/");
    }
  });

  it("제어 문자는 전체(경로 · 검색어 · # 어디든)에서 거절한다", () => {
    for (const bad of [
      "/water\n",
      "/water\r\nSet-Cookie: x=1",
      "/water?x=1\t2",
      "/wa\u0000ter",
      "/water\u007f",
      "/water%0d%0aSet-Cookie:x",
      "/water%00",
      "/water?x=%0a",
      "/water#a%0d",
    ]) {
      expect(validateRedirectPath(bad), JSON.stringify(bad)).toBe("/");
    }
  });

  it("문자열이 아니거나 비었거나 너무 길면 /", () => {
    expect(validateRedirectPath(null)).toBe("/");
    expect(validateRedirectPath(undefined)).toBe("/");
    expect(validateRedirectPath("")).toBe("/");
    expect(validateRedirectPath(123 as unknown as string)).toBe("/");
    expect(validateRedirectPath(" /water")).toBe("/"); // 앞 공백은 다듬지 않고 거절
    expect(validateRedirectPath("/" + "a".repeat(2048))).toBe("/");
    const justFits = "/" + "a".repeat(2047);
    expect(validateRedirectPath(justFits)).toBe(justFits);
  });

  it("로그인 길(/auth/…) 자신으로는 돌아가지 않는다 (돌고 도는 것 방지)", () => {
    for (const bad of [
      "/auth",
      "/auth/login",
      "/auth/callback?code=x",
      "/auth/signout",
      "/AUTH/login".toLowerCase(),
      "/%61uth/login", // 'a' 를 인코딩해 숨김
      "/auth%2flogin",
    ]) {
      expect(validateRedirectPath(bad), bad).toBe("/");
    }
    // 비슷한 이름은 통과
    expect(validateRedirectPath("/authors")).toBe("/authors");
    expect(validateRedirectPath("/water?next=/auth/login")).toBe(
      "/water?next=/auth/login",
    );
  });
});

describe("classifyOAuthCallbackError — 취소 / 실패 가르기", () => {
  it("사용자가 공급자 화면에서 취소하면 cancelled (access_denied 가 어디에 있어도)", () => {
    expect(classifyOAuthCallbackError("access_denied", null, null)).toBe(
      "cancelled",
    );
    expect(classifyOAuthCallbackError(null, null, "access_denied")).toBe(
      "cancelled",
    );
    expect(
      classifyOAuthCallbackError(
        "server_error",
        "Error getting user: access_denied",
        null,
      ),
    ).toBe("cancelled");
    expect(
      classifyOAuthCallbackError("ACCESS_DENIED", undefined, undefined),
    ).toBe("cancelled");
  });

  it("그 밖의 오류 · 모르는 오류 · 비어 있음은 failed", () => {
    expect(classifyOAuthCallbackError("server_error", null, null)).toBe(
      "failed",
    );
    expect(
      classifyOAuthCallbackError(
        null,
        "something broke",
        "flow_state_not_found",
      ),
    ).toBe("failed");
    expect(classifyOAuthCallbackError(null, null, null)).toBe("failed");
    expect(classifyOAuthCallbackError(undefined, undefined, undefined)).toBe(
      "failed",
    );
    expect(classifyOAuthCallbackError("", "", "")).toBe("failed");
    // 옛 초대 전용 갈래는 없다 (공개 가입)
    expect(classifyOAuthCallbackError("signup_disabled", null, null)).toBe(
      "failed",
    );
  });
});

describe("isAllowedProvider — 공급자 허용 목록 (두 번째 인자: 네이버 스위치)", () => {
  it("카카오 · 구글은 네이버 스위치와 상관없이 참", () => {
    for (const naver of [true, false]) {
      expect(isAllowedProvider("kakao", naver)).toBe(true);
      expect(isAllowedProvider("google", naver)).toBe(true);
    }
  });

  it("네이버(custom:naver)는 스위치를 켠 때만 참 — 끄면 모르는 공급자와 같다", () => {
    expect(isAllowedProvider("custom:naver", true)).toBe(true);
    expect(isAllowedProvider("custom:naver", false)).toBe(false);
  });

  it("그 밖은 스위치와 상관없이 모두 거짓 (대소문자 · 공백 · 다른 공급자 · 빈 값)", () => {
    for (const naver of [true, false]) {
      for (const bad of [
        "",
        " kakao",
        "kakao ",
        "Kakao",
        "GOOGLE",
        "naver",
        "custom:",
        "custom:other",
        "custom:naver2",
        "github",
        "kakao,google",
        "kakao&next=https://evil.example",
        "../kakao",
      ]) {
        expect(isAllowedProvider(bad, naver), bad).toBe(false);
      }
      expect(isAllowedProvider(null, naver)).toBe(false);
      expect(isAllowedProvider(undefined, naver)).toBe(false);
      expect(isAllowedProvider(1 as unknown as string, naver)).toBe(false);
    }
  });
});

describe("requiresLogin — 로그인이 필요한 주소 (공개가 기본)", () => {
  it("목록: 농장 설정 · 작물 설정 · 회원 정보", () => {
    expect([...LOGIN_REQUIRED_PATHS]).toEqual([
      "/farm/settings",
      "/farm/crop",
      "/account",
    ]);
  });

  it("목록의 주소와 그 아래 주소는 로그인이 필요하다", () => {
    for (const p of [
      "/farm/settings",
      "/farm/settings/",
      "/farm/settings/area",
      "/farm/crop",
      "/farm/crop/apple/edit",
      "/account",
      "/account/withdraw",
      "/account/",
    ]) {
      expect(requiresLogin(p), p).toBe(true);
    }
  });

  it("그 밖의 모든 주소는 공개다 (/my-farm 미리보기 · 서비스 화면 · /auth · /api)", () => {
    for (const p of [
      "/",
      "/my-farm",
      "/my-farm/",
      "/water",
      "/temperature",
      "/more",
      "/layout",
      "/terms",
      "/privacy",
      "/farm",
      "/farm/",
      "/farmer",
      "/farm/other",
      "/accounts",
      "/account-info",
      "/auth/login",
      "/auth/callback",
      "/auth/signout",
      "/api/health",
    ]) {
      expect(requiresLogin(p), p).toBe(false);
    }
  });

  it("인코딩 · 점 · 겹친 슬래시로 목록을 비켜 가지 못한다", () => {
    for (const p of [
      "/%61ccount",
      "/acc%6funt/x",
      "/farm/%73ettings",
      "//account",
      "/./account",
      "/water/../account",
      "/farm//settings",
      "/account/./x",
      "/farm/settings/../crop",
    ]) {
      expect(requiresLogin(p), p).toBe(true);
    }
  });

  it("풀 수 없는 인코딩은 안전한 쪽(로그인 필요)으로 본다", () => {
    expect(requiresLogin("/%E0%A4%A")).toBe(true);
  });
});

describe("hasAuthCookie — 로그인 쿠키가 있는지 (이름 모양으로)", () => {
  it("sb-<프로젝트>-auth-token 과 쪼개진 .0 .1 은 참", () => {
    expect(hasAuthCookie(["sb-abcdefgh-auth-token"])).toBe(true);
    expect(hasAuthCookie(["x", "sb-127-auth-token.0", "y"])).toBe(true);
    expect(hasAuthCookie(["sb-my-project-ref-auth-token.12"])).toBe(true);
  });

  it("코드 검증값 쿠키(로그인 도중에만 있음) · 다른 쿠키 · 빈 목록은 거짓", () => {
    expect(hasAuthCookie(["sb-abcdefgh-auth-token-code-verifier"])).toBe(false);
    expect(hasAuthCookie(["cropmon-menus", "cropmon-theme"])).toBe(false);
    expect(hasAuthCookie([])).toBe(false);
    expect(hasAuthCookie(["sb-auth-token"])).toBe(false);
    expect(hasAuthCookie(["xsb-abc-auth-token"])).toBe(false);
    expect(hasAuthCookie(["sb-abc-auth-token.x"])).toBe(false);
    expect(hasAuthCookie(["sb-abc-auth-tokens"])).toBe(false);
  });
});

describe("withLoginNotice — 돌아갈 주소에 성공 · 취소 · 실패 표시 하나", () => {
  it("성공은 login=ok (검색어 · # 를 살린다)", () => {
    expect(withLoginNotice("/water?st=105&crop=apple#top", "ok")).toBe(
      "/water?st=105&crop=apple&login=ok#top",
    );
    expect(withLoginNotice("/", "ok")).toBe("/?login=ok");
    expect(withLoginNotice("/?login=1&next=%2Fwater", "ok")).toBe("/?login=ok");
  });

  it("검색어를 살리고 login 표시를 붙인다", () => {
    expect(withLoginNotice("/water?st=105&crop=apple", "cancelled")).toBe(
      "/water?st=105&crop=apple&login=cancelled",
    );
    expect(withLoginNotice("/", "failed")).toBe("/?login=failed");
    expect(withLoginNotice("/water", "failed")).toBe("/water?login=failed");
  });

  it("이미 있던 login · next 는 지우고, # 는 살린다", () => {
    expect(withLoginNotice("/?login=1&next=%2Fwater&st=105", "failed")).toBe(
      "/?st=105&login=failed",
    );
    expect(withLoginNotice("/water?login=cancelled#top", "failed")).toBe(
      "/water?login=failed#top",
    );
  });
});

describe("loginRequiredRedirect — 로그인 필요 주소를 비로그인으로 열었을 때", () => {
  it("/?login=1&next=<원래 주소> 로 보낸다", () => {
    expect(loginRequiredRedirect("/farm/settings", "")).toBe(
      "/?login=1&next=%2Ffarm%2Fsettings",
    );
    expect(loginRequiredRedirect("/account", "?st=105&crop=apple")).toBe(
      "/?login=1&next=%2Faccount%3Fst%3D105%26crop%3Dapple",
    );
  });

  it("원래 주소가 위험하면 next 는 /", () => {
    expect(loginRequiredRedirect("//evil.example", "")).toBe(
      "/?login=1&next=%2F",
    );
  });
});
