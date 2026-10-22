import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnv = { url?: string; anonKey?: string };

function readEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * 공개 키(anon)로 Supabase 클라이언트를 만든다.
 * 값 검사는 이 함수를 부를 때 한다. 파일을 불러올 때(빌드 때)는 검사하지 않는다.
 */
export function getSupabaseClient(
  env: SupabaseEnv = readEnv(),
): SupabaseClient {
  const url = env.url?.trim();
  const anonKey = env.anonKey?.trim();

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (!url || !anonKey) {
    throw new Error(
      `Supabase 연결 정보가 비어 있습니다: ${missing.join(", ")}. .env.local 에 값을 넣어 주세요.`,
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
