"use client";

import { useEffect } from "react";

import {
  FONT_STEPS,
  percentOf,
  stepById,
  stepByValue,
} from "@/domain/font-scale";

import { SummaryCard } from "../home/SummaryCard";
import { STATUS_CARD } from "../ui/status";
import {
  saveFontScale,
  useAppliedFz,
  useFontScalePref,
} from "./font-scale-store";
import { FollowSwitch } from "./FollowSwitch";
import { closeNotice } from "./notice-store";

/**
 * 글씨 크기 화면 (시안 v0.4.3 "글씨 크기", 이슈 #168, 결정 0055). 위에서 아래로:
 * 미리보기 카드 → "지금 글씨 크기 …" 한 줄 → 슬라이더 → 단계 이름 다섯 칸 → "휴대폰 설정 따르기".
 * 저장 버튼이 없다 — 고르는 즉시 화면 전체에 적용되고 기기에 저장된다. 들어오면 종합의 알리기 카드는 다시 안 나온다.
 */
export function FontSizeScreen() {
  const pref = useFontScalePref();
  const appliedFz = useAppliedFz();

  useEffect(() => {
    closeNotice("fontSize"); // 이 화면에 한 번 들어온 사람에게 카드를 또 보이지 않는다
  }, []);

  // 따르기가 켜져 있으면 측정으로 정해진 단계, 아니면 고른 단계 (--fz 는 단계 값 다섯 가운데 하나뿐)
  const shown = stepByValue(appliedFz) ?? stepById(pref.step);
  const index = FONT_STEPS.findIndex((s) => s.id === shown.id);
  const pick = (i: number) => {
    const next = FONT_STEPS[Math.max(0, Math.min(FONT_STEPS.length - 1, i))];
    saveFontScale({ ...pref, step: next.id });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title leading-title tracking-title max-desktop:sr-only m-0 pt-1.5 font-bold">
        글씨 크기
      </h1>

      <div data-testid="font-preview" className="flex flex-col gap-1.5">
        <p className="text-13 text-ink-2/85 m-0 px-1 font-bold">
          미리보기 · 예시 값
        </p>
        <SummaryCard
          icon="water"
          label="물"
          verdict="오늘은 괜찮아요, 내일 물 주세요"
          numbers="부족한 물 31 mm / 관수 시작점 35 mm"
          background={STATUS_CARD.need}
          badge={{ status: "need", label: "내일 관수 필요" }}
          gauge={{ status: "need", fillPct: 62, rawPct: 70 }}
        />
      </div>

      <div className="rounded-card bg-card flex flex-col gap-2.5 px-4 pt-4.5 pb-3.5">
        <p data-testid="font-now" className="text-15 m-0 px-1 font-bold">
          지금 글씨 크기{" "}
          <span className="text-brand-ink text-17">
            {shown.label} {percentOf(shown.value)}%
          </span>
        </p>

        <div
          data-testid="font-controls"
          className={`flex flex-col gap-2.5 ${pref.follow ? "opacity-40" : ""}`}
        >
          <div className="flex items-center gap-3">
            <span
              data-testid="ga-small"
              aria-hidden="true"
              className="fz-fixed text-15 flex-none font-bold"
            >
              가
            </span>
            <input
              type="range"
              aria-label="글씨 크기"
              aria-valuetext={`글씨 크기, ${shown.label} ${percentOf(shown.value)}%`}
              min={0}
              max={FONT_STEPS.length - 1}
              step={1}
              value={index}
              disabled={pref.follow}
              onChange={(e) => pick(Number(e.target.value))}
              className="accent-brand-ink fh-44 m-0 min-w-0 flex-1 cursor-pointer disabled:cursor-default"
            />
            <span
              data-testid="ga-large"
              aria-hidden="true"
              className="fz-fixed flex-none text-[28px] font-bold"
            >
              가
            </span>
          </div>

          <div data-testid="font-steps" className="grid grid-cols-5 gap-1">
            {FONT_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={i === index}
                disabled={pref.follow}
                onClick={() => pick(i)}
                className={`fz-cap text-14 fh-44 cursor-pointer rounded-full px-1 leading-tight font-bold disabled:cursor-default ${
                  i === index ? "bg-brand text-white" : "bg-fill/14 text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FollowSwitch
        on={pref.follow}
        onChange={(follow) => saveFontScale({ ...pref, follow })}
      />
    </div>
  );
}
