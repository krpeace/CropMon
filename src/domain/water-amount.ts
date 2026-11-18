/**
 * 물의 양 표시 변환: mm → 톤, 관수량 L ↔ 톤 (이슈 #153, 결정 0048).
 * 계산이 아니다 — DB 의 mm 를 단위만 바꿔 보여 줄 뿐이다(CLAUDE.md 프로젝트 규칙 1: 이 저장소는 계산하지 않고 DB 값을 보여 준다).
 * 1 mm × 1,000 m² = 1톤, 1톤 = 1,000 L.
 */
import { approx, formatNumber, NBSP, valueUnit } from "./display";

/** 관수 기록의 단위. 사용자가 넣은 단위 그대로 보여 준다 (DB 의 input_unit 과의 연결은 회원 표 이슈에서). */
export type WaterUnit = "L" | "ton";

/** 부동소수 오차(예: 1.25 * 10 = 12.499999…)에 반올림이 흔들리지 않게 하는 아주 작은 값. */
const EPS = 1e-9;

const isNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** 화면에 보이는 mm: 소수 한 자리로 반올림 (절반은 올림). 1.25 → 1.3, 1.24 → 1.2. */
export function roundMm1(mm: number): number {
  return Math.round(mm * 10 + EPS) / 10;
}

/**
 * mm → 톤. **화면에 보이는 mm(소수 한 자리로 반올림한 값) × 면적(m²) ÷ 1,000.**
 * 반올림 전 값으로 곱하지 않는다 — 농가가 화면의 mm 로 곱해 봐도 같은 톤이 나오게.
 * 값이 없거나 이상하면 null (문구 "자료 없음"은 화면이 정한다).
 */
export function toTons(
  mm: number | null | undefined,
  areaM2: number | null | undefined,
): number | null {
  if (!isNumber(mm) || mm < 0) return null;
  if (!isNumber(areaM2) || areaM2 <= 0) return null;
  const tenths = Math.round(mm * 10 + EPS); // 보이는 mm 를 0.1 단위 정수로
  return (tenths * areaM2) / 10000;
}

/**
 * 톤 표기: 늘 "약".
 * - 10톤 미만은 소수 한 자리 고정("약 2.6톤", "약 2.0톤"), 10톤 이상은 정수 + 천 단위 쉼표("약 169톤", "약 1,653톤").
 *   자리수는 **반올림한 뒤의 값**으로 정한다: 9.95톤은 소수 한 자리로 10.0 이므로 "약 10톤".
 * - 보이는 mm 가 0 이면 정확히 0이라 "약" 없이 "0톤". 0보다 크지만 0.0 이 되는 아주 작은 양은 "0.1톤 미만".
 * 값이 없으면 null.
 */
export function formatApproxTons(
  mm: number | null | undefined,
  areaM2: number | null | undefined,
): string | null {
  const tons = toTons(mm, areaM2);
  if (tons === null) return null;
  if (tons === 0) return "0톤";
  const oneDecimal = Math.round(tons * 10 + EPS) / 10;
  if (oneDecimal === 0) return `0.1톤${NBSP}미만`;
  if (oneDecimal >= 10) {
    return valueUnit(Math.round(tons + EPS), "톤", { approx: true });
  }
  return approx(`${formatNumber(oneDecimal, { fixed: 1 })}톤`);
}

/** 관수량 단위 바꾸기: 1톤 = 1,000 L. 부동소수 찌꺼기는 없앤다(1.1톤 → 1,100 L). 이상한 값은 null. */
export function convertWater(
  amount: number,
  from: WaterUnit,
  to: WaterUnit,
): number | null {
  if (!isNumber(amount) || amount < 0) return null;
  if (from === to) return amount;
  const converted = from === "L" ? amount / 1000 : amount * 1000;
  return Math.round(converted * 1e6) / 1e6;
}

/**
 * 관수량 표기. 사용자가 넣은 단위 그대로라 "약"을 붙이지 않는다.
 * "300 L"(숫자와 L 사이 줄바꿈 금지), "0.3톤"(소수는 최대 세 자리, 뒤쪽 0 없음). 이상한 값은 null.
 */
export function formatWaterAmount(
  amount: number,
  unit: WaterUnit,
): string | null {
  if (!isNumber(amount) || amount < 0) return null;
  if (unit === "L") {
    return valueUnit(Math.round(amount * 10) / 10, "L");
  }
  return valueUnit(Math.round(amount * 1000) / 1000, "톤");
}
