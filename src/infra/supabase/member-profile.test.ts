import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readIdentity, readMemberRow } from "./member-profile";

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

describe("readIdentity — 로그인 정보(메일 · 공급자 · 카카오 회원번호)", () => {
  const client = (getUser: () => Promise<unknown>) =>
    ({ auth: { getUser } }) as unknown as SupabaseClient;

  it("메일 · 공급자 목록 · 카카오 회원번호를 돌려준다", async () => {
    spy();
    const r = await readIdentity(
      client(async () => ({
        data: {
          user: {
            id: "11111111-2222-3333-4444-555555555555",
            email: "tester@example.invalid",
            app_metadata: { provider: "google" },
            identities: [
              {
                provider: "kakao",
                id: "777",
                identity_data: { provider_id: "777" },
              },
              { provider: "google", id: "888", identity_data: {} },
            ],
          },
        },
        error: null,
      })),
    );
    expect(r).toEqual({
      userId: "11111111-2222-3333-4444-555555555555",
      email: "tester@example.invalid",
      providers: ["kakao", "google"],
      kakaoUserId: "777",
      signupProvider: "google",
    });
  });

  it("처음 가입한 공급자(app_metadata.provider)가 없거나 모르는 값이면 null", async () => {
    spy();
    for (const meta of [undefined, {}, { provider: "email" }]) {
      const r = await readIdentity(
        client(async () => ({
          data: {
            user: {
              id: "u",
              email: "a@example.invalid",
              app_metadata: meta,
              identities: [],
            },
          },
          error: null,
        })),
      );
      expect(r?.signupProvider, JSON.stringify(meta)).toBeNull();
    }
  });

  it("메일이 없으면 null", async () => {
    spy();
    const r = await readIdentity(
      client(async () => ({
        data: {
          user: {
            id: "u",
            email: undefined,
            identities: [{ provider: "kakao", id: "5", identity_data: {} }],
          },
        },
        error: null,
      })),
    );
    expect(r?.email).toBeNull();
  });

  it("로그인한 사람이 없거나 오류이거나 던지면 null — 던지지 않고, 기록에는 단계만", async () => {
    spy();
    expect(
      await readIdentity(
        client(async () => ({ data: { user: null }, error: null })),
      ),
    ).toBeNull();
    expect(
      await readIdentity(
        client(async () => ({
          data: { user: null },
          error: {
            code: "session_not_found",
            message: "x someone@example.com",
          },
        })),
      ),
    ).toBeNull();
    expect(
      await readIdentity(
        client(async () => {
          throw new Error("hang up someone@example.com");
        }),
      ),
    ).toBeNull();
    expect(logged()).not.toContain("someone@example.com");
    expect(logged()).not.toContain("hang up");
  });
});

describe("readMemberRow — 회원 정보 화면에 필요한 열만", () => {
  const selecting = (maybeSingle: () => Promise<unknown>) => {
    const select = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as SupabaseClient, from, select };
  };

  it("이름 · 공급자 · 가입일 · 동의 다섯 열만 고른다 (역할 · 화면 설정 열은 읽지 않음)", async () => {
    spy();
    const { client, from, select } = selecting(async () => ({
      data: { display_name: "가짜", provider: "kakao" },
      error: null,
    }));
    const r = await readMemberRow(client);
    expect(r).toEqual({
      ok: true,
      row: { display_name: "가짜", provider: "kakao" },
    });
    expect(from).toHaveBeenCalledWith("members");
    expect(select).toHaveBeenCalledWith(
      "display_name, provider, created_at, terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at",
    );
  });

  it("줄이 없으면 row null · 오류 · 던짐은 ok:false (기록에는 단계와 코드만)", async () => {
    spy();
    expect(
      await readMemberRow(
        selecting(async () => ({ data: null, error: null })).client,
      ),
    ).toEqual({ ok: true, row: null });
    expect(
      await readMemberRow(
        selecting(async () => ({
          data: null,
          error: { code: "PGRST301", message: "x someone@example.com" },
        })).client,
      ),
    ).toEqual({ ok: false });
    expect(
      await readMemberRow(
        selecting(async () => {
          throw new Error("boom someone@example.com");
        }).client,
      ),
    ).toEqual({ ok: false });
    expect(logged()).toContain("account/read");
    expect(logged()).toContain("PGRST301");
    expect(logged()).not.toContain("someone@example.com");
  });
});
