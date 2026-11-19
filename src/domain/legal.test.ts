import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  draftNotice,
  effectiveLine,
  LEGAL_DOCS,
  LEGAL_IDS,
  legalFileName,
  legalHref,
} from "./legal";

const read = (name: string) =>
  readFileSync(path.resolve(process.cwd(), "content/legal", name), "utf-8");

describe("문서 정보", () => {
  it("두 문서: 판 번호 · 시행일 · 제1판 · 예시 글(draft) · 이전 판 없음", () => {
    expect(LEGAL_IDS).toEqual(["terms", "privacy"]);
    expect(LEGAL_DOCS.terms).toEqual({
      id: "terms",
      title: "이용약관",
      version: "terms-2027-01-01",
      effectiveDate: "2027-01-01",
      edition: 1,
      draft: true,
      previous: [],
    });
    expect(LEGAL_DOCS.privacy).toEqual({
      id: "privacy",
      title: "개인정보처리방침",
      version: "privacy-2027-01-01",
      effectiveDate: "2027-01-01",
      edition: 1,
      draft: true,
      previous: [],
    });
  });

  it("판 번호 문자열은 L4 동의 기록(members.terms_version · privacy_version)에 저장할 값이다", () => {
    for (const id of LEGAL_IDS) {
      expect(LEGAL_DOCS[id].version).toMatch(
        new RegExp(`^${id}-\\d{4}-\\d{2}-\\d{2}$`),
      );
      // 판 번호 끝 날짜 = 시행일
      expect(LEGAL_DOCS[id].version).toBe(
        `${id}-${LEGAL_DOCS[id].effectiveDate}`,
      );
    }
  });

  it("글 파일 이름은 판 번호.md, 공개 주소는 /terms · /privacy", () => {
    expect(legalFileName(LEGAL_DOCS.terms)).toBe("terms-2027-01-01.md");
    expect(legalFileName(LEGAL_DOCS.privacy)).toBe("privacy-2027-01-01.md");
    expect(legalHref("terms")).toBe("/terms");
    expect(legalHref("privacy")).toBe("/privacy");
  });

  it("시행일 줄: '시행일 2027년 1월 1일 · 제1판'(0 붙이지 않음)", () => {
    expect(effectiveLine(LEGAL_DOCS.terms)).toBe(
      "시행일 2027년 1월 1일 · 제1판",
    );
    expect(
      effectiveLine({
        ...LEGAL_DOCS.terms,
        effectiveDate: "2027-11-09",
        edition: 3,
      }),
    ).toBe("시행일 2027년 11월 9일 · 제3판");
  });
});

describe("예시 글 배지 (사용자 결정 11/19) — draft 한 줄로 켜고 끈다", () => {
  it("draft 가 true 면 배지 '예시 글' + 안내 한 줄", () => {
    expect(draftNotice({ draft: true })).toEqual({
      badge: "예시 글",
      text: "전문가 확인을 거친 초안이에요. 2027년 1월 1일 시행 전에 바뀔 수 있어요.",
    });
  });

  it("draft 가 false 면 배지와 안내가 사라진다", () => {
    expect(draftNotice({ draft: false })).toBeNull();
  });

  it("지금 두 문서는 모두 예시 글이다", () => {
    for (const id of LEGAL_IDS) {
      expect(draftNotice(LEGAL_DOCS[id])).not.toBeNull();
    }
  });
});

describe("글 파일 검사 (전문가 확인을 거친 글이 통째로 들어 있는지)", () => {
  const terms = () => read(legalFileName(LEGAL_DOCS.terms));
  const privacy = () => read(legalFileName(LEGAL_DOCS.privacy));

  it("약관에 제1조 ~ 제11조와 부칙 제목이 모두 있고 문서 제목으로 시작한다", () => {
    const t = terms();
    expect(t.startsWith("## CropMon 이용약관\n")).toBe(true);
    for (let n = 1; n <= 11; n += 1) {
      expect(t, `제${n}조`).toMatch(new RegExp(`^### 제${n}조 \\(`, "m"));
    }
    expect(t).toMatch(/^### 부칙$/m);
    expect(
      t.trimEnd().endsWith("이 약관은 2027년 1월 1일부터 시행합니다."),
    ).toBe(true);
  });

  it("방침에 ### 1. ~ ### 15. 가 모두 있고 문서 제목으로 시작한다", () => {
    const p = privacy();
    expect(p.startsWith("## CropMon 개인정보처리방침\n")).toBe(true);
    for (let n = 1; n <= 15; n += 1) {
      expect(p, `${n}번`).toMatch(new RegExp(`^### ${n}\\. `, "m"));
    }
    expect(
      p.trimEnd().endsWith("이전 처리방침은 바닥글에서 볼 수 있게 합니다."),
    ).toBe(true);
  });

  it("두 파일 모두 안내 문구 · 표시 줄 · HTML 태그가 없다 (줄 끝 CRLF · 보이지 않는 글자도 없다)", () => {
    for (const body of [terms(), privacy()]) {
      expect(body).not.toContain("초안 안내");
      expect(body).not.toContain("공개 전");
      expect(body).not.toContain("<!--");
      expect(body).not.toContain("본문 시작");
      expect(body).not.toContain("본문 끝");
      expect(body).not.toMatch(/<\/?[A-Za-z!]/);
      expect(body).not.toContain("\r");
      // 폭 없는 공백 · 방향 표시 같은 보이지 않는 글자
      expect(body).not.toMatch(/[​-‏⁠﻿]/);
      expect(body.endsWith("\n")).toBe(true);
      expect(body.endsWith("\n\n")).toBe(false);
    }
  });
});
