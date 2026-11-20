/**
 * 로그인 규칙 (순수 함수, 이슈 #182, 결정 0061). 화면 · DB · 네트워크를 불러오지 않는다.
 * CropMon 은 **공개가 기본**이다. 로그인이 필요한 주소만 `LOGIN_REQUIRED_PATHS` 한 곳에 적고, 프록시가 이 목록으로 가른다.
 */

// ── 로그인이 필요한 주소 ───────────────────────────────────────

/**
 * 로그인이 필요한 주소(와 그 아래 모든 주소). 1/1 회원제의 농장 설정 · 작물 설정 · 회원 정보 · 동의 화면(`/consent`, 결정 0065).
 * 화면은 F1 · F2 · L6 이 이 이름으로 만든다. `/my-farm`(비회원 정적 미리보기) · `/auth/*` · `/api/*` 는 절대 넣지 않는다.
 * 프록시가 막는 것은 "바로 로그인 창으로 보내 주는 편의"이고, 진짜 막이는 DB 의 RLS 다(화면도 자기 쪽에서 한 번 더 확인한다).
 */
export const LOGIN_REQUIRED_PATHS: readonly string[] = [
  "/farm/settings",
  "/farm/crop",
  "/account",
  "/consent",
];

/**
 * 주소를 목록과 견주기 좋게 다듬는다: 인코딩 풀기 · 점(`.` `..`) 풀기 · 겹친 슬래시 합치기.
 * 풀 수 없는 인코딩이면 null.
 */
function normalizePathname(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const parts: string[] = [];
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join("/")}`;
}

/** 로그인이 필요한 주소인지. 인코딩 · 점 · 겹친 슬래시로 목록을 비켜 가지 못하고, 풀 수 없는 주소는 안전한 쪽(필요)으로 본다. */
export function requiresLogin(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === null) return true;
  return LOGIN_REQUIRED_PATHS.some(
    (base) => path === base || path.startsWith(`${base}/`),
  );
}

// ── 로그인 쿠키 ────────────────────────────────────────────────

/**
 * Supabase 로그인 쿠키 이름 모양: `sb-<프로젝트>-auth-token`, 길면 `.0` `.1` 로 쪼개진다.
 * 프로젝트 이름은 주소마다 다르므로 모양으로 가른다. `…-auth-token-code-verifier` 는 로그인 도중에만 있는 것이라 세지 않는다.
 */
const AUTH_COOKIE = /^sb-[^.]+-auth-token(\.\d+)?$/;

/** 쿠키 이름들 가운데 로그인 쿠키가 있는지. 없으면 프록시는 Supabase 를 부르지 않는다(방문자 대부분). */
export function hasAuthCookie(names: readonly string[]): boolean {
  return names.some((name) => AUTH_COOKIE.test(name));
}

// ── 공급자 ─────────────────────────────────────────────────────

/** 로그인을 시작할 수 있는 공급자. 네이버는 Supabase 기본 공급자가 아니라 사용자 지정(`custom:naver`)이다. */
const ALLOWED_PROVIDERS = ["kakao", "google", "custom:naver"] as const;
export type AuthProvider = (typeof ALLOWED_PROVIDERS)[number];

/**
 * 로그인을 시작할 수 있는 공급자인지(대소문자 · 공백이 다르면 거절).
 * 네이버(`custom:naver`)는 네이버 스위치(`naverLoginEnabled`)를 켠 때만 참이다 — 끄면 모르는 공급자와 똑같이 거절한다(결정 0064).
 * 공급자 판단은 서버의 이 한 곳에서 한다. 화면의 "준비 중" 버튼은 보이는 모양일 뿐이다.
 */
export function isAllowedProvider(
  value: unknown,
  naverEnabled: boolean,
): value is AuthProvider {
  if (typeof value !== "string") return false;
  if (value === "custom:naver") return naverEnabled;
  return (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

// ── 돌아갈 주소 ────────────────────────────────────────────────

const MAX_PATH_LENGTH = 2048;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** 인코딩(%XX)을 글자로 풀되 틀린 것이 있어도 던지지 않는다(검사용). 바이트 하나씩 풀어 슬래시 · 역슬래시 · 제어 문자를 찾는다. */
function lenientDecode(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/** 인코딩을 여러 겹 풀어 본 값들(원래 값 포함, 최대 세 번까지, 더 안 변하면 멈춤). */
function decodeLayers(value: string): string[] {
  const layers = [value];
  for (let i = 0; i < 3; i += 1) {
    const next = lenientDecode(layers[layers.length - 1]);
    if (next === layers[layers.length - 1]) break;
    layers.push(next);
  }
  return layers;
}

/**
 * 로그인 뒤 돌아갈 주소(next)가 우리 사이트 안의 경로인지 검사한다 (남의 사이트로 보내는 열린 리디렉션 막기).
 * 안전하면 **받은 값 그대로**(검색어 `?st=&crop=…` 와 `#` 를 살린다), 아니면 `/`.
 *
 * - **경로 부분**(`?` 나 `#` 앞): `/` 로 시작, `//` 로 시작하지 않음, `\` 없음, `/auth` 아래가 아님.
 *   인코딩으로 숨긴 것(`%2f%2f`, `%5c`, 두 번 인코딩)도 풀어서 같은 검사를 한다.
 * - **제어 문자**(줄바꿈 · 널 등): 인코딩을 풀어 본 값까지 전체에서 거절.
 * - **검색어 · `#` 의 값**은 경로가 아니므로 그 안의 `%2F` `://` 는 거절하지 않는다(정상 주소를 막지 않으려고).
 * - 문자열이 아니거나 비었거나 2048자를 넘으면 거절. 앞뒤 공백은 다듬지 않고 거절.
 */
export function validateRedirectPath(nextPath: unknown): string {
  if (typeof nextPath !== "string") return "/";
  if (nextPath === "" || nextPath.length > MAX_PATH_LENGTH) return "/";
  if (!nextPath.startsWith("/")) return "/";

  // 제어 문자는 전체를, 풀어 본 값까지 본다
  if (decodeLayers(nextPath).some((v) => CONTROL.test(v))) return "/";

  const cut = nextPath.search(/[?#]/);
  const rawPath = cut === -1 ? nextPath : nextPath.slice(0, cut);

  for (const layer of decodeLayers(rawPath)) {
    if (!layer.startsWith("/") || layer.startsWith("//")) return "/";
    if (layer.includes("\\")) return "/";
    // 로그인 길 자신으로는 돌아가지 않는다(돌고 도는 것 방지)
    if (layer === "/auth" || layer.startsWith("/auth/")) return "/";
  }

  // 마지막 확인: 풀어 보았을 때 우리 사이트 안이어야 한다
  try {
    const probe = new URL(nextPath, "http://cropmon.invalid");
    if (probe.origin !== "http://cropmon.invalid") return "/";
  } catch {
    return "/";
  }
  return nextPath;
}

/** 돌려보낸 화면 주소에 붙는 표시 값. 화면의 알림(토스트)이 읽고 주소에서 지운다. `ok` 는 로그인 성공(콜백이 붙임, 결정 0064). */
export type LoginNotice = "ok" | "cancelled" | "failed";

/**
 * 돌아갈 화면 주소에 `login=ok` · `login=cancelled` · `login=failed` 하나를 붙인다.
 * 주소에 있던 `login` · `next` 검색어는 지우고, 나머지 검색어와 `#` 는 받은 모양 그대로 살린다.
 */
export function withLoginNotice(path: string, notice: LoginNotice): string {
  const hashAt = path.indexOf("#");
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const pathname = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
  const kept = query
    .split("&")
    .filter((pair) => pair !== "")
    .filter((pair) => {
      const key = pair.split("=")[0];
      return key !== "login" && key !== "next";
    });
  kept.push(`login=${notice}`);
  return `${pathname}?${kept.join("&")}${hash}`;
}

/** 로그인 필요 주소를 비로그인으로 열었을 때 보낼 곳: `/?login=1&next=<원래 주소>`. 원래 주소가 위험하면 next 는 `/`. */
export function loginRequiredRedirect(
  pathname: string,
  search: string,
): string {
  const next = validateRedirectPath(`${pathname}${search}`);
  return `/?login=1&next=${encodeURIComponent(next)}`;
}

// ── 콜백 오류 ──────────────────────────────────────────────────

/**
 * 로그인 콜백이 오류와 함께 돌아왔을 때 취소 / 실패를 가른다.
 * 사용자가 공급자 화면에서 취소하면 `access_denied` 가 `error` · `error_code` · `error_description` 어딘가에 온다 → cancelled.
 * 그 밖의 모든 것(교환 실패 · 모르는 오류 · 비어 있음)은 failed. 원문은 화면 · 주소에 싣지 않는다.
 */
export function classifyOAuthCallbackError(
  error: string | null | undefined,
  errorCode: string | null | undefined,
  errorDescription: string | null | undefined,
): Exclude<LoginNotice, "ok"> {
  const cancelled = [error, errorCode, errorDescription].some(
    (value) => typeof value === "string" && /access_denied/i.test(value),
  );
  return cancelled ? "cancelled" : "failed";
}
