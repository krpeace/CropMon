"use client";

import { useRouter } from "next/navigation";

/** 작기 그래프를 누르면 그날의 물 화면으로 간다 (시안 그대로). 키보드로는 기준 날짜 줄을 쓴다. */
export function ChartClick({
  base,
  dates,
  today,
  children,
}: {
  base: string;
  dates: string[];
  today: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      className="relative flex cursor-crosshair flex-col gap-1.5 px-6.5"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const inner = box.width - 52; // 좌우 눈금 칸 26px씩
        const x = (e.clientX - box.left - 26) / inner;
        const i = Math.min(
          dates.length - 1,
          Math.max(0, Math.floor(x * dates.length)),
        );
        const d = dates[i];
        if (!d) return;
        router.push(d >= today ? base : `${base}&d=${d}`, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
