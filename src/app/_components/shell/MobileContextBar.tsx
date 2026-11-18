"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { screenContext } from "@/domain/menus";
import {
  CROPS,
  CROP_LABEL,
  DEFAULT_SOIL,
  withSelection,
  type Selection,
} from "@/domain/selection";
import { getStation } from "@/services/shell";
import type {
  AnyWaterStatus,
  StationStatuses,
} from "@/services/station-status";

import { Icon } from "../ui/Icon";
import { STATUS_DOT } from "../ui/status";
import { useCanGoBack } from "./nav-history";
import {
  anyStatusLabel,
  CropPickerBody,
  cropInfo,
  RegionPickerBody,
} from "./pickers";
import { SelectionPanel } from "./SelectionPanel";
import { useSheet } from "./sheet-context";

/**
 * 휴대폰(폭 1024 미만) 상단 맥락 바 (이슈 #155, 결정 0049, 디자인 규칙 v0.4.6 12절).
 * 한 줄 52: 왼쪽 도깨비(2단계 화면은 뒤로 화살표) · 가운데 맥락 · 오른쪽 "로그인".
 * 가운데는 화면마다 다르다 — 작물·지역 반반 캡슐이거나 제목 (`screenContext`, src/domain/menus.ts).
 * 글씨 크기는 100% 고정 구역(.fz-fixed). 데스크톱 머리말 · 선택 바는 그대로고 이 바는 데스크톱에서 숨는다.
 *
 * 캡슐 칸 안의 글자는 "한 줄 높이 칸"(overflow-hidden, 줄바꿈 허용)에 담는다:
 * 이름(작물 · 지역)은 줄어들지 않고(칸이 이름 폭 밑으로 줄지 않는다), 보조 글자(작기 · 지점 번호)가 안 들어가면
 * 다음 줄로 밀려 칸 밖이 되어 통째로 안 보인다 — 반쪽 글자가 남지 않는다.
 * 캡슐이 좁으면(폭 < 240px) ▾ 둘을 숨기고 칸 여백을 줄여 이름 · 점을 끝까지 남긴다 (컨테이너 쿼리, 결정 0049).
 * 칸 안쪽 여백은 시안(작물 좌 14 · 지역 좌우 10)보다 2~4px 줄여 글꼴이 달라도 여유를 남긴다.
 * 작물 칸 : 지역 칸 비율은 `--ctx-crop-grow`(tokens.css) 하나로 바뀐다.
 */
export function MobileContextBar({
  pathname,
  selection,
  statuses,
}: {
  pathname: string;
  selection: Selection | null;
  statuses: StationStatuses | null;
}) {
  const context = screenContext(pathname);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { sheet, open } = useSheet();
  const loginOpen = sheet === "login";

  // 작물·지역 고르기 판 (이번에는 지금처럼 바 아래로 펼쳐진다). 경로나 선택이 바뀌면(urlKey 가 달라지면) 닫힌 것으로 본다.
  const urlKey = [
    pathname,
    selection?.stationId,
    selection?.crop,
    selection?.kc,
    selection?.soil,
  ].join("|");
  const [panelState, setPanelState] = useState<{
    kind: "crop" | "region";
    key: string;
  } | null>(null);
  const panel = panelState?.key === urlKey ? panelState.kind : null;
  const closePanel = useCallback(() => setPanelState(null), []);
  const barRef = useRef<HTMLDivElement>(null);
  const cropButtonRef = useRef<HTMLButtonElement>(null);
  const regionButtonRef = useRef<HTMLButtonElement>(null);

  const isPending = statuses === null;
  const isFailed = Boolean(statuses?.failed);
  const isSelectionPending = selection === null;
  const crop = selection?.crop ?? CROPS[0];
  const soil = selection?.soil ?? DEFAULT_SOIL;
  const station = selection ? getStation(selection.stationId) : null;
  const selectedStatus: AnyWaterStatus | null = station
    ? crop === "common"
      ? (statuses?.soil?.[soil]?.[station.id] ?? null)
      : (statuses?.[crop]?.[station.id] ?? null)
    : null;
  const info = cropInfo(crop, statuses, selection?.stationId);

  const goBack = () => {
    // 앱 안에서 들어왔으면 이전 화면으로, 주소로 바로 들어왔으면 종합으로
    if (canGoBack) router.back();
    else router.push(withSelection("/", selection));
  };

  return (
    <div
      ref={barRef}
      data-testid="context-bar"
      className="fz-fixed desktop:hidden flex h-13 items-center gap-2 pr-3 pl-2.5"
    >
      {context.kind === "title" && context.back ? (
        <button
          type="button"
          aria-label="뒤로"
          onClick={goBack}
          className="bg-fill/12 text-ink flex size-11 flex-none cursor-pointer items-center justify-center rounded-full"
        >
          <Icon name="back" size={22} strokeWidth={2.4} />
        </button>
      ) : (
        <Link
          href={withSelection("/", selection)}
          aria-label="종합 (첫 화면)"
          className="flex h-11.5 w-11 flex-none items-center justify-center"
        >
          <span className="bg-plate flex rounded-full">
            <Image
              src="/brand/logo-emblem.png"
              alt=""
              width={412}
              height={383}
              className="h-11 w-auto max-w-none"
            />
          </span>
        </Link>
      )}

      {context.kind === "title" ? (
        <span
          data-testid="context-title"
          className="text-18 min-w-0 flex-1 truncate pl-1 font-bold"
        >
          {context.title}
        </span>
      ) : (
        <div
          data-testid="context-capsule"
          className="bg-card shadow-hairline @container flex h-11 min-w-0 flex-1 rounded-full"
        >
          <div
            role="group"
            aria-label="작물"
            style={{ flexGrow: "var(--ctx-crop-grow)" }}
            className="flex min-w-min basis-0"
          >
            <button
              ref={cropButtonRef}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={panel === "crop"}
              onClick={() =>
                setPanelState(
                  panel === "crop" ? null : { kind: "crop", key: urlKey },
                )
              }
              className="text-ink flex h-11 w-full min-w-0 cursor-pointer items-center gap-1 rounded-l-full pr-1.5 pl-3 text-left @max-[240px]:pr-1 @max-[240px]:pl-2"
            >
              {isSelectionPending ? (
                <>
                  <span className="sr-only">작물 불러오는 중</span>
                  <span
                    aria-hidden="true"
                    className="flex h-6 min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
                  >
                    <span className="bg-fill/25 h-5 w-14 shrink-0 rounded-full motion-safe:animate-pulse" />
                  </span>
                </>
              ) : (
                <span className="flex h-6 min-w-0 flex-1 flex-wrap items-center gap-x-1.25 overflow-hidden text-left">
                  <span
                    data-testid="crop-name"
                    className="text-17 shrink-0 leading-6 font-bold whitespace-nowrap"
                  >
                    {CROP_LABEL[crop]}
                  </span>
                  <span
                    data-testid="crop-sub"
                    className="text-14 text-ink-2/85 leading-6 font-medium whitespace-nowrap"
                  >
                    {info.short}
                  </span>
                </span>
              )}
              <Icon
                name="chevronDown"
                size={14}
                strokeWidth={2.4}
                className="text-ink-2/70 shrink-0 @max-[240px]:hidden"
              />
            </button>
          </div>
          <span
            aria-hidden="true"
            className="bg-ink-2/22 my-2.5 w-(--hairline) flex-none"
          />
          <div
            role="group"
            aria-label="지역"
            className="flex min-w-min flex-1 basis-0"
          >
            {selection && station ? (
              <button
                ref={regionButtonRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={panel === "region"}
                onClick={() =>
                  setPanelState(
                    panel === "region" ? null : { kind: "region", key: urlKey },
                  )
                }
                className="text-ink flex h-11 w-full min-w-0 cursor-pointer items-center gap-1.25 rounded-r-full px-2 text-left @max-[240px]:px-1.5"
              >
                <span className="flex h-6 min-w-0 flex-1 flex-wrap items-center gap-x-1.25 overflow-hidden text-left">
                  <span className="flex shrink-0 items-center gap-1.25 whitespace-nowrap">
                    <span
                      aria-hidden="true"
                      className={`size-2 flex-none rounded-full ${
                        isPending
                          ? "bg-fill/30 motion-safe:animate-pulse"
                          : selectedStatus
                            ? STATUS_DOT[selectedStatus]
                            : "bg-fill/30"
                      }`}
                    />
                    <span
                      data-testid="station-name"
                      className="text-17 leading-6 font-bold"
                    >
                      {station.name}
                    </span>
                  </span>
                  <span
                    data-testid="station-id"
                    className="text-14 text-ink-2/85 leading-6 font-medium whitespace-nowrap"
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
                  size={14}
                  strokeWidth={2.4}
                  className="text-ink-2/70 shrink-0 @max-[240px]:hidden"
                />
              </button>
            ) : (
              <span className="text-ink-2/75 flex h-11 w-full min-w-0 items-center px-2.5 font-medium whitespace-nowrap">
                지역 고르기
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => open("login")}
        aria-hidden={loginOpen || undefined}
        tabIndex={loginOpen ? -1 : undefined}
        className={`bg-fill/12 text-15 text-ink h-11 flex-none cursor-pointer rounded-full px-3.25 font-semibold whitespace-nowrap ${
          loginOpen ? "invisible" : ""
        }`}
      >
        로그인
      </button>

      {panel === "crop" && (
        <SelectionPanel
          title="작물 고르기"
          anchorRef={barRef}
          triggerRef={cropButtonRef}
          onClose={closePanel}
        >
          <div className="overflow-y-auto overscroll-contain px-2 pb-2">
            <CropPickerBody
              pathname={pathname}
              selection={selection}
              statuses={statuses}
              onClose={closePanel}
            />
          </div>
        </SelectionPanel>
      )}
      {panel === "region" && (
        <SelectionPanel
          title="지역 고르기"
          anchorRef={barRef}
          triggerRef={regionButtonRef}
          onClose={closePanel}
        >
          <RegionPickerBody
            pathname={pathname}
            selection={selection}
            statuses={statuses}
            onClose={closePanel}
          />
        </SelectionPanel>
      )}
    </div>
  );
}
