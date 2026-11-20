"use client";

import { useMemo } from "react";

import type { SavedMenus } from "@/domain/menus";
import { resolveMenus } from "@/domain/menus";

import { Icon } from "../ui/Icon";
import { MENU_ICON } from "./pages";
import { CenterWindow, MobileSheet, useIsDesktop } from "./Sheets";

/** 시트 글자 — 시안 v0.4.6 "화면 구성 저장 시트"(`save`)와 시안 밖 충돌형(`conflict`, 검토 채팅 승인 11/20, 결정 0066). */
export const SAVE_SHEET_TEXT = {
  title: "화면 구성을 계정에 저장할까요?",
  save: "이 기기에서 바꿔 둔 하단 탭이에요. 저장하면 다른 기기에서도 같은 구성으로 보여요.",
  conflict:
    "이 기기의 하단 탭이 계정에 저장된 구성과 달라요. 저장하면 다른 기기에서도 이 구성으로 보여요.",
  keep: "저장하기",
  useDefault: "기본 구성 쓰기",
  useAccount: "계정 구성 쓰기",
} as const;

export type SavePrompt =
  | { kind: "save"; device: SavedMenus | null }
  | { kind: "conflict"; device: SavedMenus | null };

/**
 * 로그인 직후 "화면 구성을 계정에 저장할까요?" 시트 (이슈 #193, 결정 0066). 기기 설정으로 만들어질 하단 탭 넷 + 더보기를 미리 보여 주고
 * 두 단추를 둔다. 휴대폰은 아래 시트(`BottomSheet`), 데스크톱은 가운데 창. × · 닫기 · 바깥 · Esc 는 **아무것도 바꾸지 않고** 닫는다
 * (기기 값 그대로, 계정에 저장 안 함 — 다음 로그인 때 다시 묻는다).
 * - `save`(계정이 비어 있음): [저장하기] 기기 → 계정 / [기본 구성 쓰기] 기기를 기본값으로
 * - `conflict`(계정과 다름): [저장하기] 기기 → 계정 / [계정 구성 쓰기] 계정 → 기기
 */
export function AccountSaveSheet({
  prompt,
  onKeep,
  onSecondary,
  onClose,
}: {
  prompt: SavePrompt;
  onKeep: () => void;
  onSecondary: () => void;
  onClose: () => void;
}) {
  const desktop = useIsDesktop();
  const tabs = useMemo(() => resolveMenus(prompt.device).tabs, [prompt.device]);

  const body = (
    <div className="flex flex-col gap-3 pt-1 pb-1">
      <p className="text-16 text-ink-2/88 m-0 leading-snug text-pretty">
        {prompt.kind === "save"
          ? SAVE_SHEET_TEXT.save
          : SAVE_SHEET_TEXT.conflict}
      </p>
      <div
        data-testid="tab-preview"
        aria-hidden="true"
        className="bg-tile rounded-box flex items-center justify-around gap-1 px-2 py-2.5"
      >
        {[
          ...tabs.map((m) => ({
            key: m.id,
            label: m.label,
            icon: MENU_ICON[m.id],
          })),
          { key: "more", label: "더보기", icon: "more" as const },
        ].map((t) => (
          <span
            key={t.key}
            data-tab={t.key}
            className="text-12 text-ink-2/85 flex min-w-0 flex-1 flex-col items-center gap-0.5 font-bold whitespace-nowrap"
          >
            <Icon name={t.icon} size={22} />
            {t.label}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onKeep}
        className="bg-brand text-18 fh-54 mt-1 w-full cursor-pointer rounded-full px-4 font-bold text-white"
      >
        {SAVE_SHEET_TEXT.keep}
      </button>
      <button
        type="button"
        onClick={onSecondary}
        className="bg-fill/12 text-ink text-17 fh-50 w-full cursor-pointer rounded-full px-4 font-semibold"
      >
        {prompt.kind === "save"
          ? SAVE_SHEET_TEXT.useDefault
          : SAVE_SHEET_TEXT.useAccount}
      </button>
    </div>
  );

  return desktop ? (
    <CenterWindow title={SAVE_SHEET_TEXT.title} onClose={onClose}>
      {body}
    </CenterWindow>
  ) : (
    <MobileSheet title={SAVE_SHEET_TEXT.title} onClose={onClose}>
      {body}
    </MobileSheet>
  );
}
