/**
 * 종합 맨 위 "알리기 카드" 고르기와 닫음 기억 (이슈 #168, 결정 0055).
 * 카드는 한 번에 하나: ① 농장 등록 권하기 → ② 가온 시작일 → ③ 글씨 크기. ①②는 F1 · W4 에서 만든다
 * (지금은 ③만 실제로 나온다). 그 카드들은 여기 `NOTICE_ORDER` 에 이미 자리가 있고, 보여도 되는 상태만 넘기면 된다.
 */

export type NoticeId = "farmPromo" | "heatingStart" | "fontSize";

/** 고르는 순서 (앞이 먼저). */
export const NOTICE_ORDER: readonly NoticeId[] = [
  "farmPromo",
  "heatingStart",
  "fontSize",
];

/** 닫은 카드를 기기에 기억해 두는 이름. 값은 `{"v":1,"closed":["fontSize"]}`. */
export const NOTICE_CLOSED_KEY = "cropmon-notice-closed";

/**
 * 보여 줄 카드 하나(또는 없음). 값은 "이 카드를 보여도 되는 상태"(닫지 않았고 조건이 맞음)이다.
 * 순서대로 처음 참인 카드를 고른다.
 */
export function pickNotice(
  can: Partial<Record<NoticeId, boolean>>,
): NoticeId | null {
  return NOTICE_ORDER.find((id) => can[id] === true) ?? null;
}

/** 모르는 이름 · 중복은 버리고 `NOTICE_ORDER` 순서로 세운다 (머리 스크립트와 같은 순서). */
function normalize(list: readonly unknown[]): NoticeId[] {
  return NOTICE_ORDER.filter((id) => list.includes(id));
}

/** 저장 글자 → 닫은 카드 목록. 비었거나 망가졌거나 모르는 판 · 이름은 버린다(중복도 한 번만). */
export function parseClosedNotices(raw: string | null): NoticeId[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    const o = data as Record<string, unknown>;
    if (o.v !== 1 || !Array.isArray(o.closed)) return [];
    return normalize(o.closed);
  } catch {
    return [];
  }
}

export function serializeClosedNotices(closed: readonly NoticeId[]): string {
  return JSON.stringify({ v: 1, closed: normalize(closed) });
}

/** 닫은 목록에 카드를 더한다(이미 있으면 그대로). */
export function addClosedNotice(
  closed: readonly NoticeId[],
  id: NoticeId,
): NoticeId[] {
  return normalize([...closed, id]);
}

/**
 * 처음 그리기 전에 닫은 카드 이름을 `<html data-notice-closed="fontSize farmPromo">` 로 다는 머리 스크립트 글자.
 * 카드는 서버에서 그려 두고 CSS 가 이 표시가 있으면 숨긴다 — 이미 닫은 사람에게 "보였다 사라짐"도 처음 사람에게 "밀림"도 없다.
 * 시험(notice.test.ts)이 이 글자와 `parseClosedNotices` 가 같은 결과를 내는지 확인한다.
 */
export function buildNoticeScript(): string {
  const ids = JSON.stringify(NOTICE_ORDER);
  return (
    `(function(){try{var K=${JSON.stringify(NOTICE_CLOSED_KEY)},I=${ids},o=[];` +
    `try{var p=JSON.parse(localStorage.getItem(K));if(p&&typeof p==="object"&&p.v===1&&Array.isArray(p.closed)){for(var n=0;n<I.length;n++){if(p.closed.indexOf(I[n])>=0)o.push(I[n])}}}catch(e){}` +
    `if(o.length)document.documentElement.setAttribute("data-notice-closed",o.join(" "))}catch(e){}})()`
  );
}
