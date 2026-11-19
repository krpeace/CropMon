import { afterEach, describe, expect, it, vi } from "vitest";

import { logAuthError } from "./auth-log";

afterEach(() => vi.restoreAllMocks());

const logged = (spy: ReturnType<typeof vi.spyOn>) =>
  JSON.stringify(spy.mock.calls);

describe("logAuthError — 서버 기록에는 단계와 오류 종류(코드)만 남긴다", () => {
  it("단계 이름과 오류 코드만 기록한다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthError("callback/exchange", "flow_state_not_found");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[auth] callback/exchange", {
      code: "flow_state_not_found",
    });
  });

  it("코드가 없거나 모양이 이상하면 unknown (이메일 · 문장 · 사용자 ID · 토큰이 섞여 들어와도 안 남김)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of [
      undefined,
      null,
      "",
      "someone@example.com",
      "user someone failed to log in",
      "11111111-2222-3333-4444-555555555555",
      "a".repeat(65),
      "eyJhbGciOiJIUzI1NiJ9.x.y",
    ]) {
      logAuthError("callback/rpc", bad);
    }
    for (const call of spy.mock.calls) {
      expect(call[1]).toEqual({ code: "unknown" });
    }
    const all = logged(spy);
    expect(all).not.toContain("someone");
    expect(all).not.toContain("11111111");
    expect(all).not.toContain("eyJ");
  });

  it("PostgREST · Postgres 코드(숫자 · 글자)는 그대로 남긴다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthError("callback/rpc", "42501");
    logAuthError("callback/rpc", "PGRST202");
    expect(spy.mock.calls.map((c) => c[1])).toEqual([
      { code: "42501" },
      { code: "PGRST202" },
    ]);
  });
});
