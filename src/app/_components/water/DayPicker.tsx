"use client";

import { useRouter } from "next/navigation";

/**
 * 기준 날짜 고르기. 보이지 않는 날짜 칸을 가운데 글자 위에 덮어, 누르면 달력이 뜬다 (시안 그대로).
 * 고르면 그 날짜의 물 화면으로 간다. 오늘을 고르면 주소창에서 날짜를 뺀다.
 */
export function DayPicker({
  base,
  value,
  min,
  today,
}: {
  /** 날짜를 뺀 물 화면 주소 (지역·작물·재배 방식). */
  base: string;
  value: string;
  min: string;
  today: string;
}) {
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label="기준 날짜"
      value={value}
      min={min}
      max={today}
      onChange={(e) => {
        const d = e.target.value;
        if (!d) return;
        router.push(d >= today ? base : `${base}&d=${d}`, { scroll: false });
      }}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker();
        } catch {
          // 달력을 직접 못 띄우는 브라우저는 기본 동작에 맡긴다
        }
      }}
      className="absolute inset-0 size-full cursor-pointer opacity-0"
    />
  );
}
