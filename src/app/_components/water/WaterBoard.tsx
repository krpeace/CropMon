import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { parseSelection, withSelection } from "@/domain/selection";
import { getStation, STATION_IDS } from "@/services/shell";
import { getWaterView } from "@/services/water";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
import { StatusBadge } from "../ui/StatusBadge";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 물 화면: 제목 → 재배 방식 → 지금 상태·관수 필요 예상일 → 자료 상자.
 * 값은 DB(데이터 계약 v1.3)에서 읽는다. 본문 모양(카드·3일 표·작기 그래프)은 시안을 받아 다음 PR에서 만든다.
 * 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙).
 */
export function WaterBoard({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageHead page="water" meta={null} />}>
      <ResolvedWaterBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function ResolvedWaterBoard({ searchParams }: Props) {
  const selection = parseSelection(await searchParams, STATION_IDS);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page="water" meta={null} />;
  await connection(); // 요청마다 DB를 읽는다 (미리 만들어 두지 않음)
  const view = await getWaterView(selection, station);

  return (
    <>
      <PageHead page="water" meta={view.meta} />

      {view.cultivation.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span id="kc-label" className="text-15 text-ink-2/85 font-semibold">
            재배 방식
          </span>
          <div
            role="group"
            aria-labelledby="kc-label"
            className="flex flex-wrap gap-1.5"
          >
            {view.cultivation.map((c) => (
              <Link
                key={c.setNo}
                href={withSelection("/water", { ...selection, kc: c.setNo })}
                scroll={false}
                title={c.note ?? undefined}
                aria-current={c.selected ? "true" : undefined}
                className={`text-15 shadow-hairline flex h-9.5 items-center rounded-full px-3.5 font-semibold ${
                  c.selected ? "bg-brand text-white" : "bg-card text-ink"
                }`}
              >
                {c.name}
                {c.isDefault && " (기본)"}
              </Link>
            ))}
          </div>
        </div>
      )}

      <section
        aria-label="지금 토양 상태"
        className="rounded-box bg-card shadow-hairline text-15 leading-body flex flex-col gap-2 px-4 py-3.5"
      >
        {view.problem || !view.now ? (
          <p className="m-0">
            <b>자료 없음</b>
            {view.problem && ` — ${view.problem}`}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge badge={view.now.badge} />
              <span>{view.now.numbers}</span>
              <span className="text-ink-2/75">({view.now.date} 기준)</span>
            </div>
            <p className="m-0">
              <b>관수 필요 예상일</b>{" "}
              {view.outlook ? view.outlook.need.text : "자료 없음"}
              {view.outlook?.need.range && (
                <span className="text-ink-2/75">
                  {" "}
                  ({view.outlook.need.range})
                </span>
              )}
            </p>
            {view.outlook?.advice && (
              <p className="m-0">
                <b>권장 관수량</b> {view.outlook.advice}
              </p>
            )}
          </>
        )}
      </section>

      <MetaBox meta={view.meta} />
    </>
  );
}
