import type { HeatDay } from "@/services/temperature";

/**
 * 적산온도 누적 그래프의 선 모양 (시안 그대로). 값은 바꾸지 않고 좌표로만 옮긴다.
 * 가로 = 날 순서(하루 1칸), 세로 = 0~100 (위가 0). SVG viewBox 는 "0 0 n 100".
 * 시안의 "올해 예상 (평년 흐름으로)" 점선은 화면에서 계산해야 하므로 그리지 않는다 (결정 0015).
 */

const STEP = 1000; // 세로 눈금 ℃·일
const HEADROOM = 1.04; // 가장 큰 값 위로 조금 띄운다

function line(vals: (number | null)[], fy: (v: number) => number) {
  let s = "";
  let pen = false;
  vals.forEach((v, d) => {
    if (v == null) {
      pen = false;
      return;
    }
    s += `${pen ? "L" : "M"}${(d + 0.5).toFixed(1)} ${fy(v).toFixed(2)}`;
    pen = true;
  });
  return s;
}

export type HeatChart = ReturnType<typeof heatChart>;

export function heatChart(days: readonly HeatDay[], today: string) {
  const n = Math.max(1, days.length);
  const max = Math.max(
    0,
    ...days.flatMap((d) => [d.cum ?? 0, d.normalCum ?? 0]),
  );
  const top = Math.max(STEP, Math.ceil((max * HEADROOM) / STEP) * STEP);
  const y = (v: number) => 100 - (v / top) * 100;
  const steps = Array.from({ length: top / STEP + 1 }, (_, k) => k * STEP);

  // 오늘이 표에 없으면 마지막 관측일에 둔다
  let at = days.findIndex((d) => d.date === today);
  if (at < 0) at = days.findLastIndex((d) => d.cum != null);
  if (at < 0) at = days.length - 1;

  const months: { label: string; left: string }[] = [];
  days.forEach((d, i) => {
    if (i === 0 || d.date.slice(5, 7) !== days[i - 1].date.slice(5, 7)) {
      const m = Number(d.date.slice(5, 7));
      months.push({
        label: months.length === 0 ? `${m}월` : String(m),
        left: `${(i / n) * 100}%`,
      });
    }
  });

  return {
    n,
    top,
    year: line(
      days.map((d) => d.cum),
      y,
    ),
    normal: line(
      days.map((d) => d.normalCum),
      y,
    ),
    grid: steps
      .filter((v) => v > 0 && v < top)
      .map((v) => `M0 ${y(v).toFixed(2)}H${n}`)
      .join(""),
    yTicks: steps.map((v) => ({
      t: v === 0 ? "0" : v.toLocaleString("ko-KR"),
      top: `${y(v)}%`,
    })),
    today: `${((at + 0.5) / n) * 100}%`,
    /** "오늘" 꼬리표가 양 끝에서 카드 밖으로 나가지 않게 민다. */
    todayShift: at / n > 0.9 ? "-100%" : at / n < 0.1 ? "0%" : "-50%",
    months,
  };
}

/** 지역 비교 막대: 0 의 위치와 막대마다 왼쪽·폭(%). 시안 눈금은 늦음 4일 · 빠름 8일, 넘으면 넓힌다. */
export function compareBars(leads: readonly (number | null)[]) {
  const vals = leads.filter((v): v is number => v != null);
  const late = Math.max(4, ...vals.map((v) => -v));
  const early = Math.max(8, ...vals);
  const span = late + early;
  const zero = (late * 100) / span;
  const unit = 100 / span;
  return {
    zero,
    bars: leads.map((v) => {
      if (v == null) return null;
      return v >= 0
        ? { left: zero, width: Math.max(0.8, v * unit) }
        : { left: zero + v * unit, width: Math.max(0.8, -v * unit) };
    }),
  };
}
