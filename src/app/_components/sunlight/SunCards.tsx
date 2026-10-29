import Image from "next/image";
import Link from "next/link";

import { withSelection, type Crop } from "@/domain/selection";
import type { SunlightView } from "@/services/sunlight";

import { Badge } from "../ui/Badge";
import { monthBars, sunCompareBar, SUN_NORMAL_LINE } from "./sun-chart";

/** 올해 쌓인 햇빛 (시안 그대로): 꼬리표 → "올해 햇빛은 평년의 N%" → 적산일사 숫자 줄 → 설명 한 줄. */
export function TotalCard({ view }: { view: SunlightView }) {
  return (
    <section
      aria-label="올해 쌓인 햇빛"
      className="rounded-card bg-card flex flex-col gap-2.5 p-5"
    >
      <span className="text-15 text-ink-2/85 font-bold">
        올해 쌓인 햇빛{view.basis ? ` · ${view.basis}` : ""}
      </span>
      {view.problem ? (
        <div className="text-17 flex flex-wrap items-center gap-2.5">
          <Badge>자료 없음</Badge>
          <span className="text-ink-2/90">{view.problem}</span>
        </div>
      ) : (
        <>
          <div className="text-verdict leading-card tracking-title font-bold">
            {view.verdict}
          </div>
          {view.numbers && (
            <div className="text-19 text-ink-2/92">
              적산일사 <b className="text-ink">{view.numbers.thisYear}</b> /
              평년 {view.numbers.normal} MJ/m²
            </div>
          )}
          {view.summary && (
            <div className="text-16 text-ink-2/88">{view.summary}</div>
          )}
          <div className="text-14 text-ink-2/75">
            쌓인 햇빛 <span className="text-ink-2/60">적산일사 Σ Rs</span> · 1월
            1일부터
          </div>
        </>
      )}
    </section>
  );
}

/** 월별 햇빛 (시안 그대로): 올해·평년 막대, 막대 위 평년 대비 % (95% 미만 주황). */
export function MonthsCard({ view }: { view: SunlightView }) {
  if (view.months.length === 0) return null;
  const bars = monthBars(view.months);
  return (
    <section
      aria-label="월별 햇빛"
      className="rounded-card bg-card flex flex-col gap-3 p-5"
    >
      <span className="text-17 font-bold">월별 햇빛</span>
      <div className="text-13 text-ink-2/88 flex gap-3.5">
        <span className="flex items-center gap-1.5">
          <span className="bg-emerald rounded-bar size-2.5" />
          올해
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-fill/30 rounded-bar size-2.5" />
          평년
        </span>
        <span>MJ/m²</span>
      </div>
      <div
        className="grid h-42.5 items-end gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${view.months.length}, minmax(0, 1fr))`,
        }}
      >
        {view.months.map((m, i) => (
          <div
            key={m.label}
            className="flex h-full flex-col items-center justify-end gap-1"
          >
            <span
              data-testid={`pct-${i + 1}`}
              data-low={m.low ? "true" : "false"}
              className={`text-12 font-bold whitespace-nowrap ${m.low ? "text-warn" : "text-ink-2/85"}`}
            >
              {m.pct}
            </span>
            <div
              className="flex h-30 w-full items-end justify-center gap-0.5"
              aria-hidden="true"
            >
              <div
                className="bg-fill/30 rounded-t-bar w-2/5"
                style={{ height: `${bars[i].normal}%` }}
              />
              <div
                className="bg-emerald rounded-t-bar w-2/5"
                style={{ height: `${bars[i].thisYear}%` }}
              />
            </div>
            <span className="text-13 text-ink-2/85 whitespace-nowrap">
              {m.label}
            </span>
          </div>
        ))}
      </div>
      <span className="text-13 text-ink-2/75">
        막대 위 숫자는 평년 대비 %{view.monthNote ? ` · ${view.monthNote}` : ""}
      </span>
    </section>
  );
}

/** 지역 비교 · 평년 대비 햇빛 (시안 그대로). 세로선 = 평년(100%). 줄을 누르면 그 지역으로 바뀐다. */
export function SunCompareCard({
  view,
  crop,
}: {
  view: SunlightView;
  crop: Crop;
}) {
  return (
    <section
      aria-label="지역 비교 · 평년 대비 햇빛"
      className="rounded-card bg-card flex flex-col gap-2 p-5"
    >
      <span className="text-17 font-bold">지역 비교 · 평년 대비 햇빛</span>
      <span className="text-14 text-ink-2/80">
        지점을 누르면 그 지역으로 바뀌어요
      </span>
      {view.compareProblem && (
        <span className="text-15 text-ink-2/85">{view.compareProblem}</span>
      )}
      {view.compare.map((r) => (
        <Link
          key={r.id}
          href={withSelection("/sunlight", { stationId: r.id, crop })}
          scroll={false}
          aria-current={r.selected ? "true" : undefined}
          className="text-ink hit-44 grid min-h-9 grid-cols-(--compare-cols) items-center gap-2.5"
        >
          <span
            className={`text-15 ${r.selected ? "font-extrabold" : "font-medium"}`}
          >
            {r.name}
          </span>
          <span
            className="bg-fill/8 rounded-bar relative h-4"
            aria-hidden="true"
          >
            <span
              className="bg-ink-2/35 absolute -top-0.75 -bottom-0.75 w-px"
              style={{ left: `${SUN_NORMAL_LINE}%` }}
            />
            <span
              className={`rounded-bar absolute inset-y-0 left-0 ${r.selected ? "bg-selbar" : "bg-lime"}`}
              style={{ width: `${sunCompareBar(r.pct)}%` }}
            />
          </span>
          <span
            className={`text-15 text-right font-bold ${r.pct == null ? "text-gray-ink" : ""}`}
          >
            {r.text}
          </span>
        </Link>
      ))}
      <span className="text-13 text-ink-2/75">세로선 = 평년(100%)</span>
    </section>
  );
}

/** 일사를 재지 않는 지점 (시안 그대로): 엠블럼, "자료 없음", 가까운 지점 버튼(춘천·안동 고정). */
export function NotMeasuredCard({ name, crop }: { name: string; crop: Crop }) {
  return (
    <section
      aria-label="햇빛 자료 없음"
      className="rounded-card bg-card flex flex-col items-center gap-3 px-5 py-7 text-center"
    >
      <span className="bg-plate rounded-row flex shrink-0 dark:px-2 dark:py-0.5">
        <Image
          src="/brand/logo-emblem.png"
          alt=""
          width={412}
          height={383}
          className="h-auto w-28 opacity-90"
        />
      </span>
      <Badge>자료 없음</Badge>
      <div className="text-24 font-bold">
        {name} 관측소는 햇빛을 재지 않아요
      </div>
      <div className="text-17 text-ink-2/88 max-w-105 leading-loose">
        일사 관측 장비가 없는 지점이에요. 가까운 지점의 햇빛을 대신 볼 수
        있어요.
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={withSelection("/sunlight", { stationId: 101, crop })}
          className="bg-brand text-17 flex h-12.5 items-center rounded-full px-5.5 font-bold text-white"
        >
          춘천 햇빛 보기
        </Link>
        <Link
          href={withSelection("/sunlight", { stationId: 136, crop })}
          className="bg-brand-ink/10 text-brand-ink text-17 flex h-12.5 items-center rounded-full px-5.5 font-bold"
        >
          안동 햇빛 보기
        </Link>
      </div>
    </section>
  );
}
