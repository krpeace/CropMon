import Link from "next/link";

import { withSelection, type Crop } from "@/domain/selection";
import type { TemperatureView } from "@/services/temperature";

import { Badge } from "../ui/Badge";
import { compareBars } from "./heat-chart";

/** 저온요구량 충족도 — 시간별 기온이 필요해 공개 뒤에 연다 (결정 0013). */
export function ChillCard({ crop }: { crop: Crop }) {
  return (
    <section
      aria-label="저온요구량 충족도"
      className="rounded-card bg-card flex flex-col gap-2.5 p-5"
    >
      <span className="text-17 font-bold">저온요구량 충족도</span>
      <span className="text-15 text-ink-2/85">
        꽃눈이 깨어날 만큼 겨울 추위를 겪었나{" "}
        <span className="text-ink-2/60">Chill requirement</span>
      </span>
      <span className="self-start">
        <Badge>준비 중</Badge>
      </span>
      {crop === "apple" ? (
        <span className="text-16 text-ink-2/90">
          시간별 기온이 필요해 공개 뒤에 열려요
        </span>
      ) : (
        <>
          <span className="text-18 text-gray-ink font-semibold">
            {crop === "common"
              ? "작물 공통에서는 저온요구량을 따지지 않아요"
              : "배추는 저온요구량을 따지지 않아요"}
          </span>
          <span className="text-15 text-ink-2/85">
            사과를 고르면 볼 수 있어요
          </span>
        </>
      )}
    </section>
  );
}

/** 지역 비교 · 평년보다 며칠 빠른가 (시안 그대로). 줄을 누르면 그 지역으로 바뀐다. */
export function CompareCard({
  view,
  crop,
}: {
  view: TemperatureView;
  crop: Crop;
}) {
  const { zero, bars } = compareBars(view.compare.map((r) => r.lead));
  return (
    <section
      aria-label="지역 비교 · 평년보다 며칠 빠른가"
      className="rounded-card bg-card flex flex-col gap-2 p-5"
    >
      <span className="text-17 font-bold">
        지역 비교 · 평년보다 며칠 빠른가
      </span>
      <span className="text-14 text-ink-2/80">
        지점을 누르면 그 지역으로 바뀌어요
      </span>
      {view.compareProblem && (
        <span className="text-15 text-ink-2/85">{view.compareProblem}</span>
      )}
      {view.compare.map((r, i) => {
        const bar = bars[i];
        return (
          <Link
            key={r.id}
            href={withSelection("/temperature", { stationId: r.id, crop })}
            scroll={false}
            aria-current={r.selected ? "true" : undefined}
            className="text-ink hit-44 grid min-h-9 grid-cols-(--compare-cols) items-center gap-2.5"
          >
            <span
              className={`text-15 ${r.selected ? "font-extrabold" : "font-medium"}`}
            >
              {r.name}
            </span>
            <span className="relative h-4" aria-hidden="true">
              <span
                className="bg-ink-2/35 absolute -top-0.75 -bottom-0.75 w-px"
                style={{ left: `${zero}%` }}
              />
              {bar && (
                <span
                  className={`rounded-bar absolute inset-y-0 ${
                    r.selected
                      ? "bg-selbar"
                      : (r.lead ?? 0) < 0
                        ? "bg-fill/45"
                        : "bg-lime"
                  }`}
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                />
              )}
            </span>
            <span
              className={`text-15 text-right font-bold ${r.lead == null ? "text-gray-ink" : ""}`}
            >
              {r.text}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
