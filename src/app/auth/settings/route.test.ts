import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { LEGAL_DOCS } from "@/domain/legal";
import { readUserFromClaims } from "@/infra/supabase/current-user";
import { readMyConsent } from "@/infra/supabase/member-consent";
import {
  readMySettings,
  writeMySettings,
} from "@/infra/supabase/member-settings";

import { GET, POST } from "./route";

// connection() 은 Next.js 요청 안에서만 동작한다. 시험에서는 "요청 때 스위치를 읽는다"만 흉내 낸다.
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
vi.mock("@/infra/supabase/member-settings", () => ({
  readMySettings: vi.fn(),
  writeMySettings: vi.fn(),
}));

const makeClient = vi.mocked(createSupabaseServerClient);
const user = vi.mocked(readUserFromClaims);
const consent = vi.mocked(readMyConsent);
const read = vi.mocked(readMySettings);
const write = vi.mocked(writeMySettings);

const ORIGIN = "http://localhost:3000";
const DONE = {
  ok: true as const,
  termsVersion: LEGAL_DOCS.terms.version,
  privacyVersion: LEGAL_DOCS.privacy.version,
};

const get = () => GET();
const post = (
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
  raw?: string,
) =>
  POST(
    new Request(`${ORIGIN}/auth/settings`, {
      method: "POST",
      headers,
      body: raw ?? JSON.stringify(body),
    }),
  );

beforeEach(() => {
  makeClient.mockClear();
  user.mockReset();
  user.mockResolvedValue({ id: "11111111-2222-3333-4444-555555555555" });
  consent.mockReset();
  consent.mockResolvedValue(DONE);
  read.mockReset();
  read.mockResolvedValue({
    ok: true,
    row: {
      layout: { v: 1, order: ["home", "temp"], off: [] },
      font_scale: { v: 1, step: "large", follow: false },
      theme: "dark",
    },
  });
  write.mockReset();
  write.mockResolvedValue("ok");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/auth/settings — 스위치를 끄면", () => {
  it("GET · POST 모두 404 이고 아무것도 읽지 · 쓰지 않는다", async () => {
    expect((await get()).status).toBe(404);
    expect((await post({ theme: "dark" })).status).toBe(404);
    expect(makeClient).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("GET /auth/settings — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("거른 값 셋과 회원 해시(who)를 돌려주고 캐시하지 않는다", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = await res.json();
    expect(body.theme).toBe("dark");
    expect(body.fontScale).toEqual({ step: "large", follow: false });
    expect(body.layout.order[0]).toBe("home");
    expect(body.layout.order).toHaveLength(10); // 정규 모양
    // 회원 번호 자체는 내보내지 않는다 — 되돌릴 수 없는 해시만
    expect(JSON.stringify(body)).not.toContain("11111111-2222");
    expect(body.who).toMatch(/^[0-9a-f]{16}$/);
  });

  it("같은 회원은 같은 해시, 다른 회원은 다른 해시", async () => {
    const a = await (await get()).json();
    const b = await (await get()).json();
    user.mockResolvedValue({ id: "99999999-2222-3333-4444-555555555555" });
    const c = await (await get()).json();
    expect(a.who).toBe(b.who);
    expect(c.who).not.toBe(a.who);
  });

  it("비어 있거나 틀린 칸은 null", async () => {
    read.mockResolvedValue({
      ok: true,
      row: { layout: null, font_scale: { v: 9 }, theme: "blue" },
    });
    const body = await (await get()).json();
    expect(body).toMatchObject({ layout: null, fontScale: null, theme: null });
    read.mockResolvedValue({ ok: true, row: null });
    expect(await (await get()).json()).toMatchObject({
      layout: null,
      fontScale: null,
      theme: null,
    });
  });

  it("로그인하지 않았으면 401 (동의 · 설정을 읽지 않음)", async () => {
    user.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(consent).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("동의 전(비어 있음 · 모르는 판 · 읽기 실패)이면 403 이고 설정을 읽지 않는다", async () => {
    for (const c of [
      { ok: true as const, termsVersion: null, privacyVersion: null },
      {
        ok: true as const,
        termsVersion: "terms-1999",
        privacyVersion: DONE.privacyVersion,
      },
      { ok: false as const },
    ]) {
      consent.mockResolvedValue(c);
      const res = await get();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "consent" });
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("DB 읽기 오류는 502", async () => {
    read.mockResolvedValue({ ok: false });
    expect((await get()).status).toBe(502);
  });
});

describe("POST /auth/settings — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));

  it("바뀐 칸만 정규 글자로 쓰고 204", async () => {
    const res = await post({
      theme: "light",
      fontScale: { v: 1, step: "xlarge", follow: false },
    });
    expect(res.status).toBe(204);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-2222-3333-4444-555555555555",
      { theme: "light", fontScale: { step: "xlarge", follow: false } },
    );
  });

  it("틀린 값이 하나라도 있으면 400 이고 아무것도 쓰지 않는다", async () => {
    for (const body of [
      { theme: "blue" },
      { theme: "dark", fontScale: { v: 1, step: "huge", follow: false } },
      { other: 1 },
      {},
      { theme: null },
      [],
    ]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("셋 밖의 칸(이름 · 동의 · 판 값 등)은 거절 — 쓰는 열은 세 개뿐", async () => {
    for (const body of [
      { display_name: "x" },
      { terms_version: "x" },
      { theme: "dark", role: "advisor" },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("JSON 이 아니거나 깨졌거나 8KB 를 넘으면 쓰지 않는다 (400 · 413)", async () => {
    expect(
      (await post(null, { "content-type": "text/plain" }, "theme=dark")).status,
    ).toBe(400);
    expect(
      (await post(null, { "content-type": "application/json" }, "{not json"))
        .status,
    ).toBe(400);
    const big = JSON.stringify({
      layout: { v: 1, order: [], off: [], pad: "x".repeat(9000) },
    });
    expect(
      (await post(null, { "content-type": "application/json" }, big)).status,
    ).toBe(413);
    expect(write).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 401 · 동의 전이면 403 — 쓰지 않는다", async () => {
    user.mockResolvedValue(null);
    expect((await post({ theme: "dark" })).status).toBe(401);
    user.mockResolvedValue({ id: "u" });
    consent.mockResolvedValue({
      ok: true,
      termsVersion: null,
      privacyVersion: null,
    });
    expect((await post({ theme: "dark" })).status).toBe(403);
    consent.mockResolvedValue({ ok: false });
    expect((await post({ theme: "dark" })).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("줄이 없으면 409 · DB 오류는 502", async () => {
    write.mockResolvedValueOnce("no-row");
    expect((await post({ theme: "dark" })).status).toBe(409);
    write.mockResolvedValueOnce("error");
    expect((await post({ theme: "dark" })).status).toBe(502);
  });

  describe("다른 사이트에서 보낸 POST 막기 (로그아웃 · 동의와 같은 규칙)", () => {
    it("Origin 이 다른 사이트이면 403 이고 쓰지 않는다 (null 문자열도)", async () => {
      for (const origin of [
        "https://evil.example",
        "http://localhost:3001",
        "null",
      ]) {
        const res = await post(
          { theme: "dark" },
          { "content-type": "application/json", origin },
        );
        expect(res.status, origin).toBe(403);
      }
      expect(write).not.toHaveBeenCalled();
    });

    it("Origin 이 이 사이트이거나 없으면 통과", async () => {
      expect(
        (
          await post(
            { theme: "dark" },
            { "content-type": "application/json", origin: ORIGIN },
          )
        ).status,
      ).toBe(204);
      expect((await post({ theme: "dark" })).status).toBe(204);
    });
  });

  it("서버 기록에는 단계와 코드만 — 이메일 · 값이 새지 않는다", async () => {
    write.mockResolvedValueOnce("error");
    await post({ theme: "dark" });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("11111111-2222");
    expect(logged).not.toContain("dark");
  });
});

describe("GET · POST 밖의 방식", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));
  it("지원하지 않는 방식은 405 (Allow: GET, POST)", async () => {
    const mod = await import("./route");
    const handlers = mod as unknown as Record<string, unknown>;
    // PUT · PATCH · DELETE 를 내보내지 않는다 — Next.js 가 405 로 처리한다
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      expect(handlers[m], m).toBeUndefined();
    }
  });
});
