export type Freshness = { label: string; isStale: boolean };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** 이 시간을 넘게 갱신이 없으면 수집이 멈춘 것으로 본다. */
export const STALE_AFTER_MS = 13 * HOUR_MS;

const NO_DATA: Freshness = { label: "자료 없음", isStale: true };

/** 마지막 갱신 시각을 "N분 전" 같은 쉬운 말로 바꾸고, 수집이 멈췄는지 알려 준다. */
export function getFreshness(
  lastUpdatedIso: string | null | undefined,
  nowIso: string,
): Freshness {
  if (!lastUpdatedIso) return NO_DATA;

  const lastUpdated = Date.parse(lastUpdatedIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(lastUpdated) || Number.isNaN(now)) return NO_DATA;

  const elapsed = now - lastUpdated;
  const isStale = elapsed > STALE_AFTER_MS;

  if (elapsed < MINUTE_MS) return { label: "방금 전", isStale };
  if (elapsed < HOUR_MS) {
    return { label: `${Math.floor(elapsed / MINUTE_MS)}분 전`, isStale };
  }
  return { label: `${Math.floor(elapsed / HOUR_MS)}시간 전`, isStale };
}
