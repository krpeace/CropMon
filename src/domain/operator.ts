/**
 * 운영자 표기 (이슈 #161, 결정 0052). 데스크톱 바닥글(`SiteFooter`)이 읽고, L1 에서 만드는 약관 ·
 * 개인정보처리방침 화면 끝의 운영자 줄도 이 값을 읽는다 — **약관 · 개인정보처리방침 초안과 같은 글자**여야 해서
 * 글자를 이 한 곳에만 둔다. 공개된 사업자 정보다.
 * 글자 자체는 바꾸지 않는다(줄바꿈 금지 공백 · 비분리 하이픈 등 보이지 않는 글자를 섞지 않는다) — 줄에서 쪼개지지 않게
 * 하는 것은 화면 쪽이 마디(`operatorSegments`)마다 `white-space: nowrap` 으로 한다.
 */
export const OPERATOR = {
  company: "주식회사 파모스",
  representative: "이세용",
  businessNo: "281-87-02364",
  address:
    "경기도 안양시 동안구 시민대로248번길 25, 503호(관양동, 경기창조산업안양센터)",
  phone: "031-360-4152",
} as const;

/** 마디 사이의 글자. */
export const OPERATOR_SEPARATOR = " · ";

/** 마디 다섯: 회사 · 대표 · 사업자등록번호 + 번호 · 주소 · 전화. 화면은 마디마다 한 덩어리로 묶는다. */
export function operatorSegments(): string[] {
  return [
    OPERATOR.company,
    `대표 ${OPERATOR.representative}`,
    `사업자등록번호 ${OPERATOR.businessNo}`,
    OPERATOR.address,
    OPERATOR.phone,
  ];
}

/** 한 줄 문구: 마디를 " · " 로 이은 글자. */
export function operatorLine(): string {
  return operatorSegments().join(OPERATOR_SEPARATOR);
}
