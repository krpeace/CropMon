"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  CROPS,
  CROP_LABEL,
  parseSelection,
  withSelection,
  type Selection,
} from "@/domain/selection";
import { listStationChips, STATION_IDS } from "@/services/shell";

import { Icon } from "../ui/Icon";
import { STATUS_DOT } from "../ui/status";
import { TABS } from "./pages";
import { useSheet } from "./sheet-context";

/** 주소창의 지역·작물을 읽는 헤더. layout 에서 <Suspense> 안에 둔다. */
export function SiteHeader() {
  const params = useSearchParams();
  return <SiteHeaderView selection={parseSelection(params, STATION_IDS)} />;
}

/** 주소창을 읽기 전(첫 화면)에 보이는 헤더. 아무 지역도 고르지 않은 모양. */
export function SiteHeaderFallback() {
  return <SiteHeaderView selection={null} />;
}

function SiteHeaderView({ selection }: { selection: Selection | null }) {
  const pathname = usePathname();
  const { open } = useSheet();

  return (
    <header className="glass border-ink-2/15 bg-card/88 sticky top-0 z-10 border-b-(length:--hairline)">
      <div className="mx-auto flex h-19 max-w-(--page-max) items-center gap-7 px-(--page-gutter)">
        <Link href={withSelection("/", selection)} className="flex-none">
          <Image
            src="/brand/logo-horizontal.png"
            alt="CropMon 작물재배의 든든한 감시자"
            width={475}
            height={204}
            priority
            className="block h-15 w-auto"
          />
        </Link>
        <nav
          aria-label="메뉴"
          className="flex min-w-0 flex-1 [scrollbar-width:none] justify-center-safe gap-1 overflow-x-auto"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.key}
                href={withSelection(tab.href, selection)}
                aria-current={active ? "page" : undefined}
                className={`text-17 flex h-11 items-center gap-1.75 rounded-full px-4.5 font-semibold whitespace-nowrap ${
                  active ? "bg-emerald/16 text-brand" : "text-ink-2/80"
                }`}
              >
                <Icon name={tab.key} size={20} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => open("login")}
          className="bg-fill/12 text-16 text-ink-2/90 flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full pr-2.5 pl-4.5 font-semibold"
        >
          로그인
          <span className="bg-lime/50 text-13 text-brand rounded-full px-2.25 py-1 font-bold">
            곧 열려요
          </span>
        </button>
      </div>
      <SelectionBar pathname={pathname} selection={selection} />
    </header>
  );
}

function SelectionBar({
  pathname,
  selection,
}: {
  pathname: string;
  selection: Selection | null;
}) {
  const chips = listStationChips(selection?.crop ?? CROPS[0]);

  return (
    <div className="border-ink-2/12 bg-bg/70 border-t-(length:--hairline)">
      <div className="mx-auto flex max-w-(--page-max) flex-wrap items-center gap-3 px-(--page-gutter) py-2.5">
        <span id="region-label" className="text-15 text-ink-2/85 font-semibold">
          지역
        </span>
        <div
          role="group"
          aria-labelledby="region-label"
          className="flex flex-wrap gap-1.5"
        >
          {chips.map((chip) => {
            const selected = chip.id === selection?.stationId;
            return (
              <Link
                key={chip.id}
                href={withSelection(pathname, {
                  stationId: chip.id,
                  crop: selection?.crop ?? CROPS[0],
                })}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`text-15 shadow-hairline flex h-9.5 items-center gap-1.5 rounded-full px-3.5 font-semibold ${
                  selected ? "bg-brand text-white" : "bg-card text-ink"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${STATUS_DOT[chip.status]}`}
                />
                {chip.name}
              </Link>
            );
          })}
        </div>
        <span aria-hidden="true" className="bg-ink-2/20 mx-1.5 h-6 w-px" />
        <span id="crop-label" className="text-15 text-ink-2/85 font-semibold">
          작물
        </span>
        <div
          role="group"
          aria-labelledby="crop-label"
          className="bg-fill/14 flex h-10 gap-0.5 rounded-full p-0.75"
        >
          {CROPS.map((crop) => {
            const selected = crop === selection?.crop;
            return (
              <Link
                key={crop}
                href={withSelection(pathname, {
                  stationId: selection?.stationId ?? STATION_IDS[0],
                  crop,
                })}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`text-15 flex items-center rounded-full px-4 font-semibold ${
                  selected ? "bg-card text-ink shadow-segment" : "text-ink-2/85"
                }`}
              >
                {CROP_LABEL[crop]}
              </Link>
            );
          })}
        </div>
        <span className="flex-1" />
        <span className="text-13 text-ink-2/75">
          점 색은 오늘 물 판정 · 한 번 고르면 모든 메뉴에 적용돼요
        </span>
      </div>
    </div>
  );
}
