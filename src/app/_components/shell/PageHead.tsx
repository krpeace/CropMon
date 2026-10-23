import type { PageKey, PageMeta } from "@/services/shell";

import { Badge } from "../ui/Badge";
import { PAGE_INFO } from "./pages";

type Props = {
  page: Exclude<PageKey, "home">;
  /** 주소창을 읽기 전에는 null. 오른쪽 짧은 갱신 표시를 비워 둔다. */
  meta: PageMeta | null;
};

/** 쪽 제목, 회색 꼬리표, 오른쪽 짧은 갱신 표시, 이 메뉴가 답할 질문. */
export function PageHead({ page, meta }: Props) {
  const info = PAGE_INFO[page];
  return (
    <div className="flex flex-col gap-1.5 pt-1.5 pb-0.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-title leading-title tracking-title m-0 font-bold">
          {info.title}
        </h1>
        {info.chip && <Badge>{info.chip}</Badge>}
        <span className="flex-1" />
        {meta && <span className="text-14 text-ink-2/75">{meta.short}</span>}
      </div>
      <p className="text-18 leading-body text-ink-2/88 m-0 text-pretty">
        {info.question}
      </p>
    </div>
  );
}
