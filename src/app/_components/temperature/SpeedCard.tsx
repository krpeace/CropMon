import type { TemperatureView } from "@/services/temperature";

import { Badge } from "../ui/Badge";
import { Grid } from "../ui/Grid";

/** 생육 속도 (시안 그대로): 꼬리표 → "평년보다 +N℃" → 적산온도 숫자 줄 → 작은 설명. */
export function SpeedCard({ view }: { view: TemperatureView }) {
  return (
    <section
      aria-label="생육 속도"
      className="rounded-card bg-card flex flex-col gap-2.5 p-5"
    >
      <span className="text-15 text-ink-2/85 font-bold">
        생육 속도{view.basis ? ` · ${view.basis}` : ""}
      </span>
      {view.problem ? (
        <div className="text-17 flex flex-wrap items-center gap-2.5">
          <Badge>자료 없음</Badge>
          <span className="text-ink-2/90">{view.problem}</span>
        </div>
      ) : (
        <>
          <div className="text-verdict leading-card tracking-title font-bold text-pretty">
            {view.verdict}
          </div>
          {view.numbers && (
            <div className="text-19 text-ink-2/92">
              적산온도 <b className="text-ink">{view.numbers.thisYear}</b> /
              평년 {view.numbers.normal}℃ ({view.numbers.diff})
            </div>
          )}
          <div className="text-14 text-ink-2/75">
            적산온도 GDD
            {view.baseTemp != null && ` · 기준 온도 ${view.baseTemp}℃`} · 1월
            1일부터
          </div>
        </>
      )}
    </section>
  );
}

/** 꼬리표 색: 빠름은 종합표 +℃ 막대(오른쪽)와 같은 연두 계열, 지연·같음은 왼쪽 막대와 같은 회색 계열. */
const LAG_TONE = {
  early: "bg-brand-ink/12 text-brand-ink",
  late: "bg-fill/14 text-gray-ink",
  same: "bg-fill/14 text-gray-ink",
} as const;

/** 적산온도 단계 카드 두 개: 올해가 막 지난 단계와 다음 단계 (시안의 만개·수확 자리, 결정 0015). */
export function StageCards({ view }: { view: TemperatureView }) {
  if (view.stages.length === 0) return null;
  return (
    <section aria-label="적산온도 단계">
      <Grid min="small">
        {view.stages.map((s) => (
          <div
            key={s.title}
            className="rounded-card bg-card flex flex-col gap-1.5 p-4.5"
          >
            <span className="text-15 text-ink-2/85 font-bold">{s.title}</span>
            <span className="flex items-center gap-2">
              <span
                className={`text-24 font-bold ${s.reached ? "" : "text-gray-ink"}`}
              >
                {s.thisYear}
              </span>
              {s.lag && (
                <span
                  className={`text-15 rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap ${LAG_TONE[s.lag.tone]}`}
                >
                  {s.lag.text}
                </span>
              )}
            </span>
            <span className="text-15 text-ink-2/85">{s.normal}</span>
          </div>
        ))}
      </Grid>
    </section>
  );
}
