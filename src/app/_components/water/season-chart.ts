import type { Crop } from "@/domain/selection";
import { dayLabel } from "@/domain/water-outlook";
import type { WaterStatus } from "@/domain/water-status";
import type { SeasonDay } from "@/services/water";

/**
 * 작기 돌아보기 그래프의 선 모양 (시안 그대로). 값은 바꾸지 않고 좌표로만 옮긴다.
 * 가로 = 날 순서(하루 1칸), 세로 = 0~100 (위가 0). SVG viewBox 는 "0 0 n 100".
 */

const ETO_MAX = 7.5; // mm/일, 이보다 크면 위에 붙인다
const RAIN_MAX = 60; // mm, 비 막대가 그래프 높이의 48%까지

export const yE = (v: number) => 100 - (Math.min(v, ETO_MAX) / ETO_MAX) * 92;

/** 아래 칸(부족한 물) 세로 위치 0~100. */
export const yDr = (v: number, taw: number) => 100 - (v / taw) * 94;

const EDGE = 26; // 좌우 눈금 칸(px)

/** 그래프 상자 안 x(px, 상자 왼쪽 기준) → 날짜 칸 번호. 눈금 칸을 빼고, 밖이면 양 끝에 붙인다. 날이 없으면 null. */
export function dayIndexAt(x: number, width: number, n: number) {
  if (n <= 0) return null;
  const inner = Math.max(1, width - EDGE * 2);
  const i = Math.floor(((x - EDGE) / inner) * n);
  return Math.min(n - 1, Math.max(0, i));
}

/** 값 상자를 안내선 오른쪽에 둘지 왼쪽에 둘지. 그래프 가운데를 넘으면 왼쪽. */
export function tipSide(i: number, n: number): "left" | "right" {
  return i / n > 0.5 ? "left" : "right";
}

const NO_DATA = "자료 없음";
// 비·부족한 물·관수 시작점은 정수, 하루 ETo·ETc 는 0~7 mm 라 소수 첫째 자리(늘 한 자리)
const mm = (v: number | null) => (v == null ? NO_DATA : `${Math.round(v)} mm`);
const mm1 = (v: number | null) => (v == null ? NO_DATA : `${v.toFixed(1)} mm`);

/** 값 상자에 쓸 글자. 계산 없이 옮겨 적기와 자릿수 맞추기만 한다. 상태는 DB 값 그대로. */
export function hoverInfo(day: SeasonDay, crop: Crop, raw: number) {
  const etc =
    day.status === "dormant"
      ? crop === "apple"
        ? "휴면기"
        : "작기 아님"
      : mm1(day.etcMm);
  const dr =
    day.drMm == null ? NO_DATA : `${mm(day.drMm)} / 관수 시작점 ${mm(raw)}`;
  return {
    date: dayLabel(day.date),
    status: day.status as WaterStatus,
    rows: [
      { label: "기준 증발산", abbr: "ETo", value: mm1(day.etoMm) },
      { label: "작물이 쓴 물", abbr: "ETc", value: etc },
      { label: "비", value: mm(day.rainMm) },
      { label: "부족한 물", abbr: "Dr", value: dr },
    ] as { label: string; abbr?: string; value: string }[],
  };
}

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
  const yD = (v: number) => yDr(v, taw);
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
