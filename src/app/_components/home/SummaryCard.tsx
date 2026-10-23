import Link from "next/link";

import type { StatusBadge as Badge } from "@/domain/water-status";
import type { Gauge as GaugeValue } from "@/services/home";

import { Badge as GrayBadge } from "../ui/Badge";
import { Gauge } from "../ui/Gauge";
import { Icon } from "../ui/Icon";
import { StatusBadge } from "../ui/StatusBadge";

type Props = {
  href: string;
  icon: "water" | "temperature" | "sunlight";
  label: string;
  verdict: string;
  numbers: string;
  /** 카드 바탕. 물 카드만 상태 색, 나머지는 흰색. */
  background: string;
  badge?: Badge;
  /** "자료 없음" 처럼 회색 배지. */
  grayBadge?: string;
  gauge?: GaugeValue | null;
};

/** 종합 화면의 큰 카드 (물·온도·햇빛). 카드 전체를 누르면 그 메뉴로 간다. */
export function SummaryCard({
  href,
  icon,
  label,
  verdict,
  numbers,
  background,
  badge,
  grayBadge,
  gauge,
}: Props) {
  const isWater = icon === "water";
  return (
    <Link
      href={href}
      className={`rounded-card text-ink flex h-full flex-col gap-3 p-5 active:opacity-85 ${background} ${
        isWater ? "shadow-edge" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`text-brand flex size-9 items-center justify-center rounded-full ${
            isWater ? "bg-white/80" : "bg-emerald/14"
          }`}
        >
          <Icon name={icon} size={22} strokeWidth={2} />
        </span>
        <span className="text-18 font-bold">{label}</span>
        <span className="flex-1" />
        {badge && <StatusBadge badge={badge} />}
        {grayBadge && <GrayBadge>{grayBadge}</GrayBadge>}
        <Icon
          name="chevron"
          size={18}
          strokeWidth={2.4}
          className="text-ink-2/50"
        />
      </div>
      <div className="text-card-verdict leading-card tracking-verdict font-bold text-pretty">
        {verdict}
      </div>
      <div className="text-18 text-ink-2/90">{numbers}</div>
      {gauge && <Gauge gauge={gauge} size="card" />}
    </Link>
  );
}

/** 준비 중인 메뉴의 작은 카드 (토양·도매시장). */
export function SoonCard({
  href,
  icon,
  label,
  question,
}: {
  href: string;
  icon: "soil" | "market";
  label: string;
  question: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-card bg-card text-ink flex h-full flex-col gap-2 p-4.5 active:opacity-85"
    >
      <div className="flex items-center gap-2">
        <Icon
          name={icon}
          size={22}
          strokeWidth={2}
          className="text-gray-icon"
        />
        <span className="text-18 font-bold">{label}</span>
      </div>
      <span className="bg-fill/14 text-14 text-gray-ink self-start rounded-full px-2.5 py-1 font-bold whitespace-nowrap">
        준비 중
      </span>
      <div className="text-15 text-ink-2/85 leading-snug">{question}</div>
    </Link>
  );
}
