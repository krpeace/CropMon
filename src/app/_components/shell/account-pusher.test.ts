import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountPusher, PUSH_DELAY_MS } from "./account-pusher";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAccountPusher — 400ms 모아 마지막 값만 한 번에 보낸다", () => {
  it("여러 번 바꿔도 400ms 뒤 마지막 값 한 번만 보낸다", () => {
    const send = vi.fn();
    const p = createAccountPusher({ send, enabled: () => true });
    p.push({ theme: "dark" });
    vi.advanceTimersByTime(100);
    p.push({ theme: "light" });
    vi.advanceTimersByTime(PUSH_DELAY_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + 100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ theme: "light" });
  });

  it("다른 칸은 합쳐 한 번에 보낸다", () => {
    const send = vi.fn();
    const p = createAccountPusher({ send, enabled: () => true });
    p.push({ theme: "dark" });
    p.push({ fontScale: { step: "large", follow: false } });
    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      theme: "dark",
      fontScale: { step: "large", follow: false },
    });
  });

  it("flush 는 기다리지 않고 바로 보낸다 (pagehide · 닫는 중) — 두 번 보내지 않는다", () => {
    const send = vi.fn();
    const p = createAccountPusher({ send, enabled: () => true });
    p.push({ theme: "dark" });
    p.flush();
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PUSH_DELAY_MS * 3);
    expect(send).toHaveBeenCalledTimes(1);
    p.flush(); // 보낼 것이 없으면 아무것도 안 한다
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("회원이 아니거나(enabled=false) 막혀 있으면 요청 0 — 모아 두지도 않는다", () => {
    const send = vi.fn();
    let on = false;
    const p = createAccountPusher({ send, enabled: () => on });
    p.push({ theme: "dark" });
    vi.advanceTimersByTime(PUSH_DELAY_MS * 2);
    p.flush();
    expect(send).not.toHaveBeenCalled();
    on = true;
    p.push({ theme: "light" });
    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ theme: "light" }); // 앞의 거절된 값이 섞이지 않는다
  });

  it("send 가 던져도 화면은 계속된다 (조용히)", () => {
    const send = vi.fn(() => {
      throw new Error("network");
    });
    const p = createAccountPusher({ send, enabled: () => true });
    p.push({ theme: "dark" });
    expect(() => vi.advanceTimersByTime(PUSH_DELAY_MS)).not.toThrow();
    p.push({ theme: "light" });
    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
