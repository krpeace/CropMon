/**
 * 적산 계열의 "작기 전" 판단 (결정 0072). 계열은 그해 누적 시작일 ~ 12-31 줄만 있다.
 * 줄이 없어서가 아니라 **날짜**로 정한다: 누적 시작일보다 앞선 날 = 작기 전, 시작일 뒤인데 줄이 없음 = "자료 없음".
 */
export function isBeforeSeason(today: string, cumStartMmdd: string): boolean {
  return today.slice(5) < cumStartMmdd;
}
