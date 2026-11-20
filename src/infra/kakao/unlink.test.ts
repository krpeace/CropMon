import { afterEach, describe, expect, it, vi } from "vitest";

import { KAKAO_DEFAULT_BASE, kakaoBase, unlinkKakao } from "./unlink";

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

const KEY = "SECRET-ADMIN-KEY-VALUE";
const ok = (status = 200, body: unknown = { id: 123456789 }) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

describe("kakaoBase — 어드민 키를 실어 보낼 곳 (고리 주소만 바꿀 수 있다)", () => {
  it("값이 없으면 카카오 공식 주소", () => {
    expect(kakaoBase(undefined)).toBe(KAKAO_DEFAULT_BASE);
    expect(kakaoBase("")).toBe(KAKAO_DEFAULT_BASE);
    expect(KAKAO_DEFAULT_BASE).toBe("https://kapi.kakao.com");
  });

  it("고리(loopback) 주소만 받는다 — http://127.0.0.1:포트 · http://localhost:포트", () => {
    expect(kakaoBase("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(kakaoBase("http://localhost:54321")).toBe("http://localhost:54321");
    expect(kakaoBase("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321");
    expect(kakaoBase("http://localhost")).toBe("http://localhost");
  });

  it("그 밖의 값은 무시하고 공식 주소를 쓴다 — 키가 다른 곳으로 가지 않게", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example",
      "https://kapi.kakao.com.evil.example",
      "http://127.0.0.1.evil.example",
      "http://localhost.evil.example:80",
      "http://127.0.0.1:54321/x",
      "http://user@127.0.0.1:54321",
      "http://[::1]:54321",
      "https://127.0.0.1:54321", // https 는 고리가 아니라 시험 전용 경로가 아님
      "file:///etc/passwd",
      "127.0.0.1:54321",
      " http://127.0.0.1:54321",
    ]) {
      expect(kakaoBase(bad), bad).toBe(KAKAO_DEFAULT_BASE);
    }
  });
});

describe("unlinkKakao — 공식 문서의 요청 모양", () => {
  it("POST {주소}/v1/user/unlink · KakaoAK 어드민 키 · form 본문 target_id_type=user_id&target_id=회원번호", async () => {
    spy();
    const fetchImpl = vi.fn(() => ok());
    const r = await unlinkKakao({
      userId: "123456789",
      adminKey: KEY,
      baseUrl: "http://127.0.0.1:54321",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://127.0.0.1:54321/v1/user/unlink");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`KakaoAK ${KEY}`);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded;charset=utf-8",
    );
    expect(String(init.body)).toBe(
      "target_id_type=user_id&target_id=123456789",
    );
  });

  it("키가 없으면(빈 값 · 공백) 부르지 않고 skipped", async () => {
    spy();
    const fetchImpl = vi.fn(() => ok());
    for (const adminKey of ["", "   ", undefined]) {
      expect(
        await unlinkKakao({
          userId: "1",
          adminKey,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).toBe("skipped");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("회원번호가 숫자가 아니면 부르지 않는다 (failed)", async () => {
    spy();
    const fetchImpl = vi.fn(() => ok());
    for (const userId of ["", "12&x=1", "abc", "1".repeat(21)]) {
      expect(
        await unlinkKakao({
          userId,
          adminKey: KEY,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).toBe("failed");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("카카오가 오류를 돌려주면 failed — 기록에는 단계와 상태 코드만 (키 · 회원번호 · 응답 원문 없음)", async () => {
    spy();
    const fetchImpl = vi.fn(() =>
      ok(401, {
        msg: "this access token does not exist",
        code: -401,
        extra: "SENSITIVE-BODY",
      }),
    );
    const r = await unlinkKakao({
      userId: "123456789",
      adminKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("withdraw/kakao-unlink");
    expect(logged()).toContain("401");
    expect(logged()).not.toContain(KEY);
    expect(logged()).not.toContain("123456789");
    expect(logged()).not.toContain("SENSITIVE-BODY");
  });

  it("네트워크 오류는 failed (network)", async () => {
    spy();
    const r = await unlinkKakao({
      userId: "1",
      adminKey: KEY,
      fetchImpl: (() =>
        Promise.reject(new Error(`boom ${KEY}`))) as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("network");
    expect(logged()).not.toContain(KEY);
  });

  it("시간 제한(기본 5초)을 넘기면 중단하고 failed (timeout)", async () => {
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
      const pending = unlinkKakao({
        userId: "1",
        adminKey: KEY,
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
