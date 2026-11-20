import { logAuthError } from "@/infra/supabase/auth-log";

/**
 * 연결 끊기(구글 토큰 취소 · 네이버 토큰 삭제)가 쓰는 form `POST` 한 번 (이슈 #197, 결정 0068). Next.js 를 모른다.
 * 5초 시간 제한. **던지지 않는다.** 서버 기록에는 단계와 상태 코드(`timeout` · `network` · `400` …)만 — 본문(토큰 · 비밀) · 응답 원문은 안 남긴다.
 * 응답 본문은 `readJson` 일 때만 읽고(네이버는 200 안의 `result` 를 봐야 함), 읽은 값은 부르는 쪽이 판단만 하고 기록하지 않는다.
 */
const DEFAULT_TIMEOUT_MS = 5000;

export type PostFormResult = { ok: true; json: unknown } | { ok: false };

export async function postForm(
  step: string,
  url: string,
  form: URLSearchParams,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    readJson?: boolean;
  } = {},
): Promise<PostFormResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      logAuthError(step, String(res.status));
      return { ok: false };
    }
    if (!options.readJson) {
      await res.body?.cancel().catch(() => {});
      return { ok: true, json: null };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: true, json };
  } catch {
    logAuthError(step, controller.signal.aborted ? "timeout" : "network");
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
