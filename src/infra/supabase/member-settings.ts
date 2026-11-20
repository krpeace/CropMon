import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsUpdate } from "@/domain/account-settings";

import { logAuthError } from "./auth-log";

/**
 * 화면 설정(계정 저장) 읽기 · 쓰기 (이슈 #193, 결정 0066). Next.js 를 모른다(결정 0033) — 로그인한 사람의 쿠키 세션 클라이언트를 받는다.
 * **읽는 열도 쓰는 열도 `layout` · `font_scale` · `theme` 셋뿐**이다(이름 · 이메일 · 동의 열은 건드리지 않는다).
 * 서버 기록에는 단계와 오류 코드만 남긴다(원문 · 개인 값은 안 남김, 결정 0061).
 */

export type SettingsRow = Record<string, unknown>;

/** 자기 줄의 세 열을 읽는다(RLS 로 자기 줄만). 줄이 없으면 `row: null`. 오류 · 던짐은 `{ ok: false }`. */
export async function readMySettings(
  client: SupabaseClient,
): Promise<{ ok: true; row: SettingsRow | null } | { ok: false }> {
  try {
    const { data, error } = await client
      .from("members")
      .select("layout, font_scale, theme")
      .maybeSingle();
    if (error) {
      logAuthError("settings/read", error.code);
      return { ok: false };
    }
    return { ok: true, row: (data as SettingsRow | null) ?? null };
  } catch {
    logAuthError("settings/read");
    return { ok: false };
  }
}

/**
 * 바뀐 칸만 DB 열 이름으로 바꿔 자기 줄(`user_id`)에 쓴다. `ok` · 영향 0줄이면 `no-row`(줄이 빠진 회원) · 오류 · 던짐이면 `error`.
 * 값은 부르는 쪽(`validateSettingsUpdate`)이 이미 거른 정규 모양이다.
 */
export async function writeMySettings(
  client: SupabaseClient,
  userId: string,
  update: SettingsUpdate,
): Promise<"ok" | "no-row" | "error"> {
  const row: Record<string, unknown> = {};
  if (update.layout) row.layout = update.layout;
  if (update.fontScale) {
    row.font_scale = {
      v: 1,
      step: update.fontScale.step,
      follow: update.fontScale.follow,
    };
  }
  if (update.theme) row.theme = update.theme;
  try {
    const { data, error } = await client
      .from("members")
      .update(row)
      .eq("user_id", userId)
      .select("user_id");
    if (error) {
      logAuthError("settings/write", error.code);
      return "error";
    }
    return Array.isArray(data) && data.length > 0 ? "ok" : "no-row";
  } catch {
    logAuthError("settings/write");
    return "error";
  }
}
