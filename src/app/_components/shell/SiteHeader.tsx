"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  CROPS,
  CROP_LABEL,
  parseSelection,
  withSelection,
  type Crop,
  type Selection,
} from "@/domain/selection";
import { WATER_STATUS_LABEL } from "@/domain/water-status";
import {
  getStation,
  listRegionPicker,
  listStationChips,
  STATION_ENTRIES,
  STATION_IDS,
} from "@/services/shell";
import type { StationStatuses } from "@/services/station-status";

import { Icon } from "../ui/Icon";
import { STATUS_DOT } from "../ui/status";
import { TABS } from "./pages";
import { useSheet } from "./sheet-context";

/**
 * 주소창의 지역·작물을 읽는 헤더. layout 에서 <Suspense> 안에 둔다.
 * statuses: 지점별 오늘 물 판정 (서버에서 DB 로 읽어 넘김, 결정 0010).
 */
export function SiteHeader({ statuses }: { statuses: StationStatuses | null }) {
  const params = useSearchParams();
  return (
    <SiteHeaderView
      selection={parseSelection(params, STATION_ENTRIES)}
      statuses={statuses}
    />
  );
}

/** 주소창·판정을 읽기 전(첫 화면)에 보이는 헤더. 아무 지역도 고르지 않은 모양. */
export function SiteHeaderFallback() {
  return <SiteHeaderView selection={null} statuses={null} />;
}

function SiteHeaderView({
  selection,
  statuses,
}: {
  selection: Selection | null;
  statuses: StationStatuses | null;
}) {
  const pathname = usePathname();
  const { sheet, open, close } = useSheet();

  return (
    <>
      <header className="glass border-ink-2/15 bg-card/88 sticky top-0 z-20 border-b-(length:--hairline)">
        <div className="desktop:gap-7 mx-auto flex h-19 max-w-(--page-max) items-center gap-2.5 px-(--page-gutter)">
          <Link href={withSelection("/", selection)} className="flex-none">
            <Image
              src="/brand/logo-horizontal.png"
              alt="CropMon 작물재배의 든든한 감시자"
              width={475}
              height={204}
              priority
              className="desktop:h-15 block h-11 w-auto"
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
            className="bg-fill/12 text-16 text-ink-2/90 desktop:pr-2.5 flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full px-4 font-semibold"
          >
            로그인
            <span className="bg-lime/50 text-13 text-brand desktop:inline hidden rounded-full px-2.25 py-1 font-bold">
              곧 열려요
            </span>
          </button>
        </div>
        <SelectionBar
          pathname={pathname}
          selection={selection}
          statuses={statuses}
        />
      </header>
      {sheet === "station" && (
        <StationSheet
          pathname={pathname}
          selection={selection}
          statuses={statuses}
          onClose={close}
        />
      )}
    </>
  );
}

function SelectionBar({
  pathname,
  selection,
  statuses,
}: {
  pathname: string;
  selection: Selection | null;
  statuses: StationStatuses | null;
}) {
  const crop = selection?.crop ?? CROPS[0];
  const chips = listStationChips(crop, statuses);
  const station = selection ? getStation(selection.stationId) : null;
  const selectedStatus = station
    ? (statuses?.[crop]?.[station.id] ?? null)
    : null;
  const isNonRepSelected = Boolean(station && !station.isRepresentative);

  const { open, popover, setPopover } = useSheet();
  const [anchor, setAnchor] = useState<"wide" | "compact">("wide");
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popover !== "region") return;
    const onMouseDown = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [popover, setPopover]);

  return (
    <div className="border-ink-2/12 bg-bg/70 border-t-(length:--hairline)">
      <div className="mx-auto flex max-w-(--page-max) flex-wrap items-center gap-3 px-(--page-gutter) py-2.5">
        <span
          id="region-label"
          className="text-15 text-ink-2/85 wide:inline hidden font-semibold"
        >
          지역
        </span>
        <div
          ref={groupRef}
          role="group"
          aria-label="지역"
          className="flex flex-wrap items-center gap-1.5"
        >
          {/* 넓은 화면(>= 1280px): 대표 10개 칩 + 지역 고르기 버튼 */}
          <div className="wide:flex hidden flex-wrap items-center gap-1.5">
            {chips.map((chip) => {
              const selected = chip.id === selection?.stationId;
              return (
                <Link
                  key={chip.id}
                  href={withSelection(pathname, {
                    stationId: chip.id,
                    crop,
                    kc: selection?.kc, // 지역만 바꾸면 재배 방식은 그대로
                  })}
                  scroll={false}
                  onClick={() => setPopover(null)}
                  aria-current={selected ? "true" : undefined}
                  className={`text-15 shadow-hairline flex h-9.5 items-center gap-1.5 rounded-full px-3.5 font-semibold ${
                    selected ? "bg-brand text-white" : "bg-card text-ink"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${
                      chip.status ? STATUS_DOT[chip.status] : "bg-fill/30"
                    }`}
                  />
                  {chip.name}
                  {/* 색만으로 말하지 않는다: 화면 읽기 도구에는 판정 이름을 읽어 준다 */}
                  <span className="sr-only">
                    {chip.status
                      ? WATER_STATUS_LABEL[chip.status]
                      : "자료 없음"}
                  </span>
                </Link>
              );
            })}
            <div className="relative">
              {selection ? (
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={popover === "region" && anchor === "wide"}
                  aria-current={isNonRepSelected ? "true" : undefined}
                  onClick={() => {
                    setAnchor("wide");
                    setPopover(popover === "region" ? null : "region");
                  }}
                  className={`text-15 flex h-9.5 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap ${
                    isNonRepSelected
                      ? "bg-brand text-white"
                      : "bg-fill/12 text-ink shadow-hairline"
                  }`}
                >
                  {isNonRepSelected && station ? (
                    <>
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${
                          selectedStatus
                            ? STATUS_DOT[selectedStatus]
                            : "bg-white/55"
                        }`}
                      />
                      <span>{station.name}</span>
                      <span className="text-12 font-medium opacity-75">
                        {station.id}
                      </span>
                      <span className="sr-only">
                        {selectedStatus
                          ? WATER_STATUS_LABEL[selectedStatus]
                          : "자료 없음"}
                      </span>
                    </>
                  ) : (
                    <span>지역 고르기</span>
                  )}
                  <Icon
                    name="chevronDown"
                    size={15}
                    strokeWidth={2.2}
                    className={
                      isNonRepSelected ? "text-white/80" : "text-ink-2/75"
                    }
                  />
                </button>
              ) : (
                <span className="bg-fill/12 text-15 text-ink shadow-hairline flex h-9.5 items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap">
                  <span>지역 고르기</span>
                  <Icon
                    name="chevronDown"
                    size={15}
                    strokeWidth={2.2}
                    className="text-ink-2/75"
                  />
                </span>
              )}
              {popover === "region" && anchor === "wide" && (
                <RegionPopover
                  pathname={pathname}
                  selection={selection}
                  statuses={statuses}
                  onClose={() => setPopover(null)}
                />
              )}
            </div>
          </div>

          {/* 좁은 화면(< 1280px): 단일 지역 버튼 */}
          <div className="wide:hidden relative flex">
            {selection && station ? (
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={popover === "region" && anchor === "compact"}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.innerWidth < 1024
                  ) {
                    setPopover(null);
                    open("station");
                  } else {
                    setAnchor("compact");
                    setPopover(popover === "region" ? null : "region");
                  }
                }}
                className="bg-card text-15 text-ink shadow-hairline flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap"
              >
                <span className="text-ink-2/75 font-medium">지역 ·</span>
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${
                    selectedStatus ? STATUS_DOT[selectedStatus] : "bg-fill/30"
                  }`}
                />
                <span>{station.name}</span>
                <span className="text-13 text-ink-2/60 font-medium">
                  {station.id}
                </span>
                <span className="sr-only">
                  {selectedStatus
                    ? WATER_STATUS_LABEL[selectedStatus]
                    : "자료 없음"}
                </span>
                <Icon
                  name="chevronDown"
                  size={16}
                  strokeWidth={2.2}
                  className="text-ink-2/75"
                />
              </button>
            ) : (
              <span className="bg-card text-15 text-ink shadow-hairline flex h-11 items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap">
                <span className="text-ink-2/75 font-medium">지역 고르기</span>
              </span>
            )}
            {popover === "region" && anchor === "compact" && (
              <RegionPopover
                pathname={pathname}
                selection={selection}
                statuses={statuses}
                onClose={() => setPopover(null)}
              />
            )}
          </div>
        </div>
        <span
          aria-hidden="true"
          className="bg-ink-2/20 wide:inline mx-1.5 hidden h-6 w-px"
        />
        <span
          id="crop-label"
          className="text-15 text-ink-2/85 wide:inline hidden font-semibold"
        >
          작물
        </span>
        <div
          role="group"
          aria-label="작물"
          className="bg-fill/14 flex h-10 gap-0.5 rounded-full p-0.75"
        >
          {CROPS.map((c) => {
            const selected = c === selection?.crop;
            return (
              <Link
                key={c}
                href={withSelection(pathname, {
                  stationId: selection?.stationId ?? STATION_IDS[0],
                  crop: c,
                })}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`text-15 flex items-center rounded-full px-4 font-semibold ${
                  selected ? "bg-card text-ink shadow-segment" : "text-ink-2/85"
                }`}
              >
                {CROP_LABEL[c]}
              </Link>
            );
          })}
        </div>
        <span className="flex-1" />
        <span className="text-13 text-ink-2/75 desktop:inline hidden">
          점 색은 오늘 물 판정 · 한 번 고르면 모든 메뉴에 적용돼요
        </span>
      </div>
    </div>
  );
}

function RegionPopover({
  pathname,
  selection,
  statuses,
  onClose,
}: {
  pathname: string;
  selection: Selection | null;
  statuses: StationStatuses | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-panel bg-card shadow-popover absolute top-[calc(100%+8px)] left-0 z-30 flex max-h-115 w-95 flex-col overflow-hidden">
      <RegionPickerBody
        pathname={pathname}
        selection={selection}
        statuses={statuses}
        onClose={onClose}
      />
    </div>
  );
}

function StationSheet({
  pathname,
  selection,
  statuses,
  onClose,
}: {
  pathname: string;
  selection: Selection | null;
  statuses: StationStatuses | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="bg-scrim/28 fixed inset-0 z-40 flex flex-col justify-end"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="지역 고르기"
        onClick={(e) => e.stopPropagation()}
        className="rounded-t-sheet bg-card shadow-panel flex max-h-[82vh] w-full flex-col overflow-hidden pt-2 pb-5"
      >
        <div className="bg-ink-2/30 mx-auto mt-1 mb-2.5 h-1.25 w-9 rounded-full" />
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-20 font-bold">지역 고르기</span>
          <button
            type="button"
            onClick={onClose}
            className="text-16 text-brand min-h-11 cursor-pointer px-2 font-semibold"
          >
            닫기
          </button>
        </div>
        <RegionPickerBody
          pathname={pathname}
          selection={selection}
          statuses={statuses}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function RegionPickerBody({
  pathname,
  selection,
  statuses,
  onClose,
}: {
  pathname: string;
  selection: Selection | null;
  statuses: StationStatuses | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const crop: Crop = selection?.crop ?? CROPS[0];
  const selectedId = selection?.stationId ?? STATION_IDS[0];
  const { sections } = listRegionPicker(crop, statuses, query);
  const flatItems = sections.flatMap((s) => s.items);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selectStation = (stationId: number) => {
    router.push(
      withSelection(pathname, {
        stationId,
        crop,
        kc: selection?.kc,
      }),
      { scroll: false },
    );
    onClose();
  };

  let flatCursor = -1;

  return (
    <>
      <div className="border-ink-2/12 border-b-(length:--hairline) p-3 pb-2.5">
        <div className="rounded-input bg-fill/12 focus-within:bg-card focus-within:shadow-focus flex h-11 items-center gap-2 px-3">
          <Icon name="search" size={18} className="text-ink-2/60 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            aria-label="지역 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = flatItems[activeIndex] ?? flatItems[0];
                if (pick) selectStation(pick.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="시·군 이름이나 지점번호 (예: 홍천, 212)"
            className="text-16 text-ink placeholder:text-ink-2/60 min-w-0 flex-1 bg-transparent font-sans outline-none"
          />
          {query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="text-13 text-ink-2/75 cursor-pointer px-1.5 py-1 font-semibold"
            >
              지우기
            </button>
          )}
        </div>
      </div>

      <div
        role="listbox"
        aria-label="관측 지점 목록"
        className="flex-1 overflow-y-auto px-2 py-1.5"
      >
        {sections.length === 0 ? (
          <div className="text-15 text-ink-2/75 px-3 py-7 text-center">
            <div className="text-ink mb-1 font-bold">
              일치하는 관측 지점이 없어요
            </div>
            <div className="text-13">
              시·군 이름(예: 홍천, 청송)이나 기상청 지점번호(예: 212)로
              찾아보세요.
            </div>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.label} className="mb-1">
              <div className="text-12 text-ink-2/75 flex items-center justify-between px-2.5 pt-2 pb-1 font-bold">
                <span>{section.label}</span>
              </div>
              {section.items.map((item) => {
                flatCursor += 1;
                const itemIndex = flatCursor;
                const selected = item.id === selectedId;
                const active = itemIndex === activeIndex;
                return (
                  <button
                    key={`${section.label}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onClick={() => selectStation(item.id)}
                    className={`rounded-input flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 px-2.5 py-2 text-left ${
                      selected
                        ? "bg-emerald/14"
                        : active
                          ? "bg-fill/12"
                          : "hover:bg-fill/12"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${
                          item.status ? STATUS_DOT[item.status] : "bg-fill/30"
                        }`}
                      />
                      <span className="text-16 font-semibold">{item.name}</span>
                      <span className="text-13 text-ink-2/60">{item.id}</span>
                      {item.isRepresentative && (
                        <span className="bg-emerald/14 text-12 text-brand rounded-full px-1.75 py-0.5 font-bold">
                          대표
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-13 text-ink-2/75">
                        {item.sido} ·{" "}
                        {item.status
                          ? WATER_STATUS_LABEL[item.status]
                          : "자료 없음"}
                      </span>
                      {selected && (
                        <Icon
                          name="check"
                          size={18}
                          strokeWidth={2.5}
                          className="text-brand"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-ink-2/12 bg-bg/80 text-12 text-ink-2/75 border-t-(length:--hairline) px-3.5 py-2">
        기상청 ASOS 지점 · 대표 10곳 밖은 물 계산 준비 중
      </div>
    </>
  );
}
