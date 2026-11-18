import type { Metadata } from "next";
import { Suspense } from "react";

import { parseSelection } from "@/domain/selection";
import { STATION_ENTRIES } from "@/services/shell";

import { MoreList } from "../_components/shell/MoreList";

export const metadata: Metadata = { title: "더보기" };

export default function Page(props: PageProps<"/more">) {
  return (
    <Suspense fallback={<MoreScreen selection={null} />}>
      <ResolvedMore searchParams={props.searchParams} />
    </Suspense>
  );
}

/** 주소창(searchParams)을 읽는 부분은 <Suspense> 안에 둔다 (cacheComponents 규칙). */
async function ResolvedMore({
  searchParams,
}: {
  searchParams: PageProps<"/more">["searchParams"];
}) {
  const selection = parseSelection(await searchParams, STATION_ENTRIES);
  return <MoreScreen selection={selection} />;
}

/** 더보기: 제목 + 서비스 메뉴 목록. 지역·작물 줄과 자료 상자는 없다. */
function MoreScreen({
  selection,
}: {
  selection: ReturnType<typeof parseSelection> | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title leading-title tracking-title m-0 pt-1.5 font-bold">
        더보기
      </h1>
      <MoreList selection={selection} />
    </div>
  );
}
