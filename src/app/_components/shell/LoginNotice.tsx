"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { removeSearchKeys } from "@/domain/login-sheet";
import { parseMembersFromCookieHeader } from "@/domain/members-state";
import {
  accountToast,
  LOGIN_TOAST_TEXT,
  readAccountNotice,
  readLoginNotice,
} from "@/domain/toast";

import { showToast } from "../ui/Toast";
import { markLoginJustNow } from "./account-settings-store";

/**
 * 로그인에서 돌아온 주소의 `login=ok | failed | cancelled` 를 읽어 알림을 한 번 띄우고 주소에서 `login` 만 지운다
 * (이슈 #189, 결정 0064). 새로고침 · 공유한 주소에서 알림이 다시 뜨지 않는다. 나머지 검색어와 `#` 는 그대로.
 * 취소는 아무 말 없이 주소만 정리한다. `account=withdrawn | withdrawn-unlinked`(탈퇴 뒤, 이슈 #195)도 같은 방식으로 읽는다. 보이는 것이 없는 부품이라 layout 에서 `<Suspense>` 안에 둔다.
 */
export function LoginNotice() {
  const search = useSearchParams().toString();

  useEffect(() => {
    // 탈퇴에서 돌아왔으면(`account=`, 이슈 #195) 알림 한 번 + 주소에서 지움. `login=` 과 같은 방식이다.
    const account = readAccountNotice(window.location.search);
    if (account) {
      // 네이버 로그인이 열렸는지는 표시 쿠키 `cm_m` 의 `n` 에서 읽는다(프록시가 서버의 `naverLoginEnabled` 로 만든 값, 개인 값 없음, 결정 0071).
      // `useMembersState()` 는 하이드레이션 첫 효과에서 서버 값("끔")을 줄 수 있어 쓰지 않고 쿠키를 바로 읽는다.
      const { text, ms } = accountToast(
        account,
        parseMembersFromCookieHeader(document.cookie).naver,
      );
      showToast(text, ms);
      window.history.replaceState(
        window.history.state,
        "",
        removeSearchKeys(
          window.location.pathname,
          window.location.search,
          window.location.hash,
          ["account"],
        ),
      );
      return;
    }
    const notice = readLoginNotice(window.location.search);
    if (!notice) return;
    // 방금 로그인에서 돌아왔다 — 화면 설정을 계정과 맞춰 본다(`AccountSync`, 결정 0066). 주소에서 지우기 전에 한 번만 알린다.
    if (notice === "ok") markLoginJustNow();
    const text = LOGIN_TOAST_TEXT[notice];
    if (text) showToast(text);
    window.history.replaceState(
      window.history.state,
      "",
      removeSearchKeys(
        window.location.pathname,
        window.location.search,
        window.location.hash,
        ["login"],
      ),
    );
  }, [search]);

  return null;
}
