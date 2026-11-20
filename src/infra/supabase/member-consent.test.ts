import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readMyConsent, recordMyConsent } from "./member-consent";

const selecting = (maybeSingle: () => Promise<unknown>) => {
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select };
};

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);

afterEach(() => vi.restoreAllMocks());
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("readMyConsent — 자기 members 줄에서 동의 판 두 개만 읽기", () => {
  it("두 열(terms_version · privacy_version)만 고른다 — 이름 · 이메일 같은 열은 읽지 않는다", async () => {
    spy();
    const { client, from, select } = selecting(async () => ({
      data: { terms_version: "terms-x", privacy_version: "privacy-x" },
      error: null,
    }));
    expect(await readMyConsent(client)).toEqual({
      ok: true,
      termsVersion: "terms-x",
      privacyVersion: "privacy-x",
    });
    expect(from).toHaveBeenCalledWith("members");
    expect(select).toHaveBeenCalledWith("terms_version, privacy_version");
  });

  it("줄이 없거나 칸이 비어 있으면 둘 다 null (동의 전)", async () => {
    spy();
    for (const data of [null, { terms_version: null, privacy_version: null }]) {
      const { client } = selecting(async () => ({ data, error: null }));
      expect(await readMyConsent(client)).toEqual({
        ok: true,
        termsVersion: null,
        privacyVersion: null,
      });
    }
  });

  it("글자가 아닌 값은 null 로 본다", async () => {
    spy();
    const { client } = selecting(async () => ({
      data: { terms_version: 3, privacy_version: {} },
      error: null,
    }));
    expect(await readMyConsent(client)).toEqual({
      ok: true,
      termsVersion: null,
      privacyVersion: null,
    });
  });

  it("오류이면 ok:false — 서버 기록에는 단계와 오류 코드만 (원문 · 개인 값 없음)", async () => {
    spy();
    const { client } = selecting(async () => ({
      data: null,
      error: { code: "42501", message: "denied for someone@example.com" },
    }));
    expect(await readMyConsent(client)).toEqual({ ok: false });
    expect(logged()).toContain("consent/read");
    expect(logged()).toContain("42501");
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("denied");
  });

  it("던져도 ok:false 이고 던지지 않는다", async () => {
    spy();
    const { client } = selecting(async () => {
      throw new Error("socket hang up for someone@example.com");
    });
    expect(await readMyConsent(client)).toEqual({ ok: false });
    expect(logged()).not.toContain("someone@example.com");
  });
});

describe("recordMyConsent — record_my_consent 부르기", () => {
  const rpcClient = (result: () => Promise<unknown>) => {
    const rpc = vi.fn(result);
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  };

  it("두 판 값을 인자 이름 그대로 넘기고 성공이면 true", async () => {
    spy();
    const { client, rpc } = rpcClient(async () => ({
      data: null,
      error: null,
    }));
    expect(await recordMyConsent(client, "terms-x", "privacy-x")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_my_consent", {
      p_terms_version: "terms-x",
      p_privacy_version: "privacy-x",
    });
  });

  it("오류 · 던짐이면 false — 기록에는 단계와 코드만", async () => {
    spy();
    let { client } = rpcClient(async () => ({
      data: null,
      error: { code: "22023", message: "bad value for someone@example.com" },
    }));
    expect(await recordMyConsent(client, "a", "b")).toBe(false);
    expect(logged()).toContain("consent/record");
    expect(logged()).toContain("22023");
    expect(logged()).not.toContain("someone@example.com");

    ({ client } = rpcClient(async () => {
      throw new Error("boom someone@example.com");
    }));
    expect(await recordMyConsent(client, "a", "b")).toBe(false);
    expect(logged()).not.toContain("boom");
  });
});
