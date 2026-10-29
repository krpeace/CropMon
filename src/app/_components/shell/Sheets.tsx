"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { parseSelection, withSelection } from "@/domain/selection";
import { STATION_ENTRIES } from "@/services/shell";

import { useSheet } from "./sheet-context";

export function AboutButton() {
  const { open } = useSheet();
  return (
    <button
      type="button"
      onClick={() => open("about")}
      className="text-brand-ink cursor-pointer py-2 font-bold"
    >
      CropMon 소개
    </button>
  );
}

/**
 * 가운데 창(로그인 안내·CropMon 소개). 바깥이나 Esc 를 누르면 닫힌다. layout 에서 <Suspense> 안에 둔다.
 * "station"·"crop" 은 SiteHeader.tsx 의 StationSheet·CropSheet 가 그리므로 여기서는 그리지 않는다.
 */
export function Sheets() {
  const { sheet, close } = useSheet();
  const shown = sheet === "login" || sheet === "about";

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, close]);

  if (!shown) return null;

  return (
    <div
      onClick={close}
      className="bg-scrim/28 fixed inset-0 z-40 flex items-center justify-center p-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={sheet === "login" ? "로그인 안내" : "CropMon 소개"}
        onClick={(e) => e.stopPropagation()}
        className="rounded-panel bg-card shadow-panel max-h-[86%] w-full max-w-130 [scrollbar-width:none] overflow-auto px-5 pt-2 pb-7.5"
      >
        <div className="bg-ink-2/30 mx-auto mt-1 mb-2.5 h-1.25 w-9 rounded-full" />
        {sheet === "login" ? <LoginSheet /> : <AboutSheet />}
      </div>
    </div>
  );
}

function CloseButton() {
  const { close } = useSheet();
  return (
    <button
      type="button"
      onClick={close}
      className="bg-fill/12 text-17 text-ink h-12.5 w-full cursor-pointer rounded-full font-semibold"
    >
      닫기
    </button>
  );
}

function LoginSheet() {
  const { close } = useSheet();
  const selection = parseSelection(useSearchParams(), STATION_ENTRIES);
  return (
    <div className="flex flex-col items-center gap-3 pt-2 pb-1 text-center">
      <Image
        src="/brand/mon.png"
        alt=""
        width={165}
        height={196}
        className="h-auto w-19"
      />
      <span className="text-23 font-bold">
        로그인은 2027년 1월 1일부터 열려요
      </span>
      <span className="text-17 text-ink-2/88 leading-loose">
        회원이 되면 내 밭 주소와 흙의 종류로
        <br />내 밭 단위 물 판정을 받을 수 있어요.
      </span>
      <Link
        href={withSelection("/my-farm", selection)}
        onClick={close}
        className="bg-brand text-18 mt-1.5 flex h-13.5 w-full items-center justify-center rounded-full font-bold text-white"
      >
        내 농장 미리보기
      </Link>
      <CloseButton />
    </div>
  );
}

function AboutSheet() {
  return (
    <div className="flex flex-col items-center gap-3 py-1 text-center">
      <span className="bg-plate rounded-row flex shrink-0 dark:px-2 dark:py-0.5">
        <Image
          src="/brand/logo-emblem.png"
          alt="CropMon 작물재배의 든든한 감시자"
          width={412}
          height={383}
          className="h-auto w-37.5"
        />
      </span>
      <span className="text-14 text-ink-2/80">
        Crop Monitoring + Crop Monster
      </span>
      <span className="text-19 leading-loose font-bold text-pretty">
        농업 데이터와 내 농장 기록으로
        <br />
        작물 재배 판단을 돕는 서비스
      </span>
      <span className="text-16 text-ink-2/88 leading-loose">
        지도사는 지역 단위로, 농업인은 내 밭 단위로 본다
      </span>
      <div className="rounded-box bg-tile text-15 leading-body flex w-full flex-col gap-1.5 px-4 py-3.5 text-left">
        <span>
          <b>지금</b> 기상청 ASOS 관측·단기예보로 계산한 물수지(FAO-56),
          적산온도, 적산일사
        </span>
        <span className="text-ink-2/85">
          <b className="text-ink">앞으로</b> 토양(농진청), 도매시장 가격(aT),
          농업관측(KREI)
        </span>
      </div>
      <CloseButton />
    </div>
  );
}
