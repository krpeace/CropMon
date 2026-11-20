"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  accountValuesFromRow,
  canonFont,
  canonLayout,
  canonTheme,
  decideFollow,
  decideLayoutOnLogin,
  decideQuietOnLogin,
  isDefaultFont,
  isDefaultLayout,
  type AccountValues,
  type SettingKey,
} from "@/domain/account-settings";
import { canonicalMenus } from "@/domain/menus-layout";
import type { Theme } from "@/domain/theme";

import {
  blockAccount,
  consumeLoginJustNow,
  flushAccount,
  isBlocked,
  isMemberDevice,
  loadBase,
  markFollowed,
  pushAccount,
  setBaseFor,
  setWho,
  unblockAccount,
  wasFollowed,
} from "./account-settings-store";
import { AccountSaveSheet, type SavePrompt } from "./AccountSaveSheet";
import { readFontScalePref, saveFontScale } from "./font-scale-store";
import { useMembersState } from "./members-state";
import { readDeviceMenus, resetMenus, saveMenus } from "./menu-store";
import { readDeviceTheme, saveTheme } from "./ThemeToggle";

type Prompt = SavePrompt & { account: AccountValues["layout"] };

/** 동의 화면(`/consent`)에서는 부르지 않는다. */
const isConsentPath = (p: string) =>
  p === "/consent" || p.startsWith("/consent/");

/**
 * 화면 설정 계정 저장의 **한 곳** (이슈 #193, 결정 0066). 보이는 것이 없는 부품(시트만 뜬다)이고 layout 의 `<Suspense>` 안에 둔다.
 * 로그인한 회원(`cm_m=i`)의 기기에서만, **탭을 처음 열 때 한 번(로그인 직후면 그때 한 번)** `GET /auth/settings` 를 부른다 —
 * 로그인 직후 판단과 탭당 한 번 따라오기가 같은 읽기 하나를 쓴다.
 *
 * - **로그인 직후**(`login=ok` 를 `LoginNotice` 가 알림): 이슈 표대로 화면 구성은 갈래를 가리고(시트가 뜰 수 있음), 글씨 크기 · 다크 모드는 조용히 처리한다.
 * - **그 밖**(탭을 처음 열 때): 다른 기기에서 바꾼 값을 따라온다 — 기기 값이 기준과 같거나 기본값일 때만(`decideFollow`).
 * - 동의 전(403)이면 그 탭에서는 다시 부르지 않는다. 오류 · 네트워크 실패는 화면을 막지 않는다(기기 값으로 계속).
 */
export function AccountSync() {
  const pathname = usePathname();
  const members = useMembersState();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const started = useRef(false);

  const run = useCallback(async (loginNow: boolean) => {
    if (loginNow)
      unblockAccount(); // 새 로그인은 동의 전 막힘을 다시 확인한다
    else if (isBlocked() || wasFollowed()) return;

    let data: Record<string, unknown>;
    try {
      const res = await fetch("/auth/settings", { cache: "no-store" });
      if (!res.ok) {
        // 본문을 끝까지 받아 요청을 끝낸다(안 읽으면 화면 시험의 "네트워크 조용함"이 끝나지 않는다)
        await res.text().catch(() => "");
        if (res.status === 403) blockAccount(); // 동의 전: 이 탭에서는 다시 부르지 않는다
        return;
      }
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return;
    }
    const who = typeof data.who === "string" ? data.who : "";
    if (!who) return;
    setWho(who);
    markFollowed();
    const account = accountValuesFromRow({
      layout: data.layout as never,
      // 서버가 이미 거른 { step, follow } 를 DB 줄 모양({ v: 1, … })으로 되돌려 같은 거르기를 한 번 더 지난다
      font_scale: (data.fontScale
        ? { v: 1, ...(data.fontScale as object) }
        : null) as never,
      theme: data.theme as never,
    });
    if (loginNow) loginFlow(account, setPrompt);
    else followFlow(account, who);
  }, []);

  useEffect(() => {
    if (started.current) return;
    if (members.mode !== "in" || !isMemberDevice()) return;
    if (isConsentPath(pathname)) return;
    started.current = true;
    // LoginNotice 의 효과가 먼저 돌아 "방금 로그인" 신호를 켠 뒤에 읽는다
    void run(consumeLoginJustNow());
  }, [members.mode, pathname, run]);

  if (!prompt) return null;

  const close = () => setPrompt(null);
  return (
    <AccountSaveSheet
      prompt={prompt}
      onClose={close}
      onKeep={() => {
        // 기기 구성을 계정에 쓴다 (기기는 그대로)
        pushAccount({ layout: canonicalMenus(prompt.device) });
        flushAccount();
        close();
      }}
      onSecondary={() => {
        if (prompt.kind === "save") {
          // 기기를 기본값으로 (계정은 그대로 비어 있음)
          resetMenus({ sync: false });
        } else if (prompt.account) {
          // 계정 구성을 기기에 쓴다
          saveMenus(prompt.account, { sync: false });
          setBaseFor("layout", canonLayout(prompt.account));
        }
        close();
      }}
    />
  );
}

/** 로그인 직후: 화면 구성은 갈래대로(시트가 뜰 수 있음), 글씨 · 다크는 조용히. */
function loginFlow(
  account: AccountValues,
  setPrompt: (p: Prompt | null) => void,
) {
  // 화면 구성
  const deviceMenus = readDeviceMenus();
  const layoutDecision = decideLayoutOnLogin(deviceMenus, account.layout);
  if (layoutDecision === "adopt" && account.layout) {
    saveMenus(account.layout, { sync: false });
    setBaseFor("layout", canonLayout(account.layout));
  } else if (layoutDecision === "none" && account.layout) {
    setBaseFor("layout", canonLayout(account.layout)); // 이미 같다 — 기준만 맞춘다
  } else if (
    layoutDecision === "ask-save" ||
    layoutDecision === "ask-conflict"
  ) {
    setPrompt({
      kind: layoutDecision === "ask-save" ? "save" : "conflict",
      device: deviceMenus,
      account: account.layout,
    });
  }

  // 글씨 크기 (조용히)
  const deviceFont = readFontScalePref();
  const acctFont = account.fontScale;
  const fontDecision = decideQuietOnLogin({
    deviceDefault: isDefaultFont(deviceFont),
    same: acctFont !== null && canonFont(acctFont) === canonFont(deviceFont),
    accountNull: acctFont === null,
  });
  if (fontDecision === "adopt" && acctFont) {
    saveFontScale(acctFont, { sync: false });
    setBaseFor("fontScale", canonFont(acctFont));
  } else if (fontDecision === "push") {
    pushAccount({ fontScale: deviceFont });
  } else if (acctFont) {
    setBaseFor("fontScale", canonFont(acctFont));
  }

  // 다크 모드 (조용히). 기기 기본값 = 저장한 선택이 없음(휴대폰 설정 따름)
  const deviceTheme = readDeviceTheme();
  const acctTheme = account.theme;
  const themeDecision = decideQuietOnLogin({
    deviceDefault: deviceTheme === null,
    same: acctTheme !== null && acctTheme === deviceTheme,
    accountNull: acctTheme === null,
  });
  if (themeDecision === "adopt" && acctTheme) {
    saveTheme(acctTheme as Theme, { sync: false });
    setBaseFor("theme", canonTheme(acctTheme));
  } else if (themeDecision === "push" && deviceTheme) {
    pushAccount({ theme: deviceTheme });
  } else if (acctTheme) {
    setBaseFor("theme", canonTheme(acctTheme));
  }
  flushAccount(); // 로그인 직후 맞춘 값은 기다리지 않고 바로 보낸다
}

/** 탭을 처음 열 때: 다른 기기에서 바꾼 값을 따라온다 (기기 값이 기준과 같거나 기본값일 때만). */
function followFlow(account: AccountValues, who: string) {
  const base = loadBase(who);
  const baseOf = (k: SettingKey) => base[k] ?? null;

  if (account.layout) {
    const device = readDeviceMenus();
    const d = decideFollow({
      account: canonLayout(account.layout),
      device: canonLayout(device),
      deviceDefault: isDefaultLayout(device),
      base: baseOf("layout"),
    });
    if (d === "adopt") saveMenus(account.layout, { sync: false });
    if (d !== "none") setBaseFor("layout", canonLayout(account.layout));
  }

  if (account.fontScale) {
    const device = readFontScalePref();
    const d = decideFollow({
      account: canonFont(account.fontScale),
      device: canonFont(device),
      deviceDefault: isDefaultFont(device),
      base: baseOf("fontScale"),
    });
    if (d === "adopt") saveFontScale(account.fontScale, { sync: false });
    if (d !== "none") setBaseFor("fontScale", canonFont(account.fontScale));
  }

  if (account.theme) {
    const device = readDeviceTheme();
    const d = decideFollow({
      account: canonTheme(account.theme),
      device: canonTheme(device),
      deviceDefault: device === null,
      base: baseOf("theme"),
    });
    if (d === "adopt") saveTheme(account.theme as Theme, { sync: false });
    if (d !== "none") setBaseFor("theme", canonTheme(account.theme));
  }
}
