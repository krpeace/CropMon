/**
 * 카드 격자. 칸이 최소 폭(tokens.css --grid-*)보다 좁아지면 한 줄에 놓는 칸 수를 스스로 줄인다.
 * 배치 규칙은 여기 한 곳에만 둔다.
 */
const MIN = {
  card: "grid-cols-[repeat(auto-fit,minmax(min(100%,var(--grid-card)),1fr))]",
  small: "grid-cols-[repeat(auto-fit,minmax(min(100%,var(--grid-small)),1fr))]",
  wide: "grid-cols-[repeat(auto-fit,minmax(min(100%,var(--grid-wide)),1fr))]",
  day: "grid-cols-[repeat(auto-fit,minmax(min(100%,var(--grid-day)),1fr))]",
};

export function Grid({
  min,
  children,
}: {
  min: keyof typeof MIN;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid ${min === "wide" ? "items-start gap-4" : "gap-3"} ${MIN[min]}`}
    >
      {children}
    </div>
  );
}
