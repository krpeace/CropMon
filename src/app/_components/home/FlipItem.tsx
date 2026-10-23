"use client";

import { useState } from "react";

/**
 * 지역·작물이 바뀌면 넘어가듯 다시 나타난다 (시안의 카드 넘김). 처음 열 때는 움직이지 않는다.
 * order 순서대로 0.08초씩 늦게 시작한다.
 */
export function FlipItem({
  flipKey,
  order,
  className = "",
  children,
}: {
  flipKey: string;
  order: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [prevKey, setPrevKey] = useState(flipKey);
  const [flips, setFlips] = useState(0);
  if (prevKey !== flipKey) {
    setPrevKey(flipKey);
    setFlips(flips + 1);
  }

  return (
    <div
      key={flips}
      className={`${flips > 0 ? "animate-flip" : ""} ${className}`}
      style={flips > 0 ? { animationDelay: `${order * 80}ms` } : undefined}
    >
      {children}
    </div>
  );
}
