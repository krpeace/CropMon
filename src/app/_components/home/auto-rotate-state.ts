/** 종합 화면 자동 순환 및 주기적 자료 갱신 판정 로직. */

export type RotationCondition = {
  auto: boolean;
  visible: boolean;
  sheet: boolean;
  popover: boolean;
  pos: number | null;
};

/** 종합 화면 자동 전환(5초 순환)을 계속 돌릴지 판단한다. */
export function shouldRunRotation({
  auto,
  visible,
  sheet,
  popover,
  pos,
}: RotationCondition): boolean {
  return auto && visible && !sheet && !popover && pos !== null;
}

export type RefreshCondition = {
  isHidden: boolean;
  lastRefreshedAt: number;
  now: number;
  intervalMs: number;
};

/** 켜 둔 화면에서 서버 자료를 새로고침(router.refresh)할 시점인지 판단한다. */
export function shouldRefreshData({
  isHidden,
  lastRefreshedAt,
  now,
  intervalMs,
}: RefreshCondition): boolean {
  if (isHidden) return false;
  return now - lastRefreshedAt >= intervalMs;
}
