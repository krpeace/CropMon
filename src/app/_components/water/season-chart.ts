import type { SeasonDay } from "@/services/water";

/**
 * 작기 돌아보기 그래프의 선 모양 (시안 그대로). 값은 바꾸지 않고 좌표로만 옮긴다.
 * 가로 = 날 순서(하루 1칸), 세로 = 0~100 (위가 0). SVG viewBox 는 "0 0 n 100".
 */

const ETO_MAX = 7.5; // mm/일, 이보다 크면 위에 붙인다
const RAIN_MAX = 60; // mm, 비 막대가 그래프 높이의 48%까지

export const yE = (v: number) => 100 - (Math.min(v, ETO_MAX) / ETO_MAX) * 92;

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

function area(vals: (number | null)[], fy: (v: number) => number) {
  let s = "";
  let open = false;
  for (let d = 0; d <= vals.length; d++) {
    const v = d < vals.length ? vals[d] : null;
    if (v == null) {
      if (open) s += `L${(d - 0.5).toFixed(1)} 100Z`;
      open = false;
      continue;
    }
    if (!open) s += `M${(d + 0.5).toFixed(1)} 100`;
    open = true;
    s += `L${(d + 0.5).toFixed(1)} ${fy(v).toFixed(2)}`;
  }
  return s;
}

export type SeasonChart = ReturnType<typeof seasonChart>;

export function seasonChart(
  rows: readonly SeasonDay[],
  raw: number,
  taw: number,
  selected: string,
) {
  const n = Math.max(1, rows.length);
  const yD = (v: number) => 100 - (v / taw) * 94;
  let rain = "";
  let off = "";
  let o0: number | null = null;
  rows.forEach((r, d) => {
    const p = r.rainMm ?? 0;
    if (p > 0.4) {
      rain += `M${(d + 0.1).toFixed(1)} 0h0.8v${((Math.min(p, RAIN_MAX) / RAIN_MAX) * 48).toFixed(2)}h-0.8z`;
    }
  });
  for (let d = 0; d <= rows.length; d++) {
    const isOff = d < rows.length && rows[d].status === "dormant";
    if (isOff && o0 === null) o0 = d;
    if (!isOff && o0 !== null) {
      off += `M${o0} 0H${d}V100H${o0}Z`;
      o0 = null;
    }
  }
  const rawY = yD(raw);
  // 고른 날이 작기 자료에 없으면(오늘처럼 아직 관측 전) 마지막 날에 표시한다
  const found = rows.findIndex((r) => r.date === selected);
  const sel = found < 0 ? rows.length - 1 : found;
  const months: { label: string; left: string }[] = [];
  rows.forEach((r, d) => {
    if (d === 0 || r.date.slice(5, 7) !== rows[d - 1].date.slice(5, 7)) {
      months.push({
        label: `${Number(r.date.slice(5, 7))}월`,
        left: `${(d / n) * 100}%`,
      });
    }
  });
  const pct = (v: number) => `${v}%`;
  return {
    n,
    eto: line(
      rows.map((r) => r.etoMm),
      yE,
    ),
    etc: line(
      rows.map((r) => (r.status === "dormant" ? null : r.etcMm)),
      yE,
    ),
    rain,
    off,
    grid: [2, 4, 6].map((v) => `M0 ${yE(v).toFixed(2)}H${n}`).join(""),
    dr: line(
      rows.map((r) => r.drMm),
      yD,
    ),
    drArea: area(
      rows.map((r) => r.drMm),
      yD,
    ),
    rawLine: `M0 ${rawY.toFixed(2)}H${n}`,
    overRaw: `M0 ${yD(taw).toFixed(2)}H${n}V${rawY.toFixed(2)}H0Z`,
    base: `M0 100H${n}`,
    etoTicks: [6, 4, 2, 0].map((v) => ({ t: String(v), top: pct(yE(v)) })),
    rainTicks: [
      { t: "0", top: "0%" },
      { t: "30", top: "24%" },
      { t: "60+", top: "48%" },
    ],
    drTicks: [
      { t: String(Math.round(taw)), top: pct(yD(taw)), raw: false },
      { t: String(Math.round(raw)), top: pct(rawY), raw: true },
      { t: "0", top: "100%", raw: false },
    ],
    sel: pct(((sel + 0.5) / n) * 100),
    /** 날짜 꼬리표가 양 끝에서 카드 밖으로 나가지 않게 민다. */
    selShift: sel / n > 0.9 ? "-100%" : sel / n < 0.1 ? "0%" : "-50%",
    months,
  };
}
