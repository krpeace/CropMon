"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Crop } from "@/domain/selection";
import { WATER_STATUS_LABEL } from "@/domain/water-status";
import type { SeasonDay } from "@/services/water";

import { StatusBadge } from "../ui/StatusBadge";
import { dayIndexAt, hoverInfo, tipSide, yDr, yE } from "./season-chart";

const EDGE = 26; // 좌우 눈금 칸(px), SeasonCard 의 px-6.5 와 같다
const TIP_MAX = 220; // 값 상자 최대 폭(px)

type Hover = { i: number; pinned: boolean } | null;
type Geo = { topY: number; topH: number; botY: number; botH: number };

/**
 * 작기 그래프 위에서 그날 값을 따라 보여 준다 (이슈 #46). 선은 서버에서 그린 SVG 그대로 두고,
 * 안내선·점·값 상자만 그 위에 겹친다. 값은 옮겨 적기만 하고 계산하지 않는다.
 * - 마우스: 올리면 따라오고, 누르면 그날 물 화면으로 간다.
 * - 손가락: 누르고 끌면 따라오고, 떼면 고정된다. 이동은 상자 안 "이 날 보기 ›" 로만 (실수 이동 방지).
 * 키보드로는 기준 날짜 줄을 쓴다.
 */
export function ChartHover({
  base,
  today,
  crop,
  raw,
  taw,
  days,
  children,
}: {
  base: string;
  today: string;
  crop: Crop;
  raw: number;
  taw: number;
  days: SeasonDay[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const kind = useRef("mouse");
  const before = useRef<Hover>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const n = days.length;

  const href = (d: string) => (d >= today ? base : `${base}&d=${d}`);

  /** 위 칸·아래 칸의 위치와 높이를 읽는다 (안내선 길이와 점 높이에 쓴다). */
  const measure = useCallback(() => {
    const el = box.current;
    const top = el?.querySelector<HTMLElement>('[data-plot="top"]');
    const bot = el?.querySelector<HTMLElement>('[data-plot="bottom"]');
    if (!top || !bot) return;
    const next = {
      topY: top.offsetTop,
      topH: top.offsetHeight,
      botY: bot.offsetTop,
      botH: bot.offsetHeight,
    };
    setGeo((g) =>
      g &&
      g.topY === next.topY &&
      g.topH === next.topH &&
      g.botY === next.botY &&
      g.botH === next.botH
        ? g
        : next,
    );
  }, []);

  // 창 크기가 바뀌면 칸 위치를 다시 읽는다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // 고정된 상태에서 그래프 밖을 누르면 푼다
  const pinned = hover?.pinned ?? false;
  useEffect(() => {
    if (!pinned) return;
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [pinned]);

  const indexOf = (e: React.PointerEvent | React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return dayIndexAt(e.clientX - r.left, r.width, n);
  };
  const onLink = (e: React.SyntheticEvent) =>
    (e.target as Element).closest("[data-hover-link]") != null;

  const cur = hover && days[hover.i] ? hover : null;
  const day = cur ? days[cur.i] : null;
  const info = cur && day ? hoverInfo(day, crop, raw) : null;

  let overlay: React.ReactNode = null;
  if (cur && day && info && geo) {
    const x = `calc(${EDGE}px + (100% - ${EDGE * 2}px) * ${(cur.i + 0.5) / n})`;
    const side = tipSide(cur.i, n);
    const etcY =
      day.status !== "dormant" && day.etcMm != null
        ? geo.topY + (geo.topH * yE(day.etcMm)) / 100
        : null;
    const drY =
      day.drMm != null
        ? geo.botY + (geo.botH * yDr(day.drMm, taw)) / 100
        : null;
    // 값 상자가 카드 밖으로 나가지 않게 가장자리에서 멈춘다
    const place =
      side === "right"
        ? { left: `clamp(0px, calc(${x} + 8px), calc(100% - ${TIP_MAX}px))` }
        : {
            right: `clamp(0px, calc(100% - ${x} + 8px), calc(100% - ${TIP_MAX}px))`,
          };
    overlay = (
      <>
        <div
          aria-hidden="true"
          className="bg-ink-2/40 pointer-events-none absolute w-px -translate-x-1/2"
          style={{
            left: x,
            top: geo.topY,
            height: geo.botY + geo.botH - geo.topY,
          }}
        />
        {etcY != null && <Dot className="bg-emerald" left={x} top={etcY} />}
        {drY != null && <Dot className="bg-brand-ink" left={x} top={drY} />}
        <div
          role="tooltip"
          className="bg-card text-ink rounded-row shadow-hairline text-13 pointer-events-none absolute flex w-max flex-col gap-1 px-3 py-2 tabular-nums"
          style={{ top: geo.topY, maxWidth: TIP_MAX, ...place }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{info.date}</span>
            <StatusBadge
              compact
              badge={{
                status: info.status,
                label: WATER_STATUS_LABEL[info.status],
              }}
            />
          </div>
          {info.rows.map((r) => (
            <div
              key={r.label}
              className="flex flex-wrap justify-between gap-x-3"
            >
              <span className="text-ink-2/80">
                {r.label}
                {r.abbr && (
                  <span className="text-ink-2/60 text-12 ml-1">{r.abbr}</span>
                )}
              </span>
              <span className="ml-auto text-right">{r.value}</span>
            </div>
          ))}
          {cur.pinned && (
            <Link
              data-hover-link
              href={href(day.date)}
              scroll={false}
              aria-label={`${info.date} 물 화면 보기`}
              className="text-brand-ink pointer-events-auto flex min-h-11 items-center justify-end font-bold"
            >
              이 날 보기 ›
            </Link>
          )}
        </div>
      </>
    );
  }

  return (
    <div
      ref={box}
      className="relative flex cursor-pointer touch-pan-y flex-col gap-1.5 px-6.5 select-none"
      onPointerMove={(e) => {
        kind.current = e.pointerType;
        if (e.pointerType !== "mouse" && !dragging.current) return;
        const i = indexOf(e);
        if (i == null) return;
        measure();
        setHover({ i, pinned: false });
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setHover(null);
      }}
      onPointerDown={(e) => {
        kind.current = e.pointerType;
        if (e.pointerType === "mouse" || onLink(e)) return;
        const i = indexOf(e);
        if (i == null) return;
        before.current = hover;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        measure();
        setHover({ i, pinned: false });
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        setHover((h) => h && { ...h, pinned: true });
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        // 위아래로 쓸어 화면이 스크롤되기 시작하면 누르기 전 상태로 되돌린다
        if (!dragging.current) return;
        dragging.current = false;
        setHover(before.current);
      }}
      onClick={(e) => {
        // 손가락의 click 은 이동하지 않는다 (마우스일 때만)
        if (kind.current !== "mouse" || onLink(e)) return;
        const i = indexOf(e);
        const d = i == null ? null : days[i]?.date;
        if (d) router.push(href(d), { scroll: false });
      }}
    >
      {children}
      {overlay}
    </div>
  );
}

function Dot({
  className,
  left,
  top,
}: {
  className: string;
  left: string;
  top: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`ring-card pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${className}`}
      style={{ left, top }}
    />
  );
}
