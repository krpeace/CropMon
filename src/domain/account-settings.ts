/**
 * 화면 설정 계정 저장의 순수 부분 (이슈 #193, 결정 0066). 화면 · 네트워크를 불러오지 않는다.
 * 설정 셋(화면 구성 · 글씨 크기 · 다크 모드)은 비회원이면 기기, 회원이면 계정에도 저장된다. 계정 값의 모양은 기기 값과 같다
 * (`{v:1,order,off}` · `{v:1,step,follow}` · `light|dark`) — DB 는 "객체인지"만 보므로 값은 여기서 거른다.
 *
 * 말뜻: 계정의 **`null`은 "한 번도 저장 안 함"** 이다. 기본값으로 되돌릴 때도 `null`이 아니라 "기본값 값"을 써서
 * 다른 기기가 초기화를 따라온다(결정 0066).
 */
import { parseSavedMenus, type SavedMenus } from "./menus";
import { canonicalMenus } from "./menus-layout";
import {
  DEFAULT_FONT_PREF,
  FONT_STEPS,
  type FontScalePref,
} from "./font-scale";
import { parseSavedTheme, type Theme } from "./theme";

export type AccountValues = {
  layout: SavedMenus | null;
  fontScale: FontScalePref | null;
  theme: Theme | null;
};

/** 계정에 쓰는 바뀐 칸들. 값은 이미 거른 정규 모양이다. */
export type SettingsUpdate = {
  layout?: SavedMenus;
  fontScale?: FontScalePref;
  theme?: Theme;
};

export type SettingKey = keyof SettingsUpdate;

// ── 정규 글자 · 기본값 ────────────────────────────────────────

/** 메뉴 정규 글자(같은 상태 = 같은 글자). 값이 없으면 기본값과 같다. */
export function canonLayout(saved: SavedMenus | null): string {
  return JSON.stringify(canonicalMenus(saved));
}
export const isDefaultLayout = (saved: SavedMenus | null): boolean =>
  canonLayout(saved) === canonLayout(null);

export function canonFont(pref: FontScalePref): string {
  return JSON.stringify({ step: pref.step, follow: pref.follow });
}
export const isDefaultFont = (pref: FontScalePref): boolean =>
  canonFont(pref) === canonFont(DEFAULT_FONT_PREF);

/** 테마 정규 글자. 저장한 선택이 없으면(= 휴대폰 설정 따름) 빈 글자. */
export const canonTheme = (theme: Theme | null): string => theme ?? "";

// ── 계정 값 거르기 ────────────────────────────────────────────

const STEP_IDS: readonly string[] = FONT_STEPS.map((s) => s.id);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 엄격하게 읽기: 판 1 · 알려진 단계 · follow 가 참/거짓일 때만. 아니면 null (기기 값 읽기처럼 기본값으로 얼버무리지 않는다). */
function strictFont(value: unknown): FontScalePref | null {
  if (!isObject(value)) return null;
  if (value.v !== 1) return null;
  if (typeof value.step !== "string" || !STEP_IDS.includes(value.step)) {
    return null;
  }
  if (typeof value.follow !== "boolean") return null;
  return {
    step: value.step as FontScalePref["step"],
    follow: value.follow,
  };
}

function strictLayout(value: unknown): SavedMenus | null {
  if (!isObject(value)) return null;
  const saved = parseSavedMenus(JSON.stringify(value));
  return saved ? canonicalMenus(saved) : null;
}

/**
 * DB `members` 줄의 세 열 → 거른 값. 비었거나 모양이 틀린 칸은 `null`("한 번도 저장 안 함"으로 본다).
 * 줄이 없으면(null) 셋 다 null.
 */
export function accountValuesFromRow(
  row: Record<string, unknown> | null | undefined,
): AccountValues {
  const r = row ?? {};
  return {
    layout: strictLayout(r.layout),
    fontScale: strictFont(r.font_scale),
    theme: typeof r.theme === "string" ? parseSavedTheme(r.theme) : null,
  };
}

// ── 쓰기 전 검사 ──────────────────────────────────────────────

/** 메뉴 값의 크기 한도: ID 40개 · 40자까지 (사전은 10개다 — 넉넉히). */
const MAX_IDS = 40;
const MAX_ID_LENGTH = 40;
const KEYS: readonly SettingKey[] = ["layout", "fontScale", "theme"];

function boundedLayout(value: unknown): SavedMenus | null {
  if (!isObject(value)) return null;
  const { order, off } = value;
  for (const list of [order, off]) {
    if (!Array.isArray(list) || list.length > MAX_IDS) return null;
    if (list.some((x) => typeof x !== "string" || x.length > MAX_ID_LENGTH)) {
      return null;
    }
  }
  return strictLayout(value);
}

/**
 * 쓰기 본문(`POST /auth/settings`)을 **전부 먼저** 검사한다. 하나라도 틀리면 아무것도 쓰지 않는다(부분 저장 없음).
 * 칸은 `layout` · `fontScale` · `theme` 뿐, 바뀐 칸만, 값은 정규 모양으로 돌려준다. `null` 로 지우는 요청은 받지 않는다.
 */
export function validateSettingsUpdate(
  body: unknown,
): { ok: true; update: SettingsUpdate } | { ok: false } {
  if (!isObject(body)) return { ok: false };
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((k) => !(KEYS as string[]).includes(k))) {
    return { ok: false };
  }
  const update: SettingsUpdate = {};
  if ("layout" in body) {
    const v = boundedLayout(body.layout);
    if (!v) return { ok: false };
    update.layout = v;
  }
  if ("fontScale" in body) {
    const v = strictFont(body.fontScale);
    if (!v) return { ok: false };
    update.fontScale = v;
  }
  if ("theme" in body) {
    if (body.theme !== "light" && body.theme !== "dark") return { ok: false };
    update.theme = body.theme;
  }
  return { ok: true, update };
}

/** 모아 보낼 때 같은 칸은 나중 값이 이기고 다른 칸은 합친다. */
export function mergeUpdate(
  pending: SettingsUpdate,
  next: SettingsUpdate,
): SettingsUpdate {
  return { ...pending, ...next };
}

// ── 로그인 직후 갈래 (이슈 #193 2절 표) ───────────────────────

export type LayoutLoginDecision =
  "none" | "adopt" | "ask-save" | "ask-conflict";

/**
 * 화면 구성: 기기와 계정 값을 견주어 할 일을 정한다(값은 정규 모양으로 견줌).
 * - 기기 기본값 + 계정 비어 있음 → 안 함 / 계정 값 있음 → **묻지 않고 계정 값을 씀**(같으면 안 함)
 * - 기기 다름 + 계정 비어 있음 → 저장할까요 시트 / 계정과 같음 → 안 함 / 계정과 다름 → 충돌형 시트
 */
export function decideLayoutOnLogin(
  device: SavedMenus | null,
  account: SavedMenus | null,
): LayoutLoginDecision {
  const deviceDefault = isDefaultLayout(device);
  if (account === null) return deviceDefault ? "none" : "ask-save";
  if (canonLayout(device) === canonLayout(account)) return "none";
  return deviceDefault ? "adopt" : "ask-conflict";
}

/**
 * 글씨 크기 · 다크 모드(조용히): 계정이 비어 있으면 기기가 기본값일 때 안 하고, 아니면 기기 값을 계정에.
 * 계정 값이 있으면 같을 때 안 하고, 기기가 기본값이면 계정 값을 쓰고, 기기가 기본값과 다르면 기기 값을 계정에(계정에 다른 값이 있어도).
 */
export function decideQuietOnLogin(input: {
  deviceDefault: boolean;
  same: boolean;
  accountNull: boolean;
}): "none" | "adopt" | "push" {
  if (input.accountNull) return input.deviceDefault ? "none" : "push";
  if (input.same) return "none";
  return input.deviceDefault ? "adopt" : "push";
}

// ── 다른 기기 값 따라오기 · 기준(base) ────────────────────────

/**
 * 탭을 처음 열 때(로그인 직후가 아닐 때) 계정 값을 기기에 쓸지. **기기 값이 기준과 같거나 기본값일 때만** 쓴다 —
 * 이 기기에서 따로 바꾼 값(예: 충돌 시트를 ×로 닫은 것)은 덮어쓰지 않고 다음 로그인 때 시트로 다시 묻는다.
 * - `none`: 계정이 비어 있음(한 번도 저장 안 함) · 기기가 따로 달라졌음
 * - `mark`: 이미 같음 → 기준만 맞춘다
 * - `adopt`: 계정 값을 기기에 쓴다
 */
export function decideFollow(input: {
  account: string | null;
  device: string;
  deviceDefault: boolean;
  base: string | null;
}): "none" | "mark" | "adopt" {
  if (input.account === null) return "none";
  if (input.account === input.device) return "mark";
  if (input.deviceDefault || input.device === input.base) return "adopt";
  return "none";
}

/** 기기에 적는 "마지막으로 맞춘 값" (칸별 정규 글자). 회원 번호 자체는 남기지 않고 해시(`who`)만 함께 적는다. */
export type SyncBase = {
  who: string;
  layout?: string;
  fontScale?: string;
  theme?: string;
};

/** 기기의 기준 글자를 읽는다. 같은 회원 해시일 때만 쓰고, 다른 회원이 같은 기기로 로그인했거나 깨졌으면 기준 없음. */
export function readBase(raw: string | null, who: string): SyncBase {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (isObject(data) && data.who === who) {
      const base: SyncBase = { who };
      for (const k of KEYS) {
        if (typeof data[k] === "string") base[k] = data[k] as string;
      }
      return base;
    }
  } catch {
    // 깨진 글자는 기준 없음
  }
  return { who };
}

export function withBase(
  base: SyncBase,
  key: SettingKey,
  canon: string,
): SyncBase {
  return { ...base, [key]: canon };
}

export function baseFor(base: SyncBase, key: SettingKey): string | null {
  return base[key] ?? null;
}
