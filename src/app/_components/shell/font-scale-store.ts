"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_FONT_PREF,
  effectiveStep,
  FONT_SCALE_KEY,
  type FontScalePref,
  IOS_BODY_PX,
  MEDIUM_PX,
  parseFontScalePref,
  phoneRatio,
  serializeFontScalePref,
} from "@/domain/font-scale";

/**
 * 글씨 크기 저장 · 적용 (이슈 #168, 결정 0055). **저장은 이 파일 한곳**이다 — 비회원은 기기(localStorage),
 * 회원 계정 저장(L5)이 오면 `readRaw` · `saveFontScale` 만 바꿔 끼운다.
 * 저장소가 막혀 있으면(사생활 보호 모드) 이번 화면 동안만 메모리에 둔다(`NationalList.tsx` 와 같은 방식).
 */

const EVENT = "cropmon-font-scale-change";
let memoryRaw: string | null = null; // 저장이 막혔을 때만 채운다(다른 탭 변경을 가리지 않게)

function readRaw(): string | null {
  if (memoryRaw !== null) return memoryRaw;
  try {
    return localStorage.getItem(FONT_SCALE_KEY);
  } catch {
    return null;
  }
}

/** 지금 저장된 선택 (이 파일 밖 · 이벤트 처리용). */
export function readFontScalePref(): FontScalePref {
  return parseFontScalePref(readRaw());
}

/**
 * 휴대폰 글자 크기 배율. 보이지 않는 시험 요소의 글자 크기를 잰다 — 아이폰 사파리는 `font: -apple-system-body`
 * (보통 17px), 그 밖(안드로이드 크롬 · 카카오톡 인앱 등)은 `font-size: medium`(보통 16px). 못 재면 null.
 */
export function measurePhoneRatio(): number | null {
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none";
    let base = MEDIUM_PX;
    if (CSS.supports("font", "-apple-system-body")) {
      probe.style.font = "-apple-system-body";
      base = IOS_BODY_PX;
    } else {
      probe.style.fontSize = "medium";
    }
    document.documentElement.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return phoneRatio(px, base);
  } catch {
    return null;
  }
}

/** 선택을 화면에 적용한다: `<html>` 의 `--fz` 를 단계 값(다섯 가운데 하나)으로. */
export function applyFontScale(pref: FontScalePref) {
  const ratio = pref.follow ? measurePhoneRatio() : null;
  document.documentElement.style.setProperty(
    "--fz",
    String(effectiveStep(pref, ratio).value),
  );
}

/** 고르는 즉시 저장하고 화면 전체에 적용한다 (저장 버튼 없음). */
export function saveFontScale(pref: FontScalePref) {
  const raw = serializeFontScalePref(pref);
  try {
    localStorage.setItem(FONT_SCALE_KEY, raw);
    memoryRaw = null;
  } catch {
    memoryRaw = raw; // 저장이 안 돼도 이번 화면은 바뀐다.
  }
  applyFontScale(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // 다른 탭에서 바꾼 경우
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 저장된 선택. 서버 · 첫 그리기는 기본값(보통), 브라우저에서 읽은 뒤 따라간다. */
export function useFontScalePref(): FontScalePref {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(
    () => (raw === null ? DEFAULT_FONT_PREF : parseFontScalePref(raw)),
    [raw],
  );
}

/** 지금 화면에 적용된 `--fz` (`<html>` 인라인 값). 따르기가 켜져 있으면 측정으로 정해진 값이다. */
function subscribeApplied(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });
  return () => observer.disconnect();
}

const getApplied = () =>
  parseFloat(document.documentElement.style.getPropertyValue("--fz")) || 1;

export function useAppliedFz(): number {
  return useSyncExternalStore(subscribeApplied, getApplied, () => 1);
}
