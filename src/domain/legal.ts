/**
 * 약관 · 개인정보처리방침 문서 정보 (이슈 #173, 결정 0057). 본문은 저장소의 글 파일(`content/legal/<판 번호>.md`)이고,
 * 이 파일은 그 글의 판(버전) · 시행일 · "예시 글" 여부를 갖는다.
 *
 * **`version` 문자열은 L4 동의 기록(`members.terms_version` · `privacy_version`)에 그대로 저장할 값이다.**
 * 판이 바뀌면 새 글 파일을 더하고 여기 `version` · `effectiveDate` · `edition` 을 바꾸고 이전 판을 `previous` 로 옮긴다.
 */

export type LegalId = "terms" | "privacy";

export type LegalDoc = {
  id: LegalId;
  /** 쪽 제목 · 두 문서 바꾸기 칸 이름. */
  title: string;
  /** 판 번호 = 글 파일 이름(확장자 앞) = 동의 기록에 저장할 값. */
  version: string;
  /** 시행일(YYYY-MM-DD). */
  effectiveDate: string;
  /** 몇 번째 판인가(제1판 = 1). */
  edition: number;
  /** true 면 "예시 글" 배지와 안내를 보인다. 전문가 확인 · 운영 준비가 끝나면 false 로 바꾼다(사용자 결정 11/19). */
  draft: boolean;
  /**
   * 이전 판 번호들(최근 것이 앞). 지금은 제1판이라 비어 있다.
   * 이전 판이 있을 때 "이전 판 보기"를 그릴 자리 — 지금은 화면에 그리지 않는다.
   */
  previous: readonly string[];
  /**
   * 이전 판 중 **다시 묻지 않아도 되는 판** 번호들 (결정 0065). 사소한 변경은 공지만 하고 이전 판 동의를 그대로 받아 주고,
   * 크게 바뀔 때는 여기에 넣지 않아 회원이 다시 동의한다. `previous`(이전 판 "보기" 목록)와 따로 둔다 —
   * 이전 판을 보여 주는 것과 다시 묻지 않는 것은 다른 결정이다. 지금은 제1판 하나라 비어 있다.
   */
  acceptedBefore: readonly string[];
};

export const LEGAL_IDS: readonly LegalId[] = ["terms", "privacy"];

export const LEGAL_DOCS: Record<LegalId, LegalDoc> = {
  terms: {
    id: "terms",
    title: "이용약관",
    version: "terms-2027-01-01",
    effectiveDate: "2027-01-01",
    edition: 1,
    draft: true,
    previous: [],
    acceptedBefore: [],
  },
  privacy: {
    id: "privacy",
    title: "개인정보처리방침",
    version: "privacy-2027-01-01",
    effectiveDate: "2027-01-01",
    edition: 1,
    draft: true,
    previous: [],
    acceptedBefore: [],
  },
};

/** 글 파일 이름 (`content/legal/` 안). */
export function legalFileName(doc: Pick<LegalDoc, "version">): string {
  return `${doc.version}.md`;
}

/** 공개 주소. */
export function legalHref(id: LegalId): string {
  return `/${id}`;
}

/** "시행일 2027년 1월 1일 · 제1판". */
export function effectiveLine(
  doc: Pick<LegalDoc, "effectiveDate" | "edition">,
): string {
  const [y, m, d] = doc.effectiveDate.split("-").map(Number);
  return `시행일 ${y}년 ${m}월 ${d}일 · 제${doc.edition}판`;
}

/** "예시 글" 배지 + 안내 한 줄. `draft` 가 false 면 없음. */
export function draftNotice(
  doc: Pick<LegalDoc, "draft">,
): { badge: string; text: string } | null {
  if (!doc.draft) return null;
  return {
    badge: "예시 글",
    text: "전문가 확인을 거친 초안이에요. 2027년 1월 1일 시행 전에 바뀔 수 있어요.",
  };
}

/** 저장된 판 번호를 받아 주는가: 지금 판이거나 `acceptedBefore` 에 있는 글자 그대로의 값. 비었거나 모르는 값은 아니다. */
function accepts(
  version: string | null | undefined,
  doc: Pick<LegalDoc, "version" | "acceptedBefore">,
): boolean {
  if (typeof version !== "string") return false;
  return version === doc.version || doc.acceptedBefore.includes(version);
}

/**
 * 동의 화면이 필요한가 (이슈 #191, 결정 0065). **두 판(이용약관 · 개인정보 안내) 가운데 하나라도 받아 주지 않으면 다시 묻는다.**
 * 받아 주는 판 = 지금 판 + `acceptedBefore`. 비었거나(동의 전) 모르는 값이면 필요하다.
 */
export function needsConsent(
  saved: {
    termsVersion?: string | null;
    privacyVersion?: string | null;
  },
  docs: Record<
    LegalId,
    Pick<LegalDoc, "version" | "acceptedBefore">
  > = LEGAL_DOCS,
): boolean {
  return !(
    accepts(saved.termsVersion, docs.terms) &&
    accepts(saved.privacyVersion, docs.privacy)
  );
}
