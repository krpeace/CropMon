/**
 * 탈퇴 화면 · 탈퇴 알림의 확정 문구 (이슈 #205, 결정 0071). **글자 하나도 바꾸지 않는다** — 시험이 전체 글자로 견준다.
 * 2026-11-20 확정(회원제 설계): 탈퇴할 때 SNS 연결도 함께 끊으므로 화면에는 "함께 끊어요" 한 줄을 두고,
 * "각 계정 설정에서 해제" 안내는 **끊기가 실패했을 때의 알림**으로 옮겼다.
 *
 * **네이버 로그인이 열리지 않았으면(`naverLoginEnabled` 가 거짓) "네이버"를 뺀다.** 문구를 만드는 곳은 이 파일 한 곳이고,
 * 켬 · 끔 판단은 화면(서버)과 알림(`cm_m` 쿠키의 `n` — 프록시가 같은 `naverLoginEnabled` 로 만든다) 모두 그 함수 하나에서 나온다.
 * 화면 · 네트워크를 불러오지 않는 순수 함수.
 */

/** 연결을 끊는 공급자 이름. 네이버가 열렸을 때만 네이버가 들어간다. */
export function unlinkProviderNames(naverOn: boolean): string {
  return naverOn ? "카카오·네이버·구글" : "카카오·구글";
}

/** 탈퇴 확인 화면(`/account/withdraw`)의 연결 줄. */
export function withdrawLinkLine(naverOn: boolean): string {
  return `탈퇴하면 ${unlinkProviderNames(naverOn)} 연결도 함께 끊어요.`;
}

/**
 * 끊기가 실패했을 때의 탈퇴 알림. 두 줄(`\n`)이고 첫 줄은 마침표까지 "탈퇴했어요." 이다 — 줄 나누기는 표시 방식이고 글자는 그대로다.
 * (화면은 `whitespace-pre-line` 로 그린다.)
 */
export function withdrawUnlinkedText(naverOn: boolean): string {
  return `탈퇴했어요.\n${unlinkProviderNames(naverOn)} 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.`;
}
