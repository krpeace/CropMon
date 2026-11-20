/**
 * 회원 정보 화면의 값 만들기 · 탈퇴 때 읽어 둘 로그인 정보 고르기 (이슈 #195, 결정 0067). 순수 함수 — 화면 · 네트워크를 불러오지 않는다.
 * 계산(물수지)이 아니라 DB 에서 읽은 값을 보여 줄 글자로 바꾸는 일뿐이다.
 */
import { LEGAL_DOCS, type LegalId } from "./legal";
import type { AccountNotice } from "./toast";

export type AccountProvider = "kakao" | "google" | "naver";

const PROVIDER_LABEL: Record<AccountProvider, string> = {
  kakao: "카카오",
  google: "구글",
  naver: "네이버",
};

/** 로그인 공급자 이름(`kakao` · `google` · `naver`, 네이버는 `custom:naver` 도). 모르거나 비면 null. */
export function providerOf(
  raw: string | null | undefined,
): AccountProvider | null {
  if (raw === "kakao" || raw === "google" || raw === "naver") return raw;
  if (raw === "custom:naver") return "naver";
  return null;
}

/** 한국 날짜 "2026년 8월 12일" (UTC 가 아니라 KST, 0 을 붙이지 않음). 없거나 읽을 수 없으면 null. */
export function koreanDate(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso === "") return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const kst = new Date(ms + 9 * 3_600_000);
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

/** 동의한 판 이름. 지금 판이면 "제N판", 모르는 이전 판이면 판 번호 글자 그대로, 비면 null. */
export function editionLabel(
  id: LegalId,
  version: string | null | undefined,
): string | null {
  if (typeof version !== "string" || version === "") return null;
  const doc = LEGAL_DOCS[id];
  return version === doc.version ? `제${doc.edition}판` : version;
}

export type AccountInfoInput = {
  provider: string | null;
  displayName: string | null;
  email: string | null;
  createdAt: string | null;
  termsVersion: string | null;
  termsAgreedAt: string | null;
  privacyVersion: string | null;
  privacyConfirmedAt: string | null;
};

export type AccountInfo = {
  providerLabel: string | null;
  name: string | null;
  email: string | null;
  joined: string | null;
  /** 이용약관 "2026년 8월 12일 동의 · 제1판". 판을 모르면 null. */
  termsLine: string | null;
  /** 개인정보처리방침 "2026년 8월 12일 안내 확인 · 제1판" — 개인정보는 동의가 아니라 안내 확인이다(결정 0065). */
  privacyLine: string | null;
};

const text = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

function consentLine(
  id: LegalId,
  verb: string,
  version: string | null,
  at: string | null,
): string | null {
  const edition = editionLabel(id, version);
  if (!edition) return null;
  const date = koreanDate(at);
  return `${date ? `${date} ` : ""}${verb} · ${edition}`;
}

/** 회원 정보 화면에 보일 값. 없는 값은 null 로 두어 화면이 줄째로 뺀다. */
export function buildAccountInfo(input: AccountInfoInput): AccountInfo {
  const provider = providerOf(input.provider);
  return {
    providerLabel: provider ? PROVIDER_LABEL[provider] : null,
    name: text(input.displayName),
    email: text(input.email),
    joined: koreanDate(input.createdAt),
    termsLine: consentLine(
      "terms",
      "동의",
      input.termsVersion,
      input.termsAgreedAt,
    ),
    privacyLine: consentLine(
      "privacy",
      "안내 확인",
      input.privacyVersion,
      input.privacyConfirmedAt,
    ),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** 로그인한 공급자 목록: 아는 것만, 중복 없이, 들어온 순서대로. */
export function providersOf(identities: unknown): AccountProvider[] {
  if (!Array.isArray(identities)) return [];
  const out: AccountProvider[] = [];
  for (const item of identities) {
    if (!isRecord(item) || typeof item.provider !== "string") continue;
    const p = providerOf(item.provider);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const KAKAO_ID_SHAPE = /^[0-9]{1,20}$/;

function idText(v: unknown): string | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0)
    return String(v);
  return typeof v === "string" ? v : null;
}

/**
 * 카카오 회원번호. `identities` 의 카카오 줄에서 `identity_data.provider_id` → `sub` → `id` 순서로, **숫자 1~20자리**인 첫 값만 쓴다.
 * 이 값이 연결 끊기 요청 본문에 들어가므로 숫자가 아니면 쓰지 않는다(다른 값이 끼어들 길을 막음).
 */
export function pickKakaoUserId(identities: unknown): string | null {
  if (!Array.isArray(identities)) return null;
  for (const item of identities) {
    if (!isRecord(item) || item.provider !== "kakao") continue;
    const data = isRecord(item.identity_data) ? item.identity_data : {};
    for (const candidate of [data.provider_id, data.sub, item.id]) {
      const value = idText(candidate);
      if (value !== null && KAKAO_ID_SHAPE.test(value)) return value;
    }
  }
  return null;
}

/** 카카오 연결 끊기 결과: 성공 · 실패 · 안 부름(키 없음 등). */
export type KakaoUnlinkResult = "ok" | "failed" | "skipped";

/**
 * 탈퇴 알림에 안내 한 줄("연결된 서비스는 …")을 더 붙일지. 카카오 하나만 연결했고 끊기가 성공했을 때만 안내 없이 끝난다.
 * 구글 · 네이버 · 둘 이상 연결 · 끊기 실패 · 안 부름 · 공급자를 못 읽음은 모두 안내를 붙인다(알 수 없으면 안전한 쪽).
 */
export function withdrawOutcome(
  providers: readonly AccountProvider[],
  kakao: KakaoUnlinkResult,
): AccountNotice {
  return providers.length === 1 && providers[0] === "kakao" && kakao === "ok"
    ? "withdrawn"
    : "withdrawn-unlinked";
}
