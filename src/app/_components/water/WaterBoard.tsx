import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { parseSelection, withSelection } from "@/domain/selection";
import {
  koreanDate,
  parseWaterQuery,
  withWaterQuery,
} from "@/domain/water-outlook";
import { getStation, STATION_ENTRIES } from "@/services/shell";
import { getWaterView, type WaterView } from "@/services/water";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
import { Grid } from "../ui/Grid";
import { Icon } from "../ui/Icon";
import { DayPicker } from "./DayPicker";
import { CommonNowCard, NowCard, SoilBubble } from "./NowCard";
import { OutlookCard } from "./OutlookCard";
import { SeasonCard } from "./SeasonCard";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 물 화면 (시안 그대로): 기준 날짜 → 재배 방식 → ① 지금 상태 · ② 앞으로 3일 → ③ 작기 돌아보기 → 자료 상자.
 * 값은 DB(데이터 계약 v1.3)에서 읽는다 (결정 0008·0009).
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
  const params = await searchParams;
  const selection = parseSelection(params, STATION_ENTRIES);
  const station = getStation(selection.stationId);
  if (!station) return <PageHead page="water" meta={null} />;
  await connection(); // 요청마다 DB를 읽는다 (미리 만들어 두지 않음)
  const today = koreanDate(new Date().toISOString());
  const query = parseWaterQuery(params, today);
  const view = await getWaterView(selection, station, query);
  const base = withWaterQuery(selection, {});

  return (
    <>
      <PageHead page="water" meta={view.meta} />
      {view.day && <DayNav view={view} base={base} selection={selection} />}
      {view.cultivation.length > 1 && (
        <Cultivation view={view} selection={selection} query={query} />
      )}

      {view.problem || !view.day ? (
        <section
          aria-label="지금 토양 상태"
          className="rounded-card bg-card text-17 flex flex-wrap items-center gap-2.5 p-5"
        >
          <span className="bg-dormant-bg text-dormant-fg text-15 rounded-full px-3 py-1.25 font-bold">
            자료 없음
          </span>
          <span className="text-ink-2/90">
            {view.problem ?? "이 날의 자료가 아직 없어요."}
          </span>
        </section>
      ) : (
        <Grid min="wide">
          <div className="flex flex-col gap-3">
            {view.commonNow ? (
              <CommonNowCard
                commonNow={view.commonNow}
                dayLabel={view.day.label}
                soils={view.soils}
                selection={selection}
                date={query.date}
              />
            ) : view.now ? (
              <NowCard now={view.now} dayLabel={view.day.label} />
            ) : (
              <section
                aria-label="지금 토양 상태"
                className="rounded-card bg-card text-17 p-5"
              >
                <span className="bg-dormant-bg text-dormant-fg text-15 mr-2 rounded-full px-3 py-1.25 font-bold">
                  자료 없음
                </span>
                이 날의 물수지 자료가 없어요.
              </section>
            )}
            <SoilBubble
              farmHref={withSelection("/my-farm", selection)}
              text={view.commonNow?.basisText}
            />
          </div>
          <OutlookCard outlook={view.outlook} selection={selection} />
        </Grid>
      )}

      {selection.crop !== "common" &&
        view.day &&
        view.rawMm != null &&
        view.tawMm != null && (
          <SeasonCard
            season={view.season}
            months={view.months}
            raw={view.rawMm}
            taw={view.tawMm}
            selected={view.day.date}
            crop={selection.crop}
            base={base}
            today={view.day.today}
          />
        )}

      <MetaBox meta={view.meta} />
    </>
  );
}

const ROUND_BTN =
  "bg-fill/12 flex size-12 flex-none items-center justify-center rounded-full";

function DayNav({
  view,
  base,
  selection,
}: {
  view: WaterView;
  base: string;
  selection: Parameters<typeof withWaterQuery>[0];
}) {
  const day = view.day!;
  const href = (d: string) =>
    withWaterQuery(selection, { date: d >= day.today ? null : d });
  return (
    <nav
      aria-label="기준 날짜"
      className="rounded-card bg-card flex items-center gap-2 p-1.5"
    >
      {day.prev ? (
        <Link
          href={href(day.prev)}
          scroll={false}
          aria-label="전날"
          className={ROUND_BTN}
        >
          <Icon
            name="chevron"
            size={20}
            strokeWidth={2.4}
            className="rotate-180"
          />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${ROUND_BTN} opacity-35`}>
          <Icon
            name="chevron"
            size={20}
            strokeWidth={2.4}
            className="rotate-180"
          />
        </span>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col items-center py-0.5">
        <span className="text-13 text-ink-2/80">기준 날짜 · 눌러서 고르기</span>
        <span className="text-19 font-bold">{day.label}</span>
        <DayPicker
          base={base}
          value={day.date}
          min={day.min}
          today={day.today}
        />
      </div>
      {!day.isToday && (
        <Link
          href={base}
          scroll={false}
          className="bg-brand text-16 flex h-12 flex-none items-center rounded-full px-4 font-bold text-white"
        >
          오늘로
        </Link>
      )}
      {day.next ? (
        <Link
          href={href(day.next)}
          scroll={false}
          aria-label="다음날"
          className={ROUND_BTN}
        >
          <Icon name="chevron" size={20} strokeWidth={2.4} />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${ROUND_BTN} opacity-35`}>
          <Icon name="chevron" size={20} strokeWidth={2.4} />
        </span>
      )}
    </nav>
  );
}

function Cultivation({
  view,
  selection,
  query,
}: {
  view: WaterView;
  selection: Parameters<typeof withWaterQuery>[0];
  query: { date: string | null };
}) {
  return (
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
            href={withWaterQuery(
              { ...selection, kc: c.isDefault ? undefined : c.setNo },
              { date: query.date },
            )}
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
  );
}
