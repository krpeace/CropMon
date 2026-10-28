import Link from "next/link";

import type { Selection } from "@/domain/selection";
import { FORECAST_CALIBRATED, withWaterQuery } from "@/domain/water-outlook";
import type { OutlookCard as Outlook } from "@/services/water";

import { Grid } from "../ui/Grid";
import { STATUS_BADGE } from "../ui/status";

/** ② 앞으로 3일 (시안 그대로) + 관수 필요 예상일·권장 관수량 한 줄, 마지막 참고일은 흐리게. */
export function OutlookCard({
  outlook,
  selection,
}: {
  outlook: Outlook | null;
  selection: Selection;
}) {
  const borrowed =
    outlook?.need != null && !FORECAST_CALIBRATED.includes(selection.stationId);
  return (
    <section
      aria-label="앞으로 3일"
      className="rounded-card bg-card flex flex-col gap-3.5 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-15 text-ink-2/85 font-bold">② 앞으로 3일</span>
        <span className="flex-1" />
        {outlook && (
          <span className="text-14 text-brand bg-lime/35 rounded-row px-2.5 py-1 font-bold whitespace-nowrap">
            {outlook.basis}
          </span>
        )}
      </div>

      {selection.crop === "common" ? (
        <p className="text-16 text-ink-2/85 m-0">
          작물 공통은 앞으로 3일 전망을 아직 제공하지 않아요.
        </p>
      ) : !outlook ? (
        <p className="text-16 text-gray-ink m-0">
          <span className="bg-dormant-bg text-dormant-fg mr-2 rounded-full px-2.5 py-1 font-bold">
            자료 없음
          </span>
          이 날의 전망 자료가 아직 없어요.
        </p>
      ) : (
        <>
          {outlook.runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span id="run-label" className="text-14 text-ink-2/85">
                단기예보 발표
              </span>
              <div
                role="group"
                aria-labelledby="run-label"
                className="bg-fill/14 flex h-9.5 gap-0.5 rounded-full p-0.75"
              >
                {outlook.runs.map((r) =>
                  r.available ? (
                    <Link
                      key={r.hour}
                      href={withWaterQuery(selection, { run: r.hour })}
                      scroll={false}
                      aria-current={r.selected ? "true" : undefined}
                      className={`text-15 flex items-center rounded-full px-3.5 font-semibold ${
                        r.selected
                          ? "bg-card text-ink shadow-segment"
                          : "text-ink-2/85"
                      }`}
                    >
                      {r.hour}시
                    </Link>
                  ) : (
                    <span
                      key={r.hour}
                      title="아직 발표 전이거나 받지 못했어요"
                      className="text-15 text-ink-2/40 flex items-center px-3.5 font-semibold"
                    >
                      {r.hour}시
                    </span>
                  ),
                )}
              </div>
            </div>
          )}

          {outlook.need && (
            <div className="rounded-box bg-bg flex flex-col gap-1 px-3.5 py-3">
              <div className="text-17">
                <b>관수 필요 예상일</b> {outlook.need.text}
              </div>
              {outlook.need.range && (
                <div className="text-14 text-ink-2/80">
                  {outlook.need.range}
                </div>
              )}
              {outlook.advice && (
                <div className="text-17">
                  <b>권장 관수량</b> {outlook.advice}
                </div>
              )}
            </div>
          )}

          <Grid min="day">
            {outlook.days.map((d) => (
              <div
                key={d.iso}
                className={`bg-bg flex flex-col gap-2.5 rounded-[18px] p-3.5 ${
                  d.reference ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-18 font-bold">{d.rel}</span>
                  <span className="text-15 text-ink-2/85">{d.date}</span>
                  <span className="flex-1" />
                  <span className="text-12 text-ink-2/75 font-semibold">
                    {d.kind}
                  </span>
                </div>
                <span
                  className={`text-15 self-start rounded-full px-2.75 py-1.25 font-bold whitespace-nowrap ${STATUS_BADGE[d.status]}`}
                >
                  {d.statusLabel}
                </span>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-x-2 gap-y-2.5">
                  <Cell label={d.etcLabel} abbr="ETc" value={d.etc} />
                  <Cell label={d.rainLabel} value={d.rain} />
                  <Cell label="부족한 물" value={d.dr} />
                </div>
              </div>
            ))}
          </Grid>
          {borrowed && (
            <p className="text-13 text-ink-2/75 m-0">
              이 지점의 예보 범위(빠르면·늦으면)는 춘천 값을 빌려 써서 아직 검증
              전이에요.
            </p>
          )}
          {outlook.days.some((d) => d.reference) && (
            <p className="text-13 text-ink-2/75 m-0">
              참고: 마지막 날은 예보가 덜 정확해 관수 필요 예상일에 넣지 않아요.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Cell({
  label,
  abbr,
  value,
}: {
  label: string;
  abbr?: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-px">
      <span className="text-13 text-ink-2/85">
        {label} {abbr && <span className="text-ink-2/60">{abbr}</span>}
      </span>
      <b className="text-17 tabular-nums">{value}</b>
    </div>
  );
}
