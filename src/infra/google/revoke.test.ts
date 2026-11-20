import { afterEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_DEFAULT_BASE, googleBase, revokeGoogle } from "./revoke";

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

const TOKEN = "SECRET-PROVIDER-TOKEN-VALUE";
const respond = (status = 200, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("googleBase — 고리 주소만 바꿀 수 있다", () => {
  it("기본은 구글 공식 주소, 고리 주소만 받고 나머지는 무시", () => {
    expect(GOOGLE_DEFAULT_BASE).toBe("https://oauth2.googleapis.com");
    expect(googleBase(undefined)).toBe(GOOGLE_DEFAULT_BASE);
    expect(googleBase("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(googleBase("https://evil.example")).toBe(GOOGLE_DEFAULT_BASE);
  });
});

describe("revokeGoogle — 공식 문서의 요청 모양", () => {
  it("POST {주소}/revoke · form 본문 token=<토큰>, 200 이면 ok", async () => {
    spy();
    const fetchImpl = vi.fn(() => respond(200));
    const r = await revokeGoogle({
      token: TOKEN,
      baseUrl: "http://127.0.0.1:54321",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://127.0.0.1:54321/revoke");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(String(init.body)).toBe(`token=${TOKEN}`);
    // 토큰은 주소(검색어)에 실리지 않는다
    expect(url).not.toContain(TOKEN);
  });

  it("토큰에 특수문자가 있어도 본문에서 인코딩된다 (다른 값이 끼어들지 못함)", async () => {
    spy();
    const fetchImpl = vi.fn(() => respond(200));
    await revokeGoogle({
      token: "a&b=c d",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).toBe("token=a%26b%3Dc+d");
  });

  it("토큰이 없으면(빈 값 · 공백 · undefined) 부르지 않고 skipped", async () => {
    spy();
    const fetchImpl = vi.fn(() => respond(200));
    for (const token of ["", "   ", undefined, null]) {
      expect(
        await revokeGoogle({
          token,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).toBe("skipped");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("실패(400 등)는 failed — 기록에는 단계와 상태 코드만 (토큰 · 응답 원문 없음)", async () => {
    spy();
    const fetchImpl = vi.fn(() =>
      respond(400, { error: "invalid_token", extra: "SENSITIVE-BODY" }),
    );
    const r = await revokeGoogle({
      token: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("withdraw/google-revoke");
    expect(logged()).toContain("400");
    expect(logged()).not.toContain(TOKEN);
    expect(logged()).not.toContain("SENSITIVE-BODY");
  });

  it("네트워크 오류는 failed (network), 던지지 않는다", async () => {
    spy();
    const r = await revokeGoogle({
      token: TOKEN,
      fetchImpl: (() =>
        Promise.reject(new Error(`boom ${TOKEN}`))) as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("network");
    expect(logged()).not.toContain(TOKEN);
  });

  it("5초가 지나면 중단하고 failed (timeout)", async () => {
    spy();
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const pending = revokeGoogle({
        token: TOKEN,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toBe("failed");
      expect(logged()).toContain("timeout");
    } finally {
      vi.useRealTimers();
    }
  });
});
