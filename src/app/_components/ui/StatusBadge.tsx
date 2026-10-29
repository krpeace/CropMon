import { type AnyWaterStatus, STATUS_BADGE } from "./status";

/** 물 판정 배지. 상태는 색만으로 말하지 않고 항상 글자를 넣는다. */
export function StatusBadge({
  badge,
  className = "",
  compact,
}: {
  badge: { status: AnyWaterStatus; label: string };
  className?: string;
  /** 좁은 목록용: 글자 13, 좌우 8. */
  compact?: boolean;
}) {
  return (
    <span
      className={`rounded-full font-bold whitespace-nowrap ${
        compact ? "text-13 px-2 py-1" : "text-14 px-2.75 py-1.25"
      } ${STATUS_BADGE[badge.status]} ${className}`}
    >
      {badge.label}
    </span>
  );
}
