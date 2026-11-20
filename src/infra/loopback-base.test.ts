import { describe, expect, it } from "vitest";

import { loopbackBase } from "./loopback-base";

const DEFAULT = "https://api.example.com";

describe("loopbackBase — 시험 전용 주소는 이 컴퓨터(고리) 주소만", () => {
  it("값이 없으면 기본 주소", () => {
    expect(loopbackBase(undefined, DEFAULT)).toBe(DEFAULT);
    expect(loopbackBase(null, DEFAULT)).toBe(DEFAULT);
    expect(loopbackBase("", DEFAULT)).toBe(DEFAULT);
  });
  it("http://127.0.0.1[:포트] · http://localhost[:포트] 만 받는다 (끝 슬래시는 뗀다)", () => {
    expect(loopbackBase("http://127.0.0.1:54321", DEFAULT)).toBe(
      "http://127.0.0.1:54321",
    );
    expect(loopbackBase("http://localhost:54321/", DEFAULT)).toBe(
      "http://localhost:54321",
    );
    expect(loopbackBase("http://localhost", DEFAULT)).toBe("http://localhost");
  });
  it("그 밖의 값은 무시하고 기본 주소 — 키 · 비밀이 다른 곳으로 가지 않게", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example",
      "http://127.0.0.1.evil.example",
      "http://localhost.evil.example:80",
      "http://127.0.0.1:54321/x",
      "http://user@127.0.0.1:54321",
      "http://[::1]:54321",
      "https://127.0.0.1:54321",
      "file:///etc/passwd",
      "127.0.0.1:54321",
      " http://127.0.0.1:54321",
    ]) {
      expect(loopbackBase(bad, DEFAULT), bad).toBe(DEFAULT);
    }
  });
});
