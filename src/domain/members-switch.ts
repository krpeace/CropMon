/**
 * 회원제 기능 스위치 (이슈 #182, 결정 0061).
 * 환경변수 `MEMBERS_ENABLED` 가 정확히 "true" 일 때만 켠다. 없거나 비었거나 다른 값이면 끈다.
 * 끄면 지금 알파와 똑같다: `/auth/*` 는 404, 프록시는 세션을 건드리지 않는다.
 *
 * 서버 변수라서 요청 때 읽는다(프록시 · `/auth/*` 경로 처리기가 요청 함수 안에서 `process.env` 를 넘긴다).
 * 이 파일은 값만 보고 판단하는 순수 함수다.
 */
export function membersEnabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.MEMBERS_ENABLED === "true";
}

/**
 * 네이버 로그인 켜기 스위치 (이슈 #189, 결정 0064).
 * 환경변수 `NAVER_LOGIN_ENABLED` 가 정확히 "true" 일 때만 켠다. 없거나 다른 값이면 끈다 — 끄면 로그인 시트의 네이버 버튼은 "준비 중"이고,
 * 서버(`/auth/login?provider=custom:naver`)도 모르는 공급자와 같이 400 을 돌려준다.
 * 네이버는 Supabase 기본 공급자가 아니라 사용자 지정(custom) 공급자라, 대시보드 설정을 마친 뒤에 **다시 빌드하지 않고** 이 변수만 켜서 연다.
 * 자기 변수만 본다 — 회원제 스위치(`membersEnabled`)와 합치는 일은 부르는 쪽이 한다.
 */
export function naverLoginEnabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.NAVER_LOGIN_ENABLED === "true";
}
