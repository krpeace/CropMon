import { readFileSync } from "node:fs";
import path from "node:path";

import { type LegalDoc, legalFileName } from "@/domain/legal";
import { type Block, parseLegalMarkdown } from "@/domain/legal-markdown";

/**
 * 약관 · 개인정보처리방침 글 파일(`content/legal/<판 번호>.md`)을 읽어 블록으로 바꾼다 (이슈 #173, 결정 0057).
 * 서버 부품에서만 쓴다(`fs`). 글은 빌드 때 한 번 읽어 모듈 안에 저장한다 — 쪽은 DB 를 읽지 않는 정적 화면이다.
 * 글 파일에 알 수 없는 모양이 있으면 `LegalMarkdownError` 로 **빌드가 실패**한다(글 일부가 조용히 사라지지 않게).
 */
const cache = new Map<string, Block[]>();

export function loadLegalBlocks(doc: Pick<LegalDoc, "version">): Block[] {
  const hit = cache.get(doc.version);
  if (hit) return hit;
  const file = path.join(process.cwd(), "content", "legal", legalFileName(doc));
  const blocks = parseLegalMarkdown(readFileSync(file, "utf-8"));
  cache.set(doc.version, blocks);
  return blocks;
}
