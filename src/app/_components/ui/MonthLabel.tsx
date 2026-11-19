/**
 * 월 글자("10월")를 그래프 눈금 · 막대 아래에 놓는 부품. 큰 글씨(130% 이상, `big:` 변형)에서는 첫 달만 "월"을 남기고
 * 나머지는 숫자만 보인다("1월 2 3 … 12") — 온도 · 햇빛 누적 그래프 눈금과 같은 방식이다. 칸 폭은 그대로라
 * 글자가 커져도 이웃 눈금끼리 겹치지 않는다 (이슈 #172, 결정 0056). "월"은 DOM 에 남아(숨김만) 글자 내용은 그대로다.
 * "숫자월" 모양이 아닌 글자는 그대로 둔다.
 */
export function MonthLabel({
  label,
  first = false,
}: {
  label: string;
  first?: boolean;
}) {
  const m = /^(\d+)월$/.exec(label);
  if (!m) return <>{label}</>;
  return (
    <>
      {m[1]}
      <span className={first ? "" : "big:hidden"}>월</span>
    </>
  );
}
