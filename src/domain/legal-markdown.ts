/**
 * 약관 · 개인정보처리방침 본문(마크다운 글 파일)을 화면용 값으로 바꾸는 작은 변환기 (이슈 #173, 결정 0057).
 *
 * 라이브러리를 쓰지 않는 이유: 글이 두 개뿐이고 쓰는 문법이 정해져 있으며(제목 · 문단 · 번호 목록(안에 점 목록) · 점 목록 · 표 · 굵은 글씨),
 * 법적 문서를 공개하는 화면의 공급망 표면을 넓히지 않으려는 것이다. **글 안의 HTML은 그리지 않는다** — 이 변환기는 글을 값으로만
 * 바꾸고 화면은 글자 노드로만 그리므로(`dangerouslySetInnerHTML` 없음) 구조적으로 그렇다. HTML 태그가 보이면 오류를 낸다.
 *
 * 엄격하다: 아는 모양이 아닌 줄(닫히지 않은 `**`, 코드 표시, 이상한 들여쓰기, 칸 수가 안 맞는 표 …)은 조용히 버리지 않고
 * `LegalMarkdownError`(줄 번호 포함)를 낸다. 번호 목록은 원문 번호를 값으로 갖는다(화면이 1부터 다시 세지 않게).
 */

/** 글 조각. 굵은 글씨(`**…**`)와 아닌 글. 글자는 원문 그대로(공백 포함). */
export type InlineSegment = { text: string; bold: boolean };
export type Inline = InlineSegment[];

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; inline: Inline }
  | { type: "paragraph"; inline: Inline }
  | {
      type: "ordered";
      items: { value: number; inline: Inline; sub: Inline[] }[];
    }
  | { type: "bullets"; items: Inline[] }
  | { type: "table"; head: Inline[]; rows: Inline[][] };

export class LegalMarkdownError extends Error {
  constructor(line: number, message: string) {
    super(`약관 글 ${line}째 줄: ${message}`);
    this.name = "LegalMarkdownError";
  }
}

const HTML_TAG = /<\/?[A-Za-z!]/;

/** 한 줄 안의 글 → 조각. 굵은 글씨 짝이 안 맞거나 비면 오류. */
function parseInline(source: string, line: number): Inline {
  if (source.includes("`")) {
    throw new LegalMarkdownError(line, "코드 표시(`)는 지원하지 않아요.");
  }
  if (HTML_TAG.test(source)) {
    throw new LegalMarkdownError(line, "글 안의 HTML은 그리지 않아요.");
  }
  const parts = source.split("**");
  if (parts.length % 2 === 0) {
    throw new LegalMarkdownError(line, "굵은 글씨(**)가 닫히지 않았어요.");
  }
  const out: Inline = [];
  parts.forEach((text, i) => {
    const bold = i % 2 === 1;
    if (bold && text === "") {
      throw new LegalMarkdownError(line, "빈 굵은 글씨(****)예요.");
    }
    if (text !== "") out.push({ text, bold });
  });
  return out;
}

const TABLE_SEPARATOR = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|$/;

function splitRow(row: string, line: number): string[] {
  const t = row.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) {
    throw new LegalMarkdownError(line, "표 줄은 |로 시작하고 끝나야 해요.");
  }
  if (t.includes("\\|")) {
    throw new LegalMarkdownError(line, "표 칸 안의 \\| 는 지원하지 않아요.");
  }
  return t
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

/** 마크다운 글 → 블록 목록. */
export function parseLegalMarkdown(source: string): Block[] {
  if (source.includes("\r")) {
    throw new LegalMarkdownError(1, "줄 끝은 LF 여야 해요(CRLF 없음).");
  }
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let para: { text: string[]; line: number } | null = null;
  let ordered: Extract<Block, { type: "ordered" }> | null = null;
  let bullets: Extract<Block, { type: "bullets" }> | null = null;

  const flushPara = () => {
    if (para) {
      blocks.push({
        type: "paragraph",
        inline: parseInline(para.text.join(" "), para.line),
      });
      para = null;
    }
  };
  const closeAll = () => {
    flushPara();
    ordered = null;
    bullets = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const no = i + 1;

    if (raw.trim() === "") {
      closeAll();
      continue;
    }

    const heading = /^(#{1,6}) (.*)$/.exec(raw);
    if (heading) {
      const level = heading[1].length;
      if (level < 2 || level > 4) {
        throw new LegalMarkdownError(
          no,
          `제목은 ## ~ #### 만 쓸 수 있어요(# 가 ${level}개).`,
        );
      }
      if (heading[2].trim() === "") {
        throw new LegalMarkdownError(no, "빈 제목이에요.");
      }
      closeAll();
      blocks.push({
        type: "heading",
        level: level as 2 | 3 | 4,
        inline: parseInline(heading[2].trim(), no),
      });
      continue;
    }

    if (raw.startsWith("|")) {
      closeAll();
      let j = i;
      while (j < lines.length && lines[j].startsWith("|")) j += 1;
      const group = lines.slice(i, j);
      if (group.length < 2 || !TABLE_SEPARATOR.test(group[1].trim())) {
        throw new LegalMarkdownError(
          no + 1,
          "표 머리 줄 바로 아래에 |---|---| 구분 줄이 있어야 해요.",
        );
      }
      const headCells = splitRow(group[0], no);
      const rows = group.slice(2).map((row, k) => {
        const cells = splitRow(row, no + 2 + k);
        if (cells.length !== headCells.length) {
          throw new LegalMarkdownError(
            no + 2 + k,
            `표 칸 수가 머리와 달라요(${cells.length}칸, 머리 ${headCells.length}칸).`,
          );
        }
        return cells.map((c, col) => parseInline(c, no + 2 + k + col * 0));
      });
      blocks.push({
        type: "table",
        head: headCells.map((c) => parseInline(c, no)),
        rows,
      });
      i = j - 1;
      continue;
    }

    const orderedItem = /^(\d+)\. (.+)$/.exec(raw);
    if (orderedItem) {
      flushPara();
      bullets = null;
      if (!ordered) {
        ordered = { type: "ordered", items: [] };
        blocks.push(ordered);
      }
      ordered.items.push({
        value: Number(orderedItem[1]),
        inline: parseInline(orderedItem[2], no),
        sub: [],
      });
      continue;
    }

    const subItem = /^ {2,}- (.+)$/.exec(raw);
    if (subItem) {
      if (!ordered || ordered.items.length === 0) {
        throw new LegalMarkdownError(
          no,
          "들여쓴 점 목록은 번호 목록 항목 바로 아래에서만 쓸 수 있어요.",
        );
      }
      ordered.items[ordered.items.length - 1].sub.push(
        parseInline(subItem[1], no),
      );
      continue;
    }

    const bulletItem = /^- (.+)$/.exec(raw);
    if (bulletItem) {
      flushPara();
      ordered = null;
      if (!bullets) {
        bullets = { type: "bullets", items: [] };
        blocks.push(bullets);
      }
      bullets.items.push(parseInline(bulletItem[1], no));
      continue;
    }

    if (/^\s/.test(raw)) {
      throw new LegalMarkdownError(no, "알 수 없는 들여쓰기예요.");
    }

    // 문단 줄 — 빈 줄 없이 이어진 줄은 한 문단(띄어쓰기로 이음)
    ordered = null;
    bullets = null;
    if (para) para.text.push(raw);
    else para = { text: [raw], line: no };
  }

  closeAll();
  return blocks;
}

function inlineText(inline: Inline): string {
  return inline.map((s) => s.text).join("");
}

/** 시험용: 블록에 든 글자만 줄 단위로 이어 붙인다(표시 · 번호는 뺌). 글이 하나도 안 사라졌는지 확인하는 데 쓴다. */
export function flattenText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph") {
      out.push(inlineText(b.inline));
    } else if (b.type === "ordered") {
      for (const item of b.items) {
        out.push(inlineText(item.inline));
        for (const s of item.sub) out.push(inlineText(s));
      }
    } else if (b.type === "bullets") {
      for (const item of b.items) out.push(inlineText(item));
    } else {
      out.push(b.head.map(inlineText).join(" "));
      for (const row of b.rows) out.push(row.map(inlineText).join(" "));
    }
  }
  return out.join("\n");
}
