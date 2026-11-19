import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readUserFromClaims } from "./current-user";

const clientWith = (getClaims: () => Promise<unknown>) =>
  ({ auth: { getClaims } }) as unknown as SupabaseClient;

afterEach(() => vi.restoreAllMocks());

describe("readUserFromClaims — 토큰에서 로그인한 사람 읽기 (id 만)", () => {
  it("로그인한 사람의 토큰이면 id 만 돌려준다 (이메일 · 전화 · 메타는 안 돌려줌)", async () => {
    const user = await readUserFromClaims(
      clientWith(async () => ({
        data: {
          claims: {
            sub: "11111111-2222-3333-4444-555555555555",
            role: "authenticated",
            email: "someone@example.com",
            phone: "01012345678",
            user_metadata: { name: "홍길동" },
          },
        },
        error: null,
      })),
    );
    expect(user).toEqual({ id: "11111111-2222-3333-4444-555555555555" });
    expect(Object.keys(user!)).toEqual(["id"]);
  });

  it("세션이 없거나 오류이거나 로그인한 사람의 토큰이 아니면 null", async () => {
    expect(
      await readUserFromClaims(
        clientWith(async () => ({ data: null, error: null })),
      ),
    ).toBeNull();
    expect(
      await readUserFromClaims(
        clientWith(async () => ({ data: null, error: new Error("x") })),
      ),
    ).toBeNull();
    expect(
      await readUserFromClaims(
        clientWith(async () => ({
          data: { claims: { sub: "u1", role: "anon" } },
          error: null,
        })),
      ),
    ).toBeNull();
    expect(
      await readUserFromClaims(
        clientWith(async () => ({
          data: { claims: { role: "authenticated" } },
          error: null,
        })),
      ),
    ).toBeNull();
    expect(
      await readUserFromClaims(
        clientWith(async () => ({
          data: { claims: { sub: "", role: "authenticated" } },
          error: null,
        })),
      ),
    ).toBeNull();
  });

  it("확인하다 던져도 화면이 멈추지 않고 null (서버 기록에는 개인 값 없이 이름만)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await readUserFromClaims(
      clientWith(async () => {
        throw new Error("boom someone@example.com");
      }),
    );
    expect(user).toBeNull();
    expect(JSON.stringify(spy.mock.calls)).not.toContain("someone@example.com");
  });
});
