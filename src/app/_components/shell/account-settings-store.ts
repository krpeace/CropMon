import {
  baseFor,
  canonFont,
  canonLayout,
  canonTheme,
  readBase,
  withBase,
  type SettingKey,
  type SettingsUpdate,
  type SyncBase,
} from "@/domain/account-settings";

import { createAccountPusher } from "./account-pusher";

/**
 * 화면 설정 계정 저장의 브라우저 쪽 상태 (이슈 #193, 결정 0066). 서버를 부르는 곳은 이 파일과 `AccountSync.tsx` 뿐이다.
 * 이 파일은 저장소(`menu-store` · `font-scale-store` · `ThemeToggle`)가 가져다 쓰므로 그 저장소들을 불러오지 않는다(순환 방지).
 *
 * 기기에 적는 것(모두 개인 값 없음):
 * - 탭(`sessionStorage`): `cropmon-acct-blocked`(동의 전 403 을 받음 → 이 탭에서는 다시 부르지 않음) · `cropmon-acct-who`(회원 해시) · `cropmon-acct-followed`(이 탭에서 따라오기를 했음)
 * - 기기(`localStorage`): `cropmon-acct-base`(마지막으로 맞춘 값, 회원 해시와 함께 — 회원 번호 자체는 안 남김)
 */

const BLOCKED_KEY = "cropmon-acct-blocked";
const WHO_KEY = "cropmon-acct-who";
const FOLLOWED_KEY = "cropmon-acct-followed";
const BASE_KEY = "cropmon-acct-base";

// 저장소가 막혀 있어도(사생활 보호 모드) 이번 화면 동안은 메모리로 동작한다
const memory: Record<string, string | null> = {};

function sget(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}
function sset(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    memory[key] = value;
  }
}

/** 로그인한 회원의 기기인가 — 머리 스크립트가 쿠키(`cm_m`)를 읽어 단 `<html data-members="in">`. 비회원 · 끔은 false(요청 0). */
export function isMemberDevice(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.members === "in"
  );
}

export const isBlocked = () => sget(BLOCKED_KEY) === "1";
export const blockAccount = () => sset(BLOCKED_KEY, "1");
export const unblockAccount = () => sset(BLOCKED_KEY, null);

export const getWho = () => sget(WHO_KEY);
export const setWho = (who: string) => sset(WHO_KEY, who);
export const wasFollowed = () => sget(FOLLOWED_KEY) === "1";
export const markFollowed = () => sset(FOLLOWED_KEY, "1");

/** 로그인에서 막 돌아왔다는 신호(`login=ok` 를 읽은 뒤, 주소에서 지워지기 전에 한 번). `LoginNotice` 가 켜고 `AccountSync` 가 쓴다. */
let justLoggedIn = false;
export function markLoginJustNow() {
  justLoggedIn = true;
}
export function consumeLoginJustNow(): boolean {
  const was = justLoggedIn;
  justLoggedIn = false;
  return was;
}

// ── 기준(base): 마지막으로 맞춘 값 ──────────────────────────────

export function loadBase(who: string): SyncBase {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(BASE_KEY);
  } catch {
    raw = memory[BASE_KEY] ?? null;
  }
  return readBase(raw, who);
}

export function saveBase(base: SyncBase) {
  const raw = JSON.stringify(base);
  try {
    localStorage.setItem(BASE_KEY, raw);
  } catch {
    memory[BASE_KEY] = raw;
  }
}

/** 칸 하나의 기준을 갈아 끼운다. 회원 해시를 모르면(아직 읽은 적 없음) 아무것도 안 한다. */
export function setBaseFor(key: SettingKey, canon: string) {
  const who = getWho();
  if (!who) return;
  saveBase(withBase(loadBase(who), key, canon));
}

export { baseFor };

function canonOf(update: SettingsUpdate): Partial<Record<SettingKey, string>> {
  const out: Partial<Record<SettingKey, string>> = {};
  if (update.layout) out.layout = canonLayout(update.layout);
  if (update.fontScale) out.fontScale = canonFont(update.fontScale);
  if (update.theme) out.theme = canonTheme(update.theme);
  return out;
}

// ── 모아 보내기 ───────────────────────────────────────────────

async function send(update: SettingsUpdate) {
  const res = await fetch("/auth/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // 서버가 받는 글씨 크기 모양은 `{ v: 1, step, follow }` (기기 값과 같은 모양)
    body: JSON.stringify(
      update.fontScale
        ? { ...update, fontScale: { v: 1, ...update.fontScale } }
        : update,
    ),
    keepalive: true, // 탭을 닫는 중에도 끝까지 보낸다
  });
  if (!res.ok) {
    await res.text().catch(() => ""); // 본문을 끝까지 받아 요청을 끝낸다
    if (res.status === 403) blockAccount(); // 동의 전: 이 탭에서는 다시 부르지 않는다
    return;
  }
  // 보냈으니 기기에 "마지막으로 맞춘 값"을 적는다
  for (const [key, canon] of Object.entries(canonOf(update))) {
    setBaseFor(key as SettingKey, canon);
  }
}

const pusher = createAccountPusher({
  // 실패는 화면을 막지 않는다(기기 값으로 계속) — fetch 거절도 삼킨다
  send: (update) => {
    void send(update).catch(() => {});
  },
  enabled: () => isMemberDevice() && !isBlocked(),
});

let listening = false;
function ensureFlushListeners() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // 탭을 닫거나 숨길 때 모아 둔 마지막 값을 바로 보낸다
  window.addEventListener("pagehide", () => pusher.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pusher.flush();
  });
}

/** 바뀐 칸을 계정에 쓴다(회원일 때만, 400ms 모아 마지막 값만). 저장소가 기기에 쓴 직후에 부른다. */
export function pushAccount(update: SettingsUpdate) {
  ensureFlushListeners();
  pusher.push(update);
}

/** 모아 둔 것을 기다리지 않고 바로 보낸다(시트의 [저장하기] 등). */
export function flushAccount() {
  pusher.flush();
}
