/**
 * 로그인 시트의 순수 계산 (이슈 #189, 결정 0064): 돌아올 주소 만들기 · 공급자 버튼 주소 · 주소에서 검색어 지우기.
 * 화면 · 네트워크를 불러오지 않는다. 돌아갈 주소(`next`)는 화면에서도 `validateRedirectPath` 를 한 번 지나게 한다(서버도 두 번 검사).
 */
import { type AuthProvider, validateRedirectPath } from "./auth";

/** 주소에서 `?` · `#` 를 떼고 검색어 글자만 돌려준다. */
function queryOf(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}

/**
 * 주소에서 지정한 검색어(key)만 지운다. 나머지 검색어 · `#` 는 받은 모양 그대로 살린다.
 * 남은 검색어가 없으면 `?` 도 없앤다. 반환은 `경로[?검색어][#해시]`.
 */
export function removeSearchKeys(
  pathname: string,
  search: string,
  hash: string,
  keys: readonly string[],
): string {
  const kept = queryOf(search)
    .split("&")
    .filter((pair) => pair !== "")
    .filter((pair) => !keys.includes(pair.split("=")[0]));
  return `${pathname}${kept.length > 0 ? `?${kept.join("&")}` : ""}${hash}`;
}

/**
 * 시트를 연 화면으로 돌아올 주소: 지금 경로 + 검색어(`st` · `crop` 등 선택 포함). `login` · `next` 검색어는 뺀다.
 * 위험한 값이면 `/`.
 */
export function loginSheetNext(pathname: string, search: string): string {
  return validateRedirectPath(
    removeSearchKeys(pathname, search, "", ["login", "next"]),
  );
}

/**
 * `/?login=1&next=…`(로그인 필요 주소를 비로그인으로 열었을 때)로 열렸으면 그 `next`, 아니면 null(시트가 열린 것이 아님).
 * `login=1` 인데 `next` 가 없거나 위험하면 `/`.
 */
export function loginRequestNext(search: string): string | null {
  const params = new URLSearchParams(queryOf(search));
  if (params.get("login") !== "1") return null;
  return validateRedirectPath(params.get("next"));
}

/** 공급자 버튼의 주소. `<a href>` 로 건다(`<Link>` 의 미리 불러오기가 로그인 시작을 먼저 보내지 않게, 결정 0061). */
export function loginButtonHref(provider: AuthProvider, next: string): string {
  return `/auth/login?provider=${encodeURIComponent(provider)}&next=${encodeURIComponent(validateRedirectPath(next))}`;
}

/**
 * 로그인 시트의 공급자 버튼 순서와 문구 (시안 v0.4.6: 카카오 · 네이버 · 구글, 같은 크기).
 * 색 · 심볼은 각 회사 공식 값이라 화면 부품이 갖는다. 구글 문구는 구글이 허용한 한국어 "Google 계정으로 로그인".
 */
export const LOGIN_PROVIDERS: readonly {
  provider: AuthProvider;
  label: string;
}[] = [
  { provider: "kakao", label: "카카오 로그인" },
  { provider: "custom:naver", label: "네이버 로그인" },
  { provider: "google", label: "Google 계정으로 로그인" },
];
