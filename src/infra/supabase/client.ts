import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnv = { url?: string; anonKey?: string };

function readEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * 연결 정보(주소 · 공개 키)를 읽어 돌려준다. 비어 있으면 어느 값이 비었는지 알려 주며 던진다.
 * 값 검사는 이 함수를 부를 때 한다. 파일을 불러올 때(빌드 때)는 검사하지 않는다.
 */
export function requireSupabaseEnv(env: SupabaseEnv = readEnv()): {
  url: string;
  anonKey: string;
} {
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
  return { url, anonKey };
}

/**
 * 공개 키(anon)로 Supabase 클라이언트를 만든다. **세션 없음** — 공개 자료 읽기 전용이다.
 * 로그인한 사람의 쿠키 세션이 필요한 곳(`/auth/*`)은 `src/app/_lib/supabase/server-client.ts` 를 쓴다 (결정 0061).
 */
export function getSupabaseClient(
  env: SupabaseEnv = readEnv(),
): SupabaseClient {
  const { url, anonKey } = requireSupabaseEnv(env);

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
