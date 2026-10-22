import { describe, expect, it } from "vitest";

import { getSupabaseClient } from "./client";

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

describe("getSupabaseClient", () => {
  it("주소와 키가 있으면 클라이언트를 만든다", () => {
    const client = getSupabaseClient({
      url: "https://example.supabase.co",
      anonKey: "dummy",
    });
    expect(typeof client.from).toBe("function");
  });

  it("주소가 비었으면 어떤 값이 비었는지 알려 준다", () => {
    expect(() => getSupabaseClient({ url: "", anonKey: "dummy" })).toThrow(
      `Supabase 연결 정보가 비어 있습니다: ${URL_KEY}`,
    );
  });

  it("키가 비었으면 어떤 값이 비었는지 알려 준다", () => {
    expect(() =>
      getSupabaseClient({ url: "https://example.supabase.co" }),
    ).toThrow(`Supabase 연결 정보가 비어 있습니다: ${ANON_KEY}`);
  });

  it("둘 다 비었으면 둘 다 알려 주고, .env.local 을 안내한다", () => {
    expect(() => getSupabaseClient({ url: " ", anonKey: undefined })).toThrow(
      `Supabase 연결 정보가 비어 있습니다: ${URL_KEY}, ${ANON_KEY}. .env.local 에 값을 넣어 주세요.`,
    );
  });
});
