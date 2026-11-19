import { describe, expect, it } from "vitest";

import {
  LOGIN_PROVIDERS,
  loginButtonHref,
  loginRequestNext,
  loginSheetNext,
  removeSearchKeys,
} from "./login-sheet";

describe("loginSheetNext — 시트를 연 화면으로 돌아오는 주소", () => {
  it("지금 경로와 검색어(st · crop · soil 등)를 그대로 싣는다", () => {
    expect(loginSheetNext("/water", "?st=105&crop=apple&soil=loam")).toBe(
      "/water?st=105&crop=apple&soil=loam",
    );
    expect(loginSheetNext("/", "")).toBe("/");
    expect(loginSheetNext("/more", "")).toBe("/more");
  });

  it("검색어 앞의 ? 가 있어도 없어도 같다", () => {
    expect(loginSheetNext("/water", "st=105")).toBe("/water?st=105");
  });

  it("login · next 검색어는 빼고 나머지는 살린다", () => {
    expect(loginSheetNext("/", "?login=1&next=%2Fwater&st=105")).toBe(
      "/?st=105",
    );
    expect(loginSheetNext("/water", "?login=failed&st=105")).toBe(
      "/water?st=105",
    );
  });

  it("위험한 값이면 /", () => {
    expect(loginSheetNext("//evil.example", "")).toBe("/");
    expect(loginSheetNext("/auth/login", "")).toBe("/");
  });
});

describe("loginRequestNext — /?login=1&next=… 로 열렸을 때의 돌아갈 주소", () => {
  it("login=1 이고 next 가 안전하면 그 next", () => {
    expect(
      loginRequestNext("?login=1&next=%2Ffarm%2Fsettings%3Fst%3D105"),
    ).toBe("/farm/settings?st=105");
  });

  it("login=1 이 아니면 null (시트가 열려 있지 않다)", () => {
    expect(loginRequestNext("?next=%2Fwater")).toBeNull();
    expect(loginRequestNext("?login=ok")).toBeNull();
    expect(loginRequestNext("?login=0")).toBeNull();
    expect(loginRequestNext("")).toBeNull();
  });

  it("login=1 이지만 next 가 없거나 위험하면 / (화면에서도 한 번 더 검사)", () => {
    expect(loginRequestNext("?login=1")).toBe("/");
    expect(loginRequestNext("?login=1&next=https%3A%2F%2Fevil.example")).toBe(
      "/",
    );
    expect(loginRequestNext("?login=1&next=%2F%2Fevil.example")).toBe("/");
    expect(loginRequestNext("?login=1&next=%2Fauth%2Flogin")).toBe("/");
  });
});

describe("loginButtonHref — 공급자 버튼의 주소 (<a> 로 건다)", () => {
  it("provider · next 를 인코딩해서 싣는다", () => {
    expect(loginButtonHref("kakao", "/water?st=105&crop=apple")).toBe(
      "/auth/login?provider=kakao&next=%2Fwater%3Fst%3D105%26crop%3Dapple",
    );
    expect(loginButtonHref("custom:naver", "/")).toBe(
      "/auth/login?provider=custom%3Anaver&next=%2F",
    );
    expect(loginButtonHref("google", "/more")).toBe(
      "/auth/login?provider=google&next=%2Fmore",
    );
  });

  it("위험한 next 는 / 로 바꾼다", () => {
    expect(loginButtonHref("google", "//evil.example")).toBe(
      "/auth/login?provider=google&next=%2F",
    );
  });
});

describe("removeSearchKeys — 주소에서 지정한 검색어만 지운다", () => {
  it("나머지 검색어 · # 는 그대로", () => {
    expect(
      removeSearchKeys("/water", "?login=ok&st=105&crop=apple", "#top", [
        "login",
      ]),
    ).toBe("/water?st=105&crop=apple#top");
  });

  it("지우고 남은 검색어가 없으면 ? 도 없앤다", () => {
    expect(
      removeSearchKeys("/", "?login=1&next=%2Fwater", "", ["login", "next"]),
    ).toBe("/");
    expect(removeSearchKeys("/more", "?login=failed", "#a", ["login"])).toBe(
      "/more#a",
    );
  });

  it("지울 것이 없으면 받은 그대로", () => {
    expect(removeSearchKeys("/water", "?st=105", "", ["login"])).toBe(
      "/water?st=105",
    );
    expect(removeSearchKeys("/water", "", "", ["login"])).toBe("/water");
  });
});

describe("LOGIN_PROVIDERS — 버튼 순서", () => {
  it("카카오 · 네이버 · 구글 순서, 시안 문구", () => {
    expect(LOGIN_PROVIDERS.map((p) => p.provider)).toEqual([
      "kakao",
      "custom:naver",
      "google",
    ]);
    expect(LOGIN_PROVIDERS.map((p) => p.label)).toEqual([
      "카카오 로그인",
      "네이버 로그인",
      "Google 계정으로 로그인",
    ]);
  });
});
