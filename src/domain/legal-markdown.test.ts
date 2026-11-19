import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  flattenText,
  LegalMarkdownError,
  parseLegalMarkdown,
  type Block,
} from "./legal-markdown";

const read = (name: string) =>
  readFileSync(path.resolve(process.cwd(), "content/legal", name), "utf-8");
const terms = () => read("terms-2027-01-01.md");
const privacy = () => read("privacy-2027-01-01.md");

const text = (b: Block) => flattenText([b]);

describe("parseLegalMarkdown — 쓰는 문법", () => {
  it("제목 ## · ### · ####", () => {
    const blocks = parseLegalMarkdown(
      "## 문서\n\n### 제1조 (목적)\n#### 작은 제목\n",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, inline: [{ text: "문서", bold: false }] },
      {
        type: "heading",
        level: 3,
        inline: [{ text: "제1조 (목적)", bold: false }],
      },
      {
        type: "heading",
        level: 4,
        inline: [{ text: "작은 제목", bold: false }],
      },
    ]);
  });

  it("문단: 빈 줄 없이 이어진 줄은 한 문단(띄어쓰기로 이음), 빈 줄이면 새 문단", () => {
    const blocks = parseLegalMarkdown("첫째 줄\n둘째 줄\n\n새 문단");
    expect(blocks.map(text)).toEqual(["첫째 줄 둘째 줄", "새 문단"]);
  });

  it("굵은 글씨는 짝이 맞는 ** 만, 조각으로 나뉜다", () => {
    const [p] = parseLegalMarkdown("앞 **굵게** 뒤 **또** 끝");
    expect(p).toEqual({
      type: "paragraph",
      inline: [
        { text: "앞 ", bold: false },
        { text: "굵게", bold: true },
        { text: " 뒤 ", bold: false },
        { text: "또", bold: true },
        { text: " 끝", bold: false },
      ],
    });
  });

  it("번호 목록은 원문 번호를 값으로 갖는다 (1부터 다시 세지 않는다)", () => {
    const blocks = parseLegalMarkdown(
      "3. 셋\n4. 넷\n\n문단\n\n1. 하나\n\n2. 둘",
    );
    const lists = blocks.filter((b) => b.type === "ordered");
    expect(lists.map((l) => l.items.map((i) => i.value))).toEqual([
      [3, 4],
      [1],
      [2],
    ]);
  });

  it("번호 목록 안 점 목록(들여쓴 줄)은 앞 번호 항목의 하위 항목", () => {
    const [list] = parseLegalMarkdown(
      "1. 먼저\n   - 가\n   - 나\n2. 다음\n3. 끝",
    );
    expect(list.type).toBe("ordered");
    if (list.type !== "ordered") return;
    expect(list.items.map((i) => [i.value, i.sub.length])).toEqual([
      [1, 2],
      [2, 0],
      [3, 0],
    ]);
  });

  it("점 목록", () => {
    const [list] = parseLegalMarkdown("- 하나\n- **둘**");
    expect(list.type).toBe("bullets");
    expect(flattenText([list])).toBe("하나\n둘");
  });

  it("표: 머리 + 줄, 칸 안 굵은 글씨도 같은 변환", () => {
    const [t] = parseLegalMarkdown(
      "| 구분 | 기간 |\n|---|---|\n| 회원 | **탈퇴 때까지.** 바로 파기 |",
    );
    expect(t.type).toBe("table");
    if (t.type !== "table") return;
    expect(t.head.map((c) => c.map((s) => s.text).join(""))).toEqual([
      "구분",
      "기간",
    ]);
    expect(t.rows[0][1]).toEqual([
      { text: "탈퇴 때까지.", bold: true },
      { text: " 바로 파기", bold: false },
    ]);
  });

  it("제목 바로 뒤 문단 · 문단 바로 뒤 목록처럼 빈 줄이 없어도 나뉜다", () => {
    const blocks = parseLegalMarkdown("### 1. 목적\n문단입니다.\n1. 항목");
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "ordered",
    ]);
  });
});

describe("parseLegalMarkdown — 아는 모양이 아니면 조용히 버리지 않고 오류", () => {
  it.each([
    ["닫히지 않은 굵은 글씨", "앞 **굵게"],
    ["빈 굵은 글씨", "앞 **** 뒤"],
    ["HTML 태그", "문단 <b>x</b>"],
    ["HTML 주석", "<!-- 주석 -->"],
    ["코드 표시", "문단 `코드`"],
    ["# 한 개짜리 제목", "# 제목"],
    ["들여쓴 문단", "  들여쓴 줄"],
    ["번호 목록 없이 나온 하위 항목", "   - 하위"],
    ["표 칸 수가 안 맞는 줄", "| a | b |\n|---|---|\n| 하나 |"],
    ["표 머리 뒤 구분 줄 없음", "| a | b |\n| 1 | 2 |"],
    ["표 칸 안의 파이프 이스케이프", "| a |\n|---|\n| x \\| y |"],
  ])("%s", (_name, src) => {
    expect(() => parseLegalMarkdown(src)).toThrow(LegalMarkdownError);
  });

  it("오류에 줄 번호가 들어 있다", () => {
    try {
      parseLegalMarkdown("정상\n\n앞 **굵게");
      throw new Error("오류가 나야 한다");
    } catch (e) {
      expect(e).toBeInstanceOf(LegalMarkdownError);
      expect((e as Error).message).toContain("3");
    }
  });
});

/** 원문에서 마크다운 표시만 걷어 낸 글자들 (줄 · 공백 단위) — 변환 결과와 같아야 글이 하나도 안 사라진 것이다. */
function sourceWords(src: string): string[] {
  // 번호 목록의 번호는 표시지만, 번호 제목("### 1. …")의 번호는 제목 글자의 일부다 — 그래서 목록 번호를 먼저 걷고 제목 표시를 나중에 걷는다
  return src
    .replace(/\*\*/g, "")
    .replace(/^\d+\. /gm, "")
    .replace(/^#{2,4} /gm, "")
    .replace(/^\s*- /gm, "")
    .replace(/^\|?[\s:|-]+\|?\s*$/gm, "") // 표 구분 줄
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

describe("실제 본문 두 개를 끝까지 변환", () => {
  it("약관: 오류 없이 변환되고 글이 하나도 사라지지 않는다", () => {
    const blocks = parseLegalMarkdown(terms());
    expect(flattenText(blocks).split(/\s+/).filter(Boolean)).toEqual(
      sourceWords(terms()),
    );
  });

  it("방침: 오류 없이 변환되고 글이 하나도 사라지지 않는다", () => {
    const blocks = parseLegalMarkdown(privacy());
    expect(flattenText(blocks).split(/\s+/).filter(Boolean)).toEqual(
      sourceWords(privacy()),
    );
  });

  it("약관: 문서 제목 1 · 조 제목 11 + 부칙, 표 없음", () => {
    const blocks = parseLegalMarkdown(terms());
    const h = (level: number) =>
      blocks.filter((b) => b.type === "heading" && b.level === level);
    expect(h(2)).toHaveLength(1);
    expect(h(3)).toHaveLength(12); // 제1조 ~ 제11조 + 부칙
    expect(blocks.filter((b) => b.type === "table")).toHaveLength(0);
  });

  it("방침: 번호 제목 15, 표 5개(2 · 3 · 6 · 7 · 13번)", () => {
    const blocks = parseLegalMarkdown(privacy());
    expect(
      blocks.filter((b) => b.type === "heading" && b.level === 3),
    ).toHaveLength(15);
    // 표가 어느 번호 제목 아래에 있는지
    const owner: number[] = [];
    let current = 0;
    for (const b of blocks) {
      if (b.type === "heading" && b.level === 3) {
        current = Number(/^(\d+)\./.exec(text(b))?.[1]);
      }
      if (b.type === "table") owner.push(current);
    }
    expect(owner).toEqual([2, 3, 6, 7, 13]);
  });

  it("약관 제8조: 번호 목록의 원문 번호(마지막 3)와 둘째 항목 아래 점 목록 4개가 그대로", () => {
    const blocks = parseLegalMarkdown(terms());
    const at = blocks.findIndex(
      (b) => b.type === "heading" && text(b).startsWith("제8조"),
    );
    const list = blocks[at + 1];
    expect(list.type).toBe("ordered");
    if (list.type !== "ordered") return;
    expect(list.items.map((i) => i.value)).toEqual([1, 2, 3]);
    expect(list.items[1].sub).toHaveLength(4);
  });

  it("방침 7번 표: 머리 6칸(이전받는 자 ~ 보유 기간), 줄 3개, 모든 줄이 6칸", () => {
    const blocks = parseLegalMarkdown(privacy());
    const tables = blocks.filter((b) => b.type === "table");
    const t = tables[3]; // 2 · 3 · 6 · 7 → 넷째
    expect(t.type).toBe("table");
    if (t.type !== "table") return;
    expect(t.head).toHaveLength(6);
    expect(t.rows).toHaveLength(3);
    for (const r of t.rows) expect(r).toHaveLength(6);
  });

  it("방침 3번 표의 굵은 글씨('회원탈퇴 때까지.')가 칸 안에서 굵게 나뉜다", () => {
    const blocks = parseLegalMarkdown(privacy());
    const t = blocks.filter((b) => b.type === "table")[1];
    if (t.type !== "table") throw new Error("표가 아님");
    expect(t.rows.some((r) => r.some((c) => c.some((s) => s.bold)))).toBe(true);
  });
});
