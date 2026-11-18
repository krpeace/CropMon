"use client";

// 작물·지역 고르기 판의 내용과 그 도우미. 데스크톱 팝오버(SiteHeader)와 휴대폰 맥락 바(MobileContextBar)가 함께 쓴다.
// 이슈 #155 에서 SiteHeader.tsx 안에 있던 것을 내용 그대로 옮겼다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  CROPS,
  CROP_LABEL,
  DEFAULT_SOIL,
  withSelection,
  type Crop,
  type Selection,
} from "@/domain/selection";
import { SOIL_WATER_LABEL, type SoilWaterStatus } from "@/domain/soil-water";
import { WATER_STATUS_LABEL, type WaterStatus } from "@/domain/water-status";
import { listRegionPicker, STATION_IDS } from "@/services/shell";
import type {
  AnyWaterStatus,
  StationStatuses,
} from "@/services/station-status";

import { Icon } from "../ui/Icon";
import { STATUS_DOT } from "../ui/status";

export function anyStatusLabel(st: AnyWaterStatus): string {
  return st in SOIL_WATER_LABEL
    ? SOIL_WATER_LABEL[st as SoilWaterStatus]
    : WATER_STATUS_LABEL[st as WaterStatus];
}

export function cropInfo(
  crop: Crop,
  statuses: StationStatuses | null,
  stationId: number = STATION_IDS[0],
) {
  if (crop === "common") {
    return {
      sub: "토양 물 상태",
      short: "토양 물",
      type: "작물 구분 없이 토양의 물 상태 보기",
      txt: "기준 증발산 ETo로 계산",
      badge: "",
    };
  }
  if (crop === "apple") {
    const dormant = statuses?.apple?.[stationId] === "dormant";
    return {
      sub: dormant ? "휴면기" : "생육기",
      short: dormant ? "휴면기" : "생육기",
      type: "과수 · 후지 기준 · 4월 1일 생육 시작",
      txt: dormant ? "" : "지금 생육기",
      badge: dormant ? "휴면기" : "",
    };
  }
  const dormant = statuses?.cabbage?.[stationId] === "dormant";
  return {
    sub: dormant ? "작기 아님" : "생육기",
    short: dormant ? "작기 아님" : "생육기",
    type: "봄배추 3월 20일 · 가을배추 8월 5일 정식",
    txt: dormant ? "" : "지금 생육기",
    badge: dormant ? "작기 아님" : "",
  };
}

export function RegionPickerBody({
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
  const isPending = statuses === null;
  const isFailed = Boolean(statuses?.failed);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const crop: Crop = selection?.crop ?? CROPS[0];
  const soil = selection?.soil ?? DEFAULT_SOIL;
  const selectedId = selection?.stationId ?? STATION_IDS[0];
  const { sections } = listRegionPicker(crop, statuses, query, soil);
  const flatItems = sections.flatMap((s) => s.items);

  // 휴대폰에서는 검색칸에 바로 포커스하지 않는다: 키보드가 올라와 대표 지점 목록을 가린다.
  useEffect(() => {
    if (window.innerWidth >= 1024) inputRef.current?.focus();
  }, []);

  const selectStation = (stationId: number) => {
    router.push(
      withSelection(pathname, {
        stationId,
        crop,
        kc: selection?.kc,
        soil: selection?.soil,
      }),
      { scroll: false },
    );
    onClose();
  };

  let flatCursor = -1;

  return (
    <>
      <div className="border-ink-2/12 border-b-(length:--hairline) p-3 pb-2.5">
        <div className="rounded-input bg-fill/12 focus-within:bg-card focus-within:shadow-focus fh-44 flex items-center gap-2 px-3">
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
              className="text-13 text-ink-2/75 hit-44 cursor-pointer px-1.5 py-1 font-semibold"
            >
              지우기
            </button>
          )}
        </div>
      </div>

      {isFailed && (
        <div className="border-ink-2/12 bg-tile text-12 text-ink-2/95 border-b-(length:--hairline) px-3.5 py-2 font-medium">
          판정 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.
        </div>
      )}

      <div
        role="listbox"
        aria-label="관측 지점 목록"
        className="flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
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
                    className={`rounded-input fh-44 flex w-full cursor-pointer items-center justify-between gap-2.5 px-2.5 py-2 text-left ${
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
                          isPending
                            ? "bg-fill/30 motion-safe:animate-pulse"
                            : item.status
                              ? STATUS_DOT[item.status]
                              : "bg-fill/30"
                        }`}
                      />
                      <span className="text-16 font-semibold">{item.name}</span>
                      <span className="text-13 text-ink-2/60">{item.id}</span>
                      {item.isRepresentative && (
                        <span className="fz-cap bg-emerald/14 text-12 text-brand-ink rounded-full px-1.75 py-0.5 font-bold">
                          대표
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-13 text-ink-2/75">
                        {isFailed
                          ? item.sido
                          : `${item.sido} · ${
                              isPending
                                ? "판정 불러오는 중"
                                : item.status
                                  ? anyStatusLabel(item.status)
                                  : "자료 없음"
                            }`}
                      </span>
                      {selected && (
                        <Icon
                          name="check"
                          size={18}
                          strokeWidth={2.5}
                          className="text-brand-ink"
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

      <div className="border-ink-2/12 bg-tile/80 text-12 text-ink-2/75 border-t-(length:--hairline) px-3.5 py-2">
        기상청 ASOS 지점 · 대표 10곳 밖은 물 계산 준비 중
      </div>
    </>
  );
}

export function CropPickerBody({
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
  const currentCrop = selection?.crop ?? CROPS[0];
  const stationId = selection?.stationId ?? STATION_IDS[0];

  return (
    <>
      <div
        role="listbox"
        aria-label="작물 목록"
        className="flex flex-col gap-0.5"
      >
        {CROPS.map((c) => {
          const selected = c === currentCrop;
          const info = cropInfo(c, statuses, stationId);
          return (
            <Link
              key={c}
              href={withSelection(pathname, {
                stationId,
                crop: c,
                soil: c === "common" ? selection?.soil : undefined,
              })}
              scroll={false}
              onClick={onClose}
              aria-current={selected ? "true" : undefined}
              className={`rounded-input flex items-center justify-between gap-2 px-3 py-2.5 text-left ${
                selected ? "bg-emerald/14" : "hover:bg-fill/12"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-17 text-ink font-bold">
                  {CROP_LABEL[c]}
                </span>
                <span className="text-14 text-ink-2/85">{info.type}</span>
                {info.txt && (
                  <span className="text-14 text-ink font-semibold">
                    {info.txt}
                  </span>
                )}
                {info.badge && (
                  <span className="fz-cap bg-dormant-bg text-dormant-fg text-13 mt-0.5 self-start rounded-full px-2.25 py-0.5 font-bold whitespace-nowrap">
                    {info.badge}
                  </span>
                )}
              </div>
              {selected && (
                <Icon
                  name="check"
                  size={18}
                  strokeWidth={2.5}
                  className="text-brand-ink shrink-0"
                />
              )}
            </Link>
          );
        })}
      </div>
      <div className="border-ink-2/12 text-13 text-ink-2/85 mt-1 border-t-(length:--hairline) px-3 pt-2.5 pb-1.5">
        한 번 고르면 모든 메뉴에 적용돼요
      </div>
    </>
  );
}
