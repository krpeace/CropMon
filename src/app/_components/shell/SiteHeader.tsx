"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  CROPS,
  CROP_LABEL,
  DEFAULT_SOIL,
  parseSelection,
  withSelection,
  type Selection,
} from "@/domain/selection";
import { MORE_HREF } from "@/domain/menus";
import { SOIL_WATER_LABEL, soilLegendStatuses } from "@/domain/soil-water";
import { WATER_STATUS_LABEL } from "@/domain/water-status";
import {
  getStation,
  inactiveStationNotice,
  listStationChips,
  STATION_ENTRIES,
} from "@/services/shell";
import type {
  AnyWaterStatus,
  StationStatuses,
} from "@/services/station-status";

import { Icon } from "../ui/Icon";
import { STATUS_DOT } from "../ui/status";
import { useMenus } from "./menu-store";
import { MobileContextBar } from "./MobileContextBar";
import { MENU_ICON } from "./pages";
import { TabBar } from "./TabBar";
import { useAutoFold } from "./use-auto-fold";
import { ThemeToggle } from "./ThemeToggle";
import {
  anyStatusLabel,
  CropPickerBody,
  cropInfo,
  RegionPickerBody,
} from "./pickers";
import { useSheet } from "./sheet-context";

/**
 * 주소창의 지역·작물을 읽는 헤더. layout 에서 <Suspense> 안에 둔다.
 * statuses: 지점별 오늘 물 판정 (서버에서 DB 로 읽어 넘김, 결정 0010).
 */
export function SiteHeader({ statuses }: { statuses: StationStatuses | null }) {
  const params = useSearchParams();
  const notice = inactiveStationNotice(params.get("from"));
  return (
    <SiteHeaderView
      selection={parseSelection(params, STATION_ENTRIES)}
      statuses={statuses}
      notice={notice}
    />
  );
}

/** 주소창·판정을 읽기 전(첫 화면)에 보이는 헤더. 아무 지역도 고르지 않은 모양. */
export function SiteHeaderFallback() {
  return <SiteHeaderView selection={null} statuses={null} notice={null} />;
}

function SiteHeaderView({
  selection,
  statuses,
  notice,
}: {
  selection: Selection | null;
  statuses: StationStatuses | null;
  notice: string | null;
}) {
  const pathname = usePathname();
  const { open, sheet, holds } = useSheet();
  const { desktop } = useMenus();
  const isFailed = Boolean(statuses?.failed);
  // 휴대폰 오토 하이드 (이슈 #159): 시트(가운데 창 · 아래 시트)가 열려 있는 동안은 상태를 안 바꾼다.
  const { folded, unfold } = useAutoFold(sheet !== null || holds > 0);

  return (
    <>
      {/* 휴대폰은 높이 52 의 "자리"(sticky, pointer-events 없음)이고 배경 · 흐림 · 선은 안쪽 바(MobileContextBar)가 갖는다 —
          접힐 때 문서 흐름 높이가 안 바뀌어 내용이 튀지 않는다 (결정 0051). 데스크톱 헤더는 그대로. */}
      <header className="desktop:glass desktop:bg-card/88 desktop:border-b-(length:--hairline) border-ink-2/15 max-desktop:pointer-events-none sticky top-0 z-20">
        {(notice || isFailed) && (
          <div
            role="status"
            aria-live="polite"
            className="border-ink-2/12 bg-tile text-13 desktop:text-14 text-ink-2/95 pointer-events-auto flex flex-col gap-1 border-b-(length:--hairline) px-(--page-gutter) py-2 text-center font-medium"
          >
            {notice && <div>{notice}</div>}
            {isFailed && (
              <div>
                판정 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.
              </div>
            )}
          </div>
        )}
        {/* 휴대폰(폭 1024 미만): 한 줄 맥락 바 (이슈 #155). 아래 머리 줄과 선택 바는 휴대폰에서 숨는다. */}
        <MobileContextBar
          pathname={pathname}
          selection={selection}
          statuses={statuses}
          folded={folded}
          onUnfold={unfold}
        />
        <div className="fz-fixed max-desktop:hidden desktop:gap-7 mx-auto flex h-19 max-w-(--page-max) items-center gap-2.5 px-(--page-gutter)">
          <Link
            href={withSelection("/", selection)}
            className="bg-plate rounded-row flex-none dark:px-2 dark:py-0.5"
          >
            <Image
              src="/brand/logo-horizontal.png"
              alt="CropMon 작물재배의 든든한 감시자"
              width={475}
              height={204}
              priority
              className="desktop:h-15 block h-11 w-auto"
            />
          </Link>
          <span className="desktop:hidden flex-1" />
          <nav
            aria-label="메뉴"
            className="desktop:flex menu-icon:gap-0.5 hidden min-w-0 flex-1 [scrollbar-width:none] justify-center-safe gap-0 overflow-x-auto"
          >
            {desktop.map((menu) => {
              const active = pathname === menu.href;
              return (
                <Link
                  key={menu.id}
                  href={withSelection(menu.href, selection)}
                  aria-current={active ? "page" : undefined}
                  className={`text-17 menu-icon:gap-1.5 menu-icon:px-3.75 flex h-11 flex-none items-center rounded-full px-2.5 font-semibold whitespace-nowrap ${
                    active ? "bg-emerald/16 text-brand-ink" : "text-ink-2/80"
                  }`}
                >
                  <Icon
                    name={MENU_ICON[menu.id]}
                    size={20}
                    className="menu-icon:block hidden"
                  />
                  {menu.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => open("login")}
            className="bg-fill/12 text-16 text-ink-2/90 desktop:pr-2.5 flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full px-4 font-semibold"
          >
            로그인
            <span className="bg-lime/50 text-13 text-brand-ink desktop:inline hidden rounded-full px-2.25 py-1 font-bold">
              곧 열려요
            </span>
          </button>
        </div>
        {pathname !== MORE_HREF && (
          <div className="max-desktop:hidden">
            <SelectionBar
              pathname={pathname}
              selection={selection}
              statuses={statuses}
            />
          </div>
        )}
      </header>
      <TabBar
        pathname={pathname}
        selection={selection}
        folded={folded}
        onReveal={unfold}
      />
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
  const isPending = statuses === null;
  const isFailed = Boolean(statuses?.failed);
  const isSelectionPending = selection === null;
  const crop = selection?.crop ?? CROPS[0];
  const soil = selection?.soil ?? DEFAULT_SOIL;
  const chips = listStationChips(crop, statuses, soil);
  const station = selection ? getStation(selection.stationId) : null;
  const selectedStatus: AnyWaterStatus | null = station
    ? crop === "common"
      ? (statuses?.soil?.[soil]?.[station.id] ?? null)
      : (statuses?.[crop]?.[station.id] ?? null)
    : null;
  const isNonRepSelected = Boolean(station && !station.isRepresentative);

  const { popover, setPopover } = useSheet();
  const [anchor, setAnchor] = useState<"wide" | "compact">("wide");
  // 휴대폰(폭 1024 미만)의 작물·지역 고르기 판은 맥락 바(MobileContextBar)가 맡는다 (이슈 #155).
  const groupRef = useRef<HTMLDivElement>(null);
  const cropGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popover === "region" &&
        groupRef.current &&
        !groupRef.current.contains(target)
      ) {
        setPopover(null);
      }
      if (
        popover === "crop" &&
        cropGroupRef.current &&
        !cropGroupRef.current.contains(target)
      ) {
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

  const info = cropInfo(crop, statuses, selection?.stationId);
  const isWinterNow =
    crop === "common" &&
    Object.values(statuses?.soil?.[soil] ?? {}).some((v) => v === "winter");
  const legendItems: { status: AnyWaterStatus; label: string }[] =
    crop === "common"
      ? soilLegendStatuses(isWinterNow).map((st) => ({
          status: st,
          label: SOIL_WATER_LABEL[st],
        }))
      : (["need", "caution", "normal", "wet"] as const).map((st) => ({
          status: st,
          label: WATER_STATUS_LABEL[st],
        }));

  return (
    <div className="fz-fixed border-ink-2/12 bg-bg/70 border-t-(length:--hairline)">
      <div className="desktop:flex-wrap desktop:gap-3 mx-auto flex max-w-(--page-max) flex-nowrap items-center gap-2 px-(--page-gutter) py-2.5">
        <div
          ref={cropGroupRef}
          role="group"
          aria-label="작물"
          className="desktop:flex-initial desktop:basis-auto desktop:flex-wrap relative flex min-w-0 flex-1 basis-0 items-center gap-1.5"
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={popover === "crop"}
            onClick={() => setPopover(popover === "crop" ? null : "crop")}
            className="bg-card text-17 text-ink shadow-hairline desktop:flex-none flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-bold whitespace-nowrap"
          >
            <Icon
              name="crop"
              size={20}
              strokeWidth={2}
              className="text-brand-ink shrink-0"
            />
            {/* 휴대폰: 이름과 회색 보조 글자를 "한 줄 높이 칸"에 담는다. 보조 글자가 다 안 들어가면
                다음 줄로 넘어가 칸 밖(overflow-hidden)이 되어 통째로 안 보인다 — 반쪽 글자가 남지 않는다.
                데스크톱은 칸을 없애(contents) 지금 모양 그대로. */}
            {isSelectionPending ? (
              <>
                <span className="sr-only">작물 불러오는 중</span>
                <span
                  aria-hidden="true"
                  className="desktop:contents flex h-6 min-w-0 flex-wrap items-center gap-x-1.5 overflow-hidden"
                >
                  <span className="bg-fill/25 my-auto h-5 w-14 shrink-0 rounded-full motion-safe:animate-pulse" />
                  <span className="bg-fill/15 desktop:hidden my-auto h-4 w-12 shrink-0 rounded-full motion-safe:animate-pulse" />
                </span>
                <span
                  aria-hidden="true"
                  className="text-14 text-ink-2/85 desktop:inline hidden font-medium"
                >
                  ·{" "}
                  <span className="bg-fill/15 inline-block h-4 w-16 rounded-full align-middle motion-safe:animate-pulse" />
                </span>
              </>
            ) : (
              <>
                <span className="desktop:contents flex h-6 min-w-0 flex-wrap gap-x-1.5 overflow-hidden">
                  <span className="max-desktop:leading-6 shrink-0">
                    {CROP_LABEL[crop]}
                  </span>
                  <span
                    data-testid="crop-sub"
                    className="text-14 text-ink-2/85 desktop:hidden max-desktop:leading-6 font-medium whitespace-nowrap"
                  >
                    {info.short}
                  </span>
                </span>
                <span className="text-14 text-ink-2/85 desktop:inline hidden font-medium">
                  · {info.sub}
                </span>
              </>
            )}
            <Icon
              name="chevronDown"
              size={18}
              strokeWidth={2.2}
              className="text-ink-2/70 ml-0.5 shrink-0"
            />
          </button>
          {popover === "crop" && (
            <div className="fz-follow rounded-panel bg-card shadow-popover absolute top-[calc(100%+8px)] left-0 z-30 flex w-80 flex-col overflow-hidden p-1.5">
              <div className="text-13 text-ink-2/85 px-3 pt-2 pb-1 font-bold">
                작물 고르기
              </div>
              <CropPickerBody
                pathname={pathname}
                selection={selection}
                statuses={statuses}
                onClose={() => setPopover(null)}
              />
            </div>
          )}
        </div>
        <span
          aria-hidden="true"
          className="bg-ink-2/20 wide:inline mx-0.5 hidden h-6 w-px"
        />
        <span
          id="region-label"
          className="text-15 text-ink-2/85 sr-only font-semibold"
        >
          지역
        </span>
        <div
          ref={groupRef}
          role="group"
          aria-label="지역"
          className="desktop:flex-initial desktop:basis-auto desktop:flex-wrap flex min-w-0 flex-1 basis-0 items-center gap-1.5"
        >
          {/* 넓은 화면(>= 1280px): 대표 10개 칩 + 지역 고르기 버튼 */}
          <div
            aria-busy={isPending ? "true" : undefined}
            className="wide:flex hidden flex-wrap items-center gap-1.5"
          >
            {isPending && <span className="sr-only">판정 불러오는 중</span>}
            {chips.map((chip) => {
              const selected = chip.id === selection?.stationId;
              return (
                <Link
                  key={chip.id}
                  href={withSelection(pathname, {
                    stationId: chip.id,
                    crop,
                    kc: selection?.kc,
                    soil: selection?.soil,
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
                      isPending
                        ? "bg-fill/30 motion-safe:animate-pulse"
                        : chip.status
                          ? STATUS_DOT[chip.status]
                          : "bg-fill/30"
                    }`}
                  />
                  {chip.name}
                  {/* 색만으로 말하지 않는다: 화면 읽기 도구에는 판정 이름을 읽어 준다 (불러오는 중이거나 실패 시에는 묶음/상단에서 안내) */}
                  {!isPending && !isFailed && (
                    <span className="sr-only">
                      {chip.status ? anyStatusLabel(chip.status) : "자료 없음"}
                    </span>
                  )}
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
                          isPending
                            ? "bg-white/55 motion-safe:animate-pulse dark:bg-white/10"
                            : selectedStatus
                              ? STATUS_DOT[selectedStatus]
                              : "bg-white/55 dark:bg-white/10"
                        }`}
                      />
                      <span>{station.name}</span>
                      <span className="text-12 font-medium opacity-75">
                        {station.id}
                      </span>
                      <span className="sr-only">
                        {isFailed
                          ? "불러오지 못함"
                          : isPending
                            ? "판정 불러오는 중"
                            : selectedStatus
                              ? anyStatusLabel(selectedStatus)
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
          <div className="wide:hidden desktop:flex-none relative flex min-w-0 flex-1">
            {selection && station ? (
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={popover === "region" && anchor === "compact"}
                onClick={() => {
                  setAnchor("compact");
                  setPopover(popover === "region" ? null : "region");
                }}
                className="bg-card text-15 text-ink shadow-hairline desktop:flex-none flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap"
              >
                <Icon
                  name="pin"
                  size={16}
                  strokeWidth={2}
                  className="text-ink-2/75 desktop:hidden shrink-0"
                />
                <span className="text-ink-2/75 desktop:not-sr-only sr-only font-medium">
                  지역 ·
                </span>
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${
                    isPending
                      ? "bg-fill/30 motion-safe:animate-pulse"
                      : selectedStatus
                        ? STATUS_DOT[selectedStatus]
                        : "bg-fill/30"
                  }`}
                />
                {/* 지점 이름은 넘치면 "…", 지점번호는 다 들어가면 보이고 안 들어가면 통째로 숨긴다 (위 작물 버튼과 같은 방식). 데스크톱은 칸을 없애(contents) 지금 모양 그대로 */}
                <span className="desktop:contents flex h-6 min-w-0 flex-wrap gap-x-1.5 overflow-hidden">
                  <span className="max-desktop:leading-6 min-w-0 truncate">
                    {station.name}
                  </span>
                  <span
                    data-testid="station-id"
                    className="text-13 text-ink-2/60 max-desktop:leading-6 font-medium whitespace-nowrap"
                  >
                    {station.id}
                  </span>
                </span>
                <span className="sr-only">
                  {isFailed
                    ? "불러오지 못함"
                    : isPending
                      ? "판정 불러오는 중"
                      : selectedStatus
                        ? anyStatusLabel(selectedStatus)
                        : "자료 없음"}
                </span>
                <Icon
                  name="chevronDown"
                  size={16}
                  strokeWidth={2.2}
                  className="text-ink-2/75 shrink-0"
                />
              </button>
            ) : (
              <span className="bg-card text-15 text-ink shadow-hairline desktop:flex-none flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap">
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
        <span className="desktop:block hidden flex-1" />
        <div
          aria-label={
            isSelectionPending
              ? "오늘 물 관리"
              : `오늘 ${CROP_LABEL[crop]} 물 관리`
          }
          className="desktop:flex hidden flex-col items-start gap-0.5"
        >
          <span className="text-13 text-ink-2/85 flex items-center gap-1 leading-none font-bold whitespace-nowrap">
            {isSelectionPending ? (
              <>
                <span>오늘</span>
                <span
                  aria-hidden="true"
                  className="bg-fill/25 inline-block h-3.5 w-12 rounded-full align-middle motion-safe:animate-pulse"
                />
                <span>물 관리</span>
              </>
            ) : (
              `오늘 ${CROP_LABEL[crop]} 물 관리`
            )}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {isSelectionPending
              ? [48, 36, 36, 44].map((width, idx) => (
                  <span
                    key={idx}
                    aria-hidden="true"
                    className="flex items-center gap-1 py-0.5"
                  >
                    <span className="bg-fill/25 size-2 rounded-full motion-safe:animate-pulse" />
                    <span
                      className="bg-fill/15 inline-block h-3 rounded-full motion-safe:animate-pulse"
                      style={{ width }}
                    />
                  </span>
                ))
              : legendItems.map((lg) => (
                  <span
                    key={lg.status}
                    className="text-12 text-ink-2/85 flex items-center gap-1 whitespace-nowrap"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 rounded-full ${STATUS_DOT[lg.status]}`}
                    />
                    {lg.label}
                  </span>
                ))}
          </div>
        </div>
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
    <div className="fz-follow rounded-panel bg-card shadow-popover absolute top-[calc(100%+8px)] left-0 z-30 flex max-h-115 w-95 flex-col overflow-hidden">
      <RegionPickerBody
        pathname={pathname}
        selection={selection}
        statuses={statuses}
        onClose={onClose}
      />
    </div>
  );
}
