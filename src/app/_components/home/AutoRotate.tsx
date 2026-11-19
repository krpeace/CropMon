"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { DESKTOP_MIN_WIDTH } from "@/domain/autohide";
import {
  nextInRotation,
  rotationPosition,
  withSelection,
  type Selection,
} from "@/domain/selection";
import { STATION_IDS } from "@/services/shell";

import { useSheet } from "../shell/sheet-context";
import { Icon } from "../ui/Icon";
import { shouldRunRotation } from "./auto-rotate-state";

const INTERVAL_MS = 5000;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/** 데스크톱 폭(1024 이상)인가. 서버와 첫 그리기는 false, 브라우저에서 폭을 확인한 뒤 따라간다. */
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const getServerDesktop = () => false;

/**
 * 종합 화면 자동 전환: 고른 작물은 그대로 두고 5초마다 다음 대표 지역(10곳)으로 바꾼다.
 * 이미 받은 자료 안에서 화면만 전환(서버 요청 0회)하며, 창이 열리거나 탭이 숨겨지면 쉰다.
 * 데스크톱 폭(1024 이상)에서만 돈다. 휴대폰에서는 타이머도 돌지 않고 아무것도 그리지 않는다 (결정 0053).
 */
export function AutoRotate({
  selection,
  onRotate,
}: {
  selection: Selection;
  onRotate?: (next: Selection) => void;
}) {
  const { sheet, popover } = useSheet();
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true,
  );

  const desktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktop,
    getServerDesktop,
  );

  const pos = rotationPosition(selection, STATION_IDS);
  const running = shouldRunRotation({
    desktop,
    auto,
    visible,
    sheet: !!sheet,
    popover: !!popover,
    pos,
  });
  const { stationId, crop, soil, kc } = selection;

  useEffect(() => {
    function handleVisibility() {
      setVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      const next = nextInRotation({ stationId, crop, soil, kc }, STATION_IDS);
      if (onRotate) {
        onRotate(next);
      } else {
        window.history.replaceState(null, "", withSelection("/", next));
      }
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [running, stationId, crop, soil, kc, onRotate]);

  // 훅을 모두 부른 뒤에 비운다 — 부품이 붙어 있어야 폭이 바뀌어도 "중지" 선택이 남는다.
  if (!desktop) return null;

  const total = STATION_IDS.length;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2.5">
        <span className="text-14 text-ink-2/80 whitespace-nowrap">
          {pos === null ? "대표 지점 밖" : `${pos} / ${total}`}
        </span>
        <button
          type="button"
          onClick={() => setAuto(!auto)}
          className={`text-16 fh-44 flex cursor-pointer items-center gap-2 rounded-full pr-4.5 pl-3.5 font-bold whitespace-nowrap ${
            auto ? "bg-brand text-white" : "bg-fill/14 text-ink"
          }`}
        >
          <Icon name={auto ? "pause" : "play"} size={18} filled />
          {auto ? "자동 전환 중지" : "자동 전환 시작"}
        </button>
      </div>
      <div className="bg-fill/16 h-1 w-60 overflow-hidden rounded-full">
        {running && (
          <div
            key={`${stationId}|${crop}`}
            className="animate-progress bg-brand h-full rounded-full"
          />
        )}
      </div>
    </div>
  );
}
