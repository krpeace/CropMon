/**
 * 로그인 배관의 서버 기록 (이슈 #182, 결정 0061). **단계 이름과 오류 종류(코드)만** 남긴다.
 * 이메일 · 이름 · 사용자 ID · 코드(code) · 토큰 · 원문 오류 문장은 남기지 않는다 — 오류 객체를 통째로 넘기지 말고
 * `logAuthError("단계", error.code)` 처럼 코드 문자열만 넘긴다. 모양이 이상한 값은 `unknown` 으로 바꿔 기록한다.
 */

/**
 * 오류 종류로 볼 수 있는 모양: 글자 · 숫자 · `_` 만, 40자까지 (`flow_state_not_found`, `42501`, `PGRST202`).
 * 점(`.`)과 하이픈(`-`)은 일부러 뺐다 — 토큰(`xxx.yyy.zzz`)이나 사용자 ID(UUID)는 이 모양이 아니다.
 */
const CODE_SHAPE = /^[A-Za-z0-9_]{1,40}$/;
/** 사용자 ID(UUID)처럼 보이는 것은 오류 코드가 아니므로 남기지 않는다. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;

export function logAuthError(step: string, code?: string | null): void {
  const safe =
    typeof code === "string" && CODE_SHAPE.test(code) && !UUID_SHAPE.test(code)
      ? code
      : "unknown";
  console.error(`[auth] ${step}`, { code: safe });
}
