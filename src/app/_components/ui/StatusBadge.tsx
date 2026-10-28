import { type AnyWaterStatus, STATUS_BADGE } from "./status";

/** 물 판정 배지. 상태는 색만으로 말하지 않고 항상 글자를 넣는다. */
export function StatusBadge({
  badge,
  className = "",
}: {
  badge: { status: AnyWaterStatus; label: string };
  className?: string;
}) {
  return (
    <span
      className={`text-14 rounded-full px-2.75 py-1.25 font-bold whitespace-nowrap ${STATUS_BADGE[badge.status]} ${className}`}
    >
      {badge.label}
    </span>
  );
}
