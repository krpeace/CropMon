import { connection } from "next/server";

import { membersEnabled } from "@/domain/members-switch";

/**
 * 회원제 스위치를 **요청이 올 때** 읽는다 (이슈 #182, 결정 0061).
 *
 * `cacheComponents` 에서는 요청 정보를 안 쓰는 GET 경로 처리기가 빌드 때 미리 만들어진다(정적). 그러면 스위치 값이 빌드 때
 * 굳어 서버에 값을 넣어도 안 바뀐다. `await connection()` 으로 "이 요청이 올 때까지" 기다리게 해 동적으로 만든다.
 * `/auth/*` 경로 처리기는 맨 앞에서 이 함수를 부른다. (프록시는 매 요청 도는 곳이라 `membersEnabled(process.env)` 를 바로 쓴다.)
 */
export async function membersEnabledNow(): Promise<boolean> {
  await connection();
  return membersEnabled(process.env);
}
