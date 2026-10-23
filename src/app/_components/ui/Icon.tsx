import { ICON_PATH } from "../shell/pages";

type Props = {
  name: keyof typeof ICON_PATH;
  size: number;
  strokeWidth?: number;
  /** 재생·멈춤처럼 칠하는 아이콘. */
  filled?: boolean;
  className?: string;
};

/** 시안의 선 아이콘. 색은 글자 색(currentColor)을 따른다. */
export function Icon({
  name,
  size,
  strokeWidth = 1.9,
  filled,
  className,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATH[name]} />
    </svg>
  );
}
