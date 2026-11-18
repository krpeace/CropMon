import { tieMiddleDot, valueUnit } from "../src/domain/display";
import { expect, test, type Page } from "./fixtures";

// 줄바꿈 금지 (이슈 #153, 결정 0048): 숫자와 단위가 따로 떨어져 다음 줄로 넘어가지 않는다.
// 물 판정 카드 숫자 줄 "부족한 물 51 mm / 관수 시작점 65 mm" 와, 가운뎃점 낱말(U+2060)을 좁은 상자에서 확인한다.
// 폭만 바꾸는 시험이라 데스크톱 프로젝트에서 setViewportSize 로 돈다 (1024 미만이면 휴대폰 배치).

const LINE_SOURCE = "^부족한 물 \\d+ mm / 관수 시작점 \\d+ mm$";

/**
 * 물 판정 카드 숫자 줄에서 "숫자 + 단위" 조각마다 몇 줄에 걸쳐 그려지는지 돌려준다.
 * 줄을 못 찾으면 null. 조각이 한 줄이면 1, 숫자와 단위가 갈라지면 2 이상.
 */
async function unitChunkLines(page: Page) {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    const line = [...document.querySelectorAll("main div")]
      .filter((d) => re.test((d.textContent ?? "").replace(/\s+/g, " ").trim()))
      .at(-1); // 가장 안쪽
    if (!line) return null;
    // React 는 "{51} mm" 을 글자 마디 둘("51", " mm")로 나눠 그리므로, 마디를 넘나드는 범위로 잰다
    const spans: { node: Text; start: number; end: number }[] = [];
    let text = "";
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? "";
      spans.push({
        node: n as Text,
        start: text.length,
        end: text.length + t.length,
      });
      text += t;
    }
    const at = (i: number) => spans.find((s) => i >= s.start && i < s.end)!;
    const chunks: { text: string; lines: number }[] = [];
    for (const m of text.matchAll(/\d+[  ]mm/g)) {
      const from = m.index!;
      const to = from + m[0].length - 1;
      const range = document.createRange();
      range.setStart(at(from).node, from - at(from).start);
      range.setEnd(at(to).node, to + 1 - at(to).start);
      const tops = new Set(
        [...range.getClientRects()].map((r) => Math.round(r.top)),
      );
      chunks.push({ text: m[0], lines: tops.size });
    }
    return { chunks, text };
  }, LINE_SOURCE);
}

test("물 판정 카드 숫자 줄: 숫자와 단위가 줄바꿈 금지 공백(U+00A0)으로 묶여 있다", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  await page.waitForLoadState("networkidle");
  const r = await unitChunkLines(page);
  expect(r, "숫자 줄을 찾지 못했어요").not.toBeNull();
  expect(r!.chunks).toHaveLength(2); // "51 mm", "65 mm"
  expect(r!.text).toMatch(/\d+ mm/);
  expect(r!.text).not.toMatch(/\d+ mm/); // 일반 공백으로 남은 곳 없음
});

test("물 판정 카드 숫자 줄: 폭을 300에서 440까지 바꿔도 단위만 떨어지지 않는다 (390 포함)", async ({
  page,
}) => {
  await page.goto("/water?st=101&crop=apple");
  await page.waitForLoadState("networkidle");
  const bad: string[] = [];
  for (let width = 300; width <= 440; width += 2) {
    await page.setViewportSize({ width, height: 900 });
    const r = await unitChunkLines(page);
    expect(r, `폭 ${width}: 숫자 줄을 찾지 못했어요`).not.toBeNull();
    expect(
      r!.chunks,
      `폭 ${width}: 숫자 + 단위 조각을 못 찾았어요`,
    ).toHaveLength(2);
    if (r!.chunks.some((c) => c.lines > 1)) bad.push(`${width}px`);
  }
  expect(bad, `단위가 떨어진 폭: ${bad.join(", ")}`).toEqual([]);
});

test("가운뎃점 낱말은 U+2060 으로 묶으면 좁은 상자에서도 점에서 끊기지 않는다 (묶지 않은 글은 끊긴다)", async ({
  page,
}) => {
  await page.setContent(
    `<html lang="ko"><body style="margin:0;font:17px 'Malgun Gothic','Noto Sans CJK KR',sans-serif;word-break:keep-all"><div id="box"></div></body></html>`,
  );
  const breaksAt = (text: string) =>
    page.evaluate((t) => {
      const box = document.getElementById("box")!;
      const bad: number[] = [];
      for (let w = 10; w <= 160; w++) {
        box.style.width = `${w}px`;
        box.innerHTML = `앞글자 <span id="t">${t}</span> 뒷글자`;
        const range = document.createRange();
        range.selectNodeContents(document.getElementById("t")!);
        const tops = new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        );
        if (tops.size > 1) bad.push(w);
      }
      return bad;
    }, text);

  // 대조: 묶지 않은 글은 어느 폭에서 끊긴다 (이 시험이 문제를 잡아낼 수 있다는 증거)
  expect((await breaksAt("수집·이용")).length).toBeGreaterThan(0);
  // 묶은 글은 어떤 폭에서도 끊기지 않는다
  expect(await breaksAt(tieMiddleDot("수집·이용"))).toEqual([]);
  expect(await breaksAt(tieMiddleDot("작목·작형"))).toEqual([]);
  // 숫자 + 단위는 U+00A0 만으로 (U+2060 없이) 끊기지 않는다
  expect(await breaksAt(valueUnit(1000, "m²"))).toEqual([]);
  expect(valueUnit(1000, "m²")).not.toContain("⁠");
});
