"use client";

import { useEffect } from "react";

import { applyFontScale, readFontScalePref } from "./font-scale-store";

/**
 * 글씨 크기를 화면에 맞춰 두는 보이지 않는 부품 (이슈 #168). 처음 그리기는 머리 스크립트가 이미 맞췄고,
 * 여기서는 ① 화면이 뜬 뒤 한 번 다시 맞추고(스크립트가 못 한 경우 대비) ② "휴대폰 설정 따르기"가 켜져 있으면
 * 휴대폰 설정을 바꾸고 돌아올 때(`focus` · `visibilitychange`)마다 다시 잰다 ③ 다른 탭에서 바꾼 값(`storage`)을 따라간다.
 */
export function FontScaleSync() {
  useEffect(() => {
    const sync = () => applyFontScale(readFontScalePref());
    const syncIfFollow = () => {
      const pref = readFontScalePref();
      if (pref.follow) applyFontScale(pref);
    };
    sync();
    window.addEventListener("focus", syncIfFollow);
    document.addEventListener("visibilitychange", syncIfFollow);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", syncIfFollow);
      document.removeEventListener("visibilitychange", syncIfFollow);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return null;
}
