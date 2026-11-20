import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readUserFromClaims } from "@/infra/supabase/current-user";
import { readMyConsent } from "@/infra/supabase/member-consent";
import { LEGAL_DOCS } from "@/domain/legal";

import { requireMemberConsent } from "./consent-gate";

// Next.js 의 notFound · redirect 는 던져서 끝낸다. 시험에서는 던진 글자로 어디로 갔는지 본다.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
const headerValue = vi.fn<(name: string) => string | null>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headerValue }),
}));
vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/infra/supabase/current-user", () => ({
  readUserFromClaims: vi.fn(),
}));
vi.mock("@/infra/supabase/member-consent", () => ({ readMyConsent: vi.fn() }));

const user = vi.mocked(readUserFromClaims);
const consent = vi.mocked(readMyConsent);
const DONE = {
  ok: true as const,
  termsVersion: LEGAL_DOCS.terms.version,
  privacyVersion: LEGAL_DOCS.privacy.version,
};

const run = () =>
  requireMemberConsent().then(
    (v) => `OK ${v.userId}`,
    (e: Error) => e.message,
  );

beforeEach(() => {
  vi.stubEnv("MEMBERS_ENABLED", "true");
  headerValue.mockReset();
  headerValue.mockReturnValue("/farm/settings?st=105");
  user.mockReset();
  user.mockResolvedValue({ id: "u-1" });
  consent.mockReset();
  consent.mockResolvedValue(DONE);
});
afterEach(() => vi.unstubAllEnvs());

describe("requireMemberConsent — 로그인 필요 쪽의 공통 관문 (결정 0065)", () => {
  it("스위치 끔이면 404 이고 로그인 · 동의를 읽지 않는다 (알파와 같다)", async () => {
    vi.stubEnv("MEMBERS_ENABLED", "");
    expect(await run()).toBe("NOT_FOUND");
    expect(user).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 로그인 시트로 (돌아올 곳은 지금 주소)", async () => {
    user.mockResolvedValue(null);
    expect(await run()).toBe(
      `REDIRECT /?login=1&next=${encodeURIComponent("/farm/settings?st=105")}`,
    );
    expect(consent).not.toHaveBeenCalled();
  });

  it("동의했으면 통과하고 사용자 id 를 준다", async () => {
    expect(await run()).toBe("OK u-1");
  });

  it("동의 전이면 동의 화면으로 (next 는 지금 주소)", async () => {
    consent.mockResolvedValue({
      ok: true,
      termsVersion: null,
      privacyVersion: null,
    });
    expect(await run()).toBe(
      `REDIRECT /consent?next=${encodeURIComponent("/farm/settings?st=105")}`,
    );
  });

  it("읽기가 실패해도 동의 화면으로 (회원 기능은 막는다)", async () => {
    consent.mockResolvedValue({ ok: false });
    expect(await run()).toBe(
      `REDIRECT /consent?next=${encodeURIComponent("/farm/settings?st=105")}`,
    );
  });

  it("지금 주소 머리가 없거나 위험하면 next 는 /", async () => {
    consent.mockResolvedValue({ ok: false });
    for (const h of [
      null,
      "",
      "//evil.example",
      "https://evil.example",
      "/consent",
    ]) {
      headerValue.mockReturnValue(h);
      expect(await run(), String(h)).toBe(`REDIRECT /consent?next=%2F`);
    }
  });
});
