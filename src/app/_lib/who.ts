import { createHash } from "node:crypto";

/**
 * 회원 번호의 해시 앞 16자 (이슈 #193 · #197). 회원 번호를 내보내지 않고 "같은 회원인가"만 견줄 때 쓴다 —
 * 화면 설정의 기기 "기준"(`/auth/settings`)과 탈퇴 의도 쿠키(`cm_wd`)가 같은 함수를 쓴다. 되돌릴 수 없다.
 */
export const whoOf = (id: string): string =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);
