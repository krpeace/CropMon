"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { removeSearchKeys } from "@/domain/login-sheet";
import { LOGIN_TOAST_TEXT, readLoginNotice } from "@/domain/toast";

import { showToast } from "../ui/Toast";
import { markLoginJustNow } from "./account-settings-store";

/**
 * 로그인에서 돌아온 주소의 `login=ok | failed | cancelled` 를 읽어 알림을 한 번 띄우고 주소에서 `login` 만 지운다
 * (이슈 #189, 결정 0064). 새로고침 · 공유한 주소에서 알림이 다시 뜨지 않는다. 나머지 검색어와 `#` 는 그대로.
 * 취소는 아무 말 없이 주소만 정리한다. 보이는 것이 없는 부품이라 layout 에서 `<Suspense>` 안에 둔다.
 */
export function LoginNotice() {
  const search = useSearchParams().toString();

  useEffect(() => {
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
