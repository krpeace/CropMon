import { describe, expect, it } from "vitest";

import { OPERATOR, operatorLine, operatorSegments } from "./operator";

/** 이슈 #161 본문의 문구 그대로. 약관 · 개인정보처리방침 초안과 같은 글자여야 해서 한 글자도 다르면 안 된다. */
const QUOTE =
  "주식회사 파모스 · 대표 이세용 · 사업자등록번호 281-87-02364 · 경기도 안양시 동안구 시민대로248번길 25, 503호(관양동, 경기창조산업안양센터) · 031-360-4152";

describe("운영자 표기", () => {
  it("한 줄 문구가 이슈의 인용과 정확히 같다", () => {
    expect(operatorLine()).toBe(QUOTE);
  });

  it("마디(회사 · 대표 · 사업자등록번호 · 주소 · 전화) 다섯 개를 ' · ' 로 이으면 같은 글자", () => {
    const segments = operatorSegments();
    expect(segments).toHaveLength(5);
    expect(segments.join(" · ")).toBe(QUOTE);
  });

  it("마디 내용", () => {
    expect(operatorSegments()).toEqual([
      "주식회사 파모스",
      "대표 이세용",
      "사업자등록번호 281-87-02364",
      "경기도 안양시 동안구 시민대로248번길 25, 503호(관양동, 경기창조산업안양센터)",
      "031-360-4152",
    ]);
  });

  it("사업자등록번호 · 전화는 하이픈 숫자 그대로 (글자를 바꾸지 않는다)", () => {
    expect(OPERATOR.businessNo).toBe("281-87-02364");
    expect(OPERATOR.phone).toBe("031-360-4152");
    // 줄바꿈 금지 공백 · 비분리 하이픈 등 보이지 않는 글자가 섞이지 않았다
    expect(operatorLine()).not.toMatch(/[ ‑⁠]/);
  });
});
