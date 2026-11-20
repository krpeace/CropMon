/**
 * 시험 전용 주소 바꾸기 (이슈 #195 · #197, 결정 0067 · 0068). 어드민 키 · 공급자 토큰 · 클라이언트 시크릿을 실어 보낼 **곳**을 바꾸는
 * 서버 변수(`KAKAO_API_BASE` · `GOOGLE_API_BASE` · `NAVER_API_BASE`)는 잘못 들어가면 비밀이 다른 곳으로 갈 수 있다.
 * 그래서 **이 컴퓨터(고리) 주소 — `http://127.0.0.1[:포트]` · `http://localhost[:포트]` — 일 때만** 받고,
 * 그 밖의 값(비어 있음 · 다른 주소 · https · 경로 · 계정 정보)은 무시하고 `defaultBase`(공식 주소)를 쓴다.
 * e2e 는 운영 빌드로 돌기 때문에 `NODE_ENV` 로 가르지 않고 주소 모양으로 가른다.
 */
const LOOPBACK_BASE =
  /^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?\/?$/;

export function loopbackBase(
  raw: string | undefined | null,
  defaultBase: string,
): string {
  if (typeof raw === "string" && LOOPBACK_BASE.test(raw)) {
    return raw.replace(/\/$/, "");
  }
  return defaultBase;
}
