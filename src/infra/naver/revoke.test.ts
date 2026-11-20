import { afterEach, describe, expect, it, vi } from "vitest";

import { NAVER_DEFAULT_BASE, naverBase, revokeNaver } from "./revoke";

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

const TOKEN = "SECRET-NAVER-TOKEN";
const ID = "naver-client-id-value";
const SECRET = "SECRET-NAVER-CLIENT-SECRET";
const respond = (status = 200, body: unknown = { result: "success" }) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const input = { token: TOKEN, clientId: ID, clientSecret: SECRET };

// ⚠ 네이버 공식 문서를 이 환경에서 읽지 못했다(결정 0068). 요청 모양은 문서를 옮긴 글들이 일치하는 것(검토 채팅 확인)을 따랐고
// 미리보기 실제 탈퇴로 확인한다. 이 시험은 "우리가 그렇게 보낸다"를 못 박는다.

describe("naverBase — 고리 주소만 바꿀 수 있다", () => {
  it("기본은 네이버 공식 주소, 고리 주소만 받고 나머지는 무시", () => {
    expect(NAVER_DEFAULT_BASE).toBe("https://nid.naver.com");
    expect(naverBase(undefined)).toBe(NAVER_DEFAULT_BASE);
    expect(naverBase("http://localhost:54321")).toBe("http://localhost:54321");
    expect(naverBase("https://evil.example")).toBe(NAVER_DEFAULT_BASE);
  });
});

describe("revokeNaver — 접근 토큰 삭제", () => {
  it("POST {주소}/oauth2.0/token · form 본문 grant_type=delete · client_id · client_secret · access_token · service_provider=NAVER", async () => {
    spy();
    const fetchImpl = vi.fn(() => respond());
    const r = await revokeNaver({
      ...input,
      baseUrl: "http://127.0.0.1:54321",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://127.0.0.1:54321/oauth2.0/token");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "delete",
      client_id: ID,
      client_secret: SECRET,
      access_token: TOKEN,
      service_provider: "NAVER",
    });
    // 비밀 · 토큰은 주소(검색어)에 실리지 않는다 — 본문으로만
    expect(url).not.toContain(SECRET);
    expect(url).not.toContain(TOKEN);
    expect(url).not.toContain("?");
  });

  it("토큰 · 아이디 · 시크릿 중 하나라도 비면 부르지 않고 skipped", async () => {
    spy();
    const fetchImpl = vi.fn(() => respond());
    for (const bad of [
      { ...input, token: "" },
      { ...input, token: undefined },
      { ...input, clientId: "" },
      { ...input, clientId: undefined },
      { ...input, clientSecret: "  " },
      { ...input, clientSecret: undefined },
    ]) {
      expect(
        await revokeNaver({
          ...bad,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).toBe("skipped");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("200 이어도 result 가 success 가 아니면(오류 본문) failed — 비밀 · 토큰 · 원문은 기록에 없다", async () => {
    spy();
    for (const body of [
      { error: "invalid_request", error_description: "SENSITIVE-BODY" },
      {},
      { result: "fail" },
    ]) {
      const r = await revokeNaver({
        ...input,
        fetchImpl: (() => respond(200, body)) as unknown as typeof fetch,
      });
      expect(r, JSON.stringify(body)).toBe("failed");
    }
    expect(logged()).toContain("withdraw/naver-revoke");
    expect(logged()).not.toContain("SENSITIVE-BODY");
    expect(logged()).not.toContain(TOKEN);
    expect(logged()).not.toContain(SECRET);
    expect(logged()).not.toContain(ID);
  });

  it("본문이 JSON 이 아니면 failed", async () => {
    spy();
    const r = await revokeNaver({
      ...input,
      fetchImpl: (() =>
        Promise.resolve(
          new Response("<html>no</html>", { status: 200 }),
        )) as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
  });

  it("HTTP 오류는 failed — 기록에는 상태 코드만", async () => {
    spy();
    const r = await revokeNaver({
      ...input,
      fetchImpl: (() => respond(401, {})) as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("401");
    expect(logged()).not.toContain(SECRET);
  });

  it("네트워크 오류는 failed (network)", async () => {
    spy();
    const r = await revokeNaver({
      ...input,
      fetchImpl: (() =>
        Promise.reject(
          new Error(`boom ${SECRET} ${TOKEN}`),
        )) as unknown as typeof fetch,
    });
    expect(r).toBe("failed");
    expect(logged()).toContain("network");
    expect(logged()).not.toContain(SECRET);
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
      const pending = revokeNaver({
        ...input,
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
