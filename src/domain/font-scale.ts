/**
 * 글씨 크기(--fz) 고르기 규칙 (이슈 #168, 결정 0055). 다섯 단계 · 저장 값 읽기 · "휴대폰 설정 따르기" 환산 ·
 * 첫 그리기 전에 `--fz` 를 정하는 머리 스크립트 글자. `--fz` 계산식 · 구역은 tokens.css 의 것(결정 0047) 그대로다.
 */

export type FontStepId = "small" | "normal" | "large" | "xlarge" | "xxlarge";

export type FontStep = { id: FontStepId; label: string; value: number };

/** 단계 다섯 개: 작게 0.9 · 보통 1 · 크게 1.15 · 더 크게 1.3 · 아주 크게 1.5. 이 밖의 값은 `--fz` 에 들어가지 않는다. */
export const FONT_STEPS: readonly FontStep[] = [
  { id: "small", label: "작게", value: 0.9 },
  { id: "normal", label: "보통", value: 1 },
  { id: "large", label: "크게", value: 1.15 },
  { id: "xlarge", label: "더 크게", value: 1.3 },
  { id: "xxlarge", label: "아주 크게", value: 1.5 },
];

/** 고른 단계를 기기에 기억해 두는 이름 (다른 저장 이름 `cropmon-theme` · `cropmon-menus` 와 같은 대시 모양). */
export const FONT_SCALE_KEY = "cropmon-font-scale";

export type FontScalePref = {
  step: FontStepId;
  /** "휴대폰 설정 따르기" 켜짐. 켜면 휴대폰 글자 크기에서 구한 가장 가까운 단계를 쓴다. */
  follow: boolean;
};

export const DEFAULT_FONT_PREF: FontScalePref = {
  step: "normal",
  follow: false,
};

const STEP_IDS = FONT_STEPS.map((s) => s.id);
const DEFAULT_INDEX = STEP_IDS.indexOf(DEFAULT_FONT_PREF.step);

/** 저장 글자 → 선택. 비었거나 망가졌거나 모르는 판 · 단계는 기본값(보통 · 따르기 꺼짐)으로 읽는다. */
export function parseFontScalePref(raw: string | null): FontScalePref {
  if (!raw) return DEFAULT_FONT_PREF;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return DEFAULT_FONT_PREF;
    }
    const o = data as Record<string, unknown>;
    if (o.v !== 1) return DEFAULT_FONT_PREF;
    const step = STEP_IDS.find((id) => id === o.step) ?? DEFAULT_FONT_PREF.step;
    return { step, follow: o.follow === true };
  } catch {
    return DEFAULT_FONT_PREF;
  }
}

export function serializeFontScalePref(pref: FontScalePref): string {
  return JSON.stringify({ v: 1, step: pref.step, follow: pref.follow });
}

export function stepById(id: FontStepId): FontStep {
  return FONT_STEPS.find((s) => s.id === id) ?? FONT_STEPS[DEFAULT_INDEX];
}

/** 값(`--fz`)이 단계 값과 정확히 같을 때만 그 단계, 아니면 null. */
export function stepByValue(value: number): FontStep | null {
  return FONT_STEPS.find((s) => s.value === value) ?? null;
}

/** 화면에 보이는 퍼센트 (1.15 → 115). */
export function percentOf(value: number): number {
  return Math.round(value * 100);
}

/** 휴대폰 글자 배율에 가장 가까운 단계. 범위 밖이면 끝 단계. 같은 거리면 작은 쪽. */
export function nearestStep(ratio: number): FontStep {
  let best = FONT_STEPS[0];
  for (const s of FONT_STEPS) {
    if (Math.abs(s.value - ratio) < Math.abs(best.value - ratio)) best = s;
  }
  return best;
}

/** 측정한 글자 크기(px) ÷ 기준(px). 읽을 수 없는 값(NaN · 0 · 음수 · 무한대)은 null. */
export function phoneRatio(px: number, basePx: number): number | null {
  if (!Number.isFinite(px) || px <= 0) return null;
  return px / basePx;
}

/** 아이폰 사파리 `font: -apple-system-body` 의 기본 크기(보통 설정). */
export const IOS_BODY_PX = 17;
/** 그 밖(안드로이드 크롬 · 카카오톡 인앱 등) `font-size: medium` 의 기본 크기. */
export const MEDIUM_PX = 16;

/** 지금 쓸 단계: 따르기가 켜지고 측정이 되면 측정값의 단계, 아니면 저장한 단계. */
export function effectiveStep(
  pref: FontScalePref,
  ratio: number | null,
): FontStep {
  if (pref.follow && ratio !== null) return nearestStep(ratio);
  return stepById(pref.step);
}

/**
 * 처음 그리기 전에 `<html>` 의 `--fz` 를 정하는 머리 스크립트 글자 (THEME_SCRIPT 와 같은 방식).
 * 단계 값 · 키는 위 상수에서 끼워 넣고, 허용 목록 밖의 값은 만들지 않는다. 저장소가 막히거나 측정이 실패하면
 * 저장한 단계(없으면 보통)로 둔다. 머리 안에서는 body 가 아직 없으므로 시험 요소는 documentElement 에 달았다가 바로 뗀다.
 * 시험(font-scale.test.ts)이 이 글자와 위 순수 함수가 같은 결과를 내는지 같은 표로 확인한다.
 */
export function buildFontScaleScript(): string {
  const ids = JSON.stringify(STEP_IDS);
  const values = JSON.stringify(FONT_STEPS.map((s) => s.value));
  return (
    `(function(){try{var K=${JSON.stringify(FONT_SCALE_KEY)},I=${ids},V=${values},i=${DEFAULT_INDEX},f=false;` +
    `try{var p=JSON.parse(localStorage.getItem(K));if(p&&typeof p==="object"&&p.v===1){var j=I.indexOf(p.step);if(j>=0)i=j;f=p.follow===true}}catch(e){}` +
    `var v=V[i];` +
    `if(f){try{var d=document.createElement("div"),b=${MEDIUM_PX};d.style.cssText="position:absolute;visibility:hidden;pointer-events:none";` +
    `if(CSS.supports("font","-apple-system-body")){d.style.font="-apple-system-body";b=${IOS_BODY_PX}}else{d.style.fontSize="medium"}` +
    `document.documentElement.appendChild(d);var x=parseFloat(getComputedStyle(d).fontSize);d.remove();` +
    `if(isFinite(x)&&x>0){var r=x/b,n=0;for(var k=1;k<V.length;k++){if(Math.abs(V[k]-r)<Math.abs(V[n]-r))n=k}v=V[n]}}catch(e){}}` +
    `document.documentElement.style.setProperty("--fz",String(v))}catch(e){}})()`
  );
}
