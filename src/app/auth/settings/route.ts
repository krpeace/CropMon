import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { whoOf } from "@/app/_lib/who";
import {
  accountValuesFromRow,
  validateSettingsUpdate,
} from "@/domain/account-settings";
import { needsConsent } from "@/domain/legal";
import { readUserFromClaims } from "@/infra/supabase/current-user";
import { readMyConsent } from "@/infra/supabase/member-consent";
import {
  readMySettings,
  writeMySettings,
} from "@/infra/supabase/member-settings";

/** 쓰기 본문 크기 한도(바이트 글자 수). 설정 셋은 수백 글자면 충분하다. */
const MAX_BODY = 8 * 1024;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const status = (code: number, headers: Record<string, string> = NO_STORE) =>
  new NextResponse(null, { status: code, headers });
const json = (code: number, body: unknown) =>
  NextResponse.json(body, { status: code, headers: NO_STORE });

/**
 * 로그인한 동의 회원인지 확인한다 (이슈 #193, 결정 0066). 아니면 돌려줄 응답, 맞으면 클라이언트 · 사용자 번호.
 * 순서: 비로그인 401 → **동의 전(읽기 실패 포함) 403** — 동의 전에는 회원 기능을 막는다(결정 0065). 동의 전에는 아무것도 읽거나 쓰지 않는다.
 */
type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type MemberResult =
  | { fail: Response; supabase?: undefined; userId?: undefined }
  | { fail?: undefined; supabase: Client; userId: string };

async function member(): Promise<MemberResult> {
  const supabase = await createSupabaseServerClient();
  const user = await readUserFromClaims(supabase);
  if (!user) return { fail: status(401) };
  const consent = await readMyConsent(supabase);
  if (!consent.ok || needsConsent(consent)) {
    return { fail: json(403, { error: "consent" }) };
  }
  return { supabase, userId: user.id };
}

/**
 * `GET /auth/settings` — 로그인한 회원의 화면 설정 셋을 돌려준다: `{ who, layout, fontScale, theme }`. **캐시하지 않는다.**
 * 값은 서버가 이미 거른 모양이고, 비었거나 틀린 칸은 `null`("한 번도 저장 안 함"). `who` 는 회원 번호의 해시(기기의 기준용).
 * 공개 화면은 정적인 채이고, 로그인한 사람의 브라우저가 화면이 뜬 뒤 이 길로 읽는다(결정 0038 · 0064).
 * - 스위치 끔 404 · 비로그인 401 · 동의 전 403 · DB 오류 502.
 */
export async function GET(): Promise<Response> {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const m = await member();
  if (m.fail) return m.fail;

  const result = await readMySettings(m.supabase);
  if (!result.ok) return status(502);
  return json(200, {
    who: whoOf(m.userId),
    ...accountValuesFromRow(result.row),
  });
}

/**
 * `POST /auth/settings` — 바뀐 칸만 `{ layout?, fontScale?, theme? }` 로 받아 쓴다(JSON). 성공 204.
 * - **전부 먼저 검사한 뒤** 쓴다: 하나라도 틀리면 400 이고 아무것도 안 쓴다(부분 저장 없음). 셋 밖의 칸 · `null` 로 지우기는 거절.
 *   쓰는 열은 `layout` · `font_scale` · `theme` 셋뿐이고 값은 정규 글자로 쓴다.
 * - 8KB 넘으면 413 · JSON 이 아니면 400.
 * - **`Origin` 이 있고 이 사이트가 아니면 403**(없으면 통과 — 로그아웃 · 동의와 같은 규칙. 근거: 로그인 쿠키가 `SameSite=Lax` 라 다른 사이트의
 *   `POST` 에는 세션이 안 실리고, JSON 본문은 다른 사이트에서 사전 확인 없이 보낼 수 없다).
 * - 스위치 끔 404 · 비로그인 401 · 동의 전 403 · 줄이 없으면 409 · DB 오류 502. 서버 기록에는 단계와 오류 코드만.
 */
export async function POST(request: Request): Promise<Response> {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { origin } = new URL(request.url);
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== null && requestOrigin !== origin) return status(403);

  const m = await member();
  if (m.fail) return m.fail;

  if (
    !(request.headers.get("content-type") ?? "").includes("application/json")
  ) {
    return status(400);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return status(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return status(400);
  }
  const checked = validateSettingsUpdate(body);
  if (!checked.ok) return status(400);

  const written = await writeMySettings(m.supabase, m.userId, checked.update);
  if (written === "ok") return status(204);
  return status(written === "no-row" ? 409 : 502);
}
