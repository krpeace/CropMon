import type { PageMeta } from "@/services/shell";

/** 모든 화면 아래의 같은 세 줄: 자료 · 발표 · 갱신. 없으면 "자료 없음". */
export function MetaBox({ meta }: { meta: PageMeta }) {
  return (
    <section
      aria-label="자료 정보"
      className="rounded-box bg-fill/9 text-14 leading-body text-ink-2/88 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3.5"
    >
      <b className="text-ink font-bold">자료</b>
      <span>{meta.source}</span>
      <b className="text-ink font-bold">발표</b>
      <span>{meta.issue}</span>
      <b className="text-ink font-bold">갱신</b>
      <span>{meta.updated}</span>
    </section>
  );
}
