import type { KakaoUnlinkResult } from "@/domain/account-info";
import { logAuthError } from "@/infra/supabase/auth-log";

/**
 * 카카오 연결 끊기 (이슈 #195, 결정 0067). 탈퇴한 회원의 카카오 "연결된 서비스"에서 CropMon 을 빼 준다.
 * 근거: 카카오 공식 문서 — `POST https://kapi.kakao.com/v1/user/unlink`, 머리 `Authorization: KakaoAK ${서비스 앱 어드민 키}`,
 * 본문(form) `target_id_type=user_id&target_id=<카카오 회원번호>` (자세한 내용 · 받은 날짜는 docs/SOCIAL_LOGIN.md).
 * Next.js 를 모른다(결정 0033). 서버에서만 부른다 — **어드민 키는 서버 환경변수(`KAKAO_ADMIN_KEY`)이고 화면 코드에 없다.**
 *
 * - 끊기가 실패해도 탈퇴는 이미 끝난 것이다 — 이 함수는 던지지 않고 "ok · failed · skipped" 로 알린다.
 * - 서버 기록에는 단계와 상태 코드(`timeout` · `network` · `401` …)만. 어드민 키 · 회원번호 · 응답 원문은 안 남긴다.
 */

export const KAKAO_DEFAULT_BASE = "https://kapi.kakao.com";

/** 시험 전용 주소로 바꿀 수 있는 곳: 이 컴퓨터(고리 주소) 한 곳뿐. 경로 · 계정 정보 · https 는 받지 않는다. */
const LOOPBACK_BASE =
  /^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?\/?$/;

/**
 * 어드민 키를 실어 보낼 주소. `KAKAO_API_BASE` 는 **시험 전용**이라 이 컴퓨터(고리) 주소일 때만 받고,
 * 그 밖의 값(비어 있음 포함)은 무시하고 카카오 공식 주소를 쓴다 — 잘못된 값이 들어가도 키가 다른 곳으로 가지 않게(검토 11/20).
 */
export function kakaoBase(raw: string | undefined | null): string {
  if (typeof raw === "string" && LOOPBACK_BASE.test(raw)) {
    return raw.replace(/\/$/, "");
  }
  return KAKAO_DEFAULT_BASE;
}

const KAKAO_ID_SHAPE = /^[0-9]{1,20}$/;
const DEFAULT_TIMEOUT_MS = 5000;

export type UnlinkInput = {
  /** 카카오 회원번호(숫자 1~20자리). */
  userId: string;
  /** 서비스 앱 어드민 키(`KAKAO_ADMIN_KEY`). 비면 부르지 않는다. */
  adminKey: string | undefined | null;
  /** 시험용 주소(고리 주소만 받음). 없으면 카카오 공식 주소. */
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function unlinkKakao(
  input: UnlinkInput,
): Promise<KakaoUnlinkResult> {
  const key = typeof input.adminKey === "string" ? input.adminKey.trim() : "";
  if (key === "") return "skipped";
  if (!KAKAO_ID_SHAPE.test(input.userId)) {
    logAuthError("withdraw/kakao-unlink", "bad_id");
    return "failed";
  }

  const doFetch = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await doFetch(`${kakaoBase(input.baseUrl)}/v1/user/unlink`, {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${key}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        target_id_type: "user_id",
        target_id: input.userId,
      }).toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    // 응답 원문은 읽지 않는다(기록 · 화면에 쓰지 않음). 연결을 풀어 주려고 비우기만 한다.
    await res.body?.cancel().catch(() => {});
    if (!res.ok) {
      logAuthError("withdraw/kakao-unlink", String(res.status));
      return "failed";
    }
    return "ok";
  } catch {
    logAuthError(
      "withdraw/kakao-unlink",
      controller.signal.aborted ? "timeout" : "network",
    );
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
