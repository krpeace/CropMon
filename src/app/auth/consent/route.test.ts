import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEGAL_DOCS } from "@/domain/legal";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

import { GET, POST } from "./route";

// connection() 은 Next.js 요청 안에서만 동작한다. 시험에서는 "요청 때 스위치를 읽는다"만 흉내 낸다.
vi.mock("@/app/_lib/members", async () => {
  const { membersEnabled } = await import("@/domain/members-switch");
  return { membersEnabledNow: async () => membersEnabled(process.env) };
});
vi.mock("@/app/_lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const makeClient = vi.mocked(createSupabaseServerClient);

const rpc = vi.fn();
const ORIGIN = "http://localhost:3000";
const T = LEGAL_DOCS.terms.version;
const P = LEGAL_DOCS.privacy.version;

const post = (
  qs = "",
  init: { headers?: Record<string, string>; body?: string } = {},
) =>
  POST(
    new Request(`${ORIGIN}/auth/consent${qs}`, {
      method: "POST",
      headers: init.headers,
      body: init.body,
    }),
  );

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  makeClient.mockReset();
  makeClient.mockResolvedValue({ rpc } as unknown as Awaited<
    ReturnType<typeof createSupabaseServerClient>
  >);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/auth/consent — 스위치를 끄면", () => {
  it("POST · GET 모두 404 이고 Supabase 를 건드리지 않는다", async () => {
    expect((await post("?next=%2F")).status).toBe(404);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("/auth/consent — 스위치를 켜면", () => {
  beforeEach(() => vi.stubEnv("MEMBERS_ENABLED", "true"));
  const next = encodeURIComponent("/water?st=105&crop=apple");

  it("POST 로 동의를 기록하고 303 으로 next?login=ok 에 돌려보낸다", async () => {
    const res = await post(`?next=${next}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/water?st=105&crop=apple&login=ok`,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_my_consent", {
      p_terms_version: T,
      p_privacy_version: P,
    });
  });

  it("판 값은 서버가 legal.ts 에서 넣는다 — 폼 · 주소로 온 판 값은 믿지 않는다", async () => {
    await post(`?next=${next}&terms_version=terms-evil&p_terms_version=x`, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "terms_version=terms-evil&privacy_version=privacy-evil&agree=all&p_terms_version=hack",
    });
    expect(rpc).toHaveBeenCalledWith("record_my_consent", {
      p_terms_version: T,
      p_privacy_version: P,
    });
  });

  it("체크 칸 상태(폼 값)와 상관없이 셋 모두로 기록한다 — 폼이 비어 있어도", async () => {
    for (const body of ["", "age14=on", "agree=all", "age14=on&terms=on"]) {
      rpc.mockClear();
      const res = await post(`?next=${next}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      expect(res.status, body).toBe(303);
      expect(rpc, body).toHaveBeenCalledTimes(1);
    }
  });

  it("next 가 없거나 위험하면 / 로 (또 동의 화면 자신으로는 안 돌려보낸다)", async () => {
    for (const n of [
      null,
      "",
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "/auth/login",
      "/consent",
    ]) {
      const qs = n === null ? "" : `?next=${encodeURIComponent(n)}`;
      const res = await post(qs);
      expect(res.headers.get("location"), String(n)).toBe(
        `${ORIGIN}/?login=ok`,
      );
    }
  });

  it("기록에 실패하면(오류 · 던짐) 동의 화면으로 consent=failed 와 돌려보내고, 기록에는 코드만", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "28000",
        message: "not authenticated someone@example.com",
      },
    });
    let res = await post(`?next=${next}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/consent?next=${next}&consent=failed`,
    );
    expect(res.headers.get("location")).not.toContain("login=ok");
    expect(logged()).toContain("28000");
    expect(logged()).not.toContain("someone@example.com");

    rpc.mockRejectedValueOnce(new Error("boom someone@example.com"));
    res = await post(`?next=${next}`);
    expect(res.headers.get("location")).toContain("consent=failed");
    expect(logged()).not.toContain("boom");
  });

  it("GET(링크 미리 불러오기) 은 기록하지 않고 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(rpc).not.toHaveBeenCalled();
  });

  describe("다른 사이트에서 보낸 POST 막기 (로그아웃과 같은 규칙)", () => {
    it("Origin 이 다른 사이트이면 403 이고 기록하지 않는다 (null 문자열도 다른 사이트)", async () => {
      for (const origin of [
        "https://evil.example",
        "http://localhost:3001",
        "null",
      ]) {
        const res = await post(`?next=${next}`, { headers: { origin } });
        expect(res.status, origin).toBe(403);
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it("Origin 이 이 사이트이거나 없으면 통과", async () => {
      expect(
        (await post(`?next=${next}`, { headers: { origin: ORIGIN } })).status,
      ).toBe(303);
      expect((await post(`?next=${next}`)).status).toBe(303);
      expect(rpc).toHaveBeenCalledTimes(2);
    });
  });
});
