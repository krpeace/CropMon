"use client";

import Image from "next/image";
import { useState } from "react";

import { farmMatch, SOILS } from "@/domain/farm-preview";
import type { Crop } from "@/domain/selection";
import { FARM_SAMPLES } from "@/mocks/farm";
import { getPageMeta, getStation } from "@/services/shell";

import { MetaBox } from "../shell/MetaBox";
import { PageHead } from "../shell/PageHead";
import { Grid } from "../ui/Grid";
import { Icon } from "../ui/Icon";

const CARD_BG: Record<string, string> = {
  need: "bg-need-card",
  ok: "bg-ok-card",
  enough: "bg-normal-card",
  wet: "bg-wet-card",
  dormant: "bg-card",
};

const BADGE_STYLE: Record<string, string> = {
  need: "bg-need-bg text-need-fg",
  ok: "bg-ok-bg text-ok-fg",
  enough: "bg-normal-bg text-normal-fg",
  wet: "bg-wet-bg text-wet-fg",
  dormant: "bg-dormant-bg text-dormant-fg",
};

const GAUGE_COLOR: Record<string, string> = {
  need: "bg-need-dot",
  ok: "bg-ok-dot",
  enough: "bg-normal-dot",
  wet: "bg-wet-dot",
  dormant: "bg-dormant-dot",
};

/**
 * 내 농장 데모 화면 (시안 정적 미리보기).
 * 계산은 하지 않고 src/mocks/farm.ts 의 표에서 읽기만 한다.
 */
export function FarmScreen() {
  const [addr, setAddr] = useState("홍천군 내촌면");
  const [soil, setSoil] = useState(3);
  const [crop, setCrop] = useState<Crop>("apple");
  const [fDate, setFDate] = useState("2021-04-05");
  const [report, setReport] = useState(false);
  const [fileName, setFileName] = useState("");

  const match = farmMatch(addr);
  const station = (match && getStation(match.stationId)) || getStation(101)!;
  const meta = getPageMeta("my-farm", station, null);

  const sampleKey = `${station.id}|${crop}|${soil}`;
  const sample = FARM_SAMPLES[sampleKey] ?? FARM_SAMPLES["101|apple|3"];

  return (
    <div className="flex flex-col gap-4">
      <PageHead page="my-farm" meta={meta} />

      {/* 1. 상단 안내 카드 */}
      <div className="rounded-card bg-card flex items-center gap-4 p-5">
        <span className="bg-plate rounded-row flex shrink-0 dark:px-2 dark:py-0.5">
          <Image
            src="/brand/logo-emblem.png"
            alt=""
            width={84}
            height={84}
            className="h-auto w-[84px] shrink-0"
          />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-18 font-bold">
            로그인하면 내 밭 단위로 봐요
          </span>
          <span className="text-16 leading-body text-ink-2/88">
            로그인은 2027년 1월 1일부터 열려요. 아래는 로그인 뒤 화면을 미리
            보여 드리는 거예요.
          </span>
        </div>
      </div>

      <Grid min="wide">
        {/* 2. 내 밭 등록 */}
        <section
          aria-label="내 밭 등록"
          className="rounded-card bg-card flex flex-col gap-4.5 p-5"
        >
          <h2 className="text-20 m-0 font-bold">내 밭 등록</h2>

          {/* 1) 밭 주소 */}
          <div className="flex flex-col gap-2">
            <span className="text-16 font-bold">
              <span className="text-emerald">1</span> 밭 주소
            </span>
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="예: 홍천군 내촌면"
              className="rounded-row bg-tile text-18 shadow-inset-hairline h-[54px] px-4 font-sans outline-none"
            />
            <div
              className={`text-16 flex items-center gap-2 ${
                match ? "text-brand-ink" : "text-warn"
              }`}
            >
              <Icon name="pin" size={18} strokeWidth={2} className="shrink-0" />
              <span>
                {match
                  ? `가까운 관측 지점: ${station.name}(${station.id}) · 약 ${match.km} km · 자동 연결`
                  : "가까운 지점을 찾지 못했어요. 시·군 이름을 넣어 보세요"}
              </span>
            </div>
          </div>

          {/* 2) 흙의 종류 */}
          <div className="flex flex-col gap-2">
            <span className="text-16 font-bold">
              <span className="text-emerald">2</span> 흙의 종류{" "}
              <span className="text-ink-2/60 font-normal">토성 12종</span>
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {SOILS.map((s) => {
                const selected = s.id === soil;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSoil(s.id)}
                    className={`rounded-row flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-px p-1.5 transition-colors ${
                      selected
                        ? "bg-brand text-white shadow-none"
                        : "bg-tile text-ink shadow-inset-thin"
                    }`}
                  >
                    <span className="text-15 font-bold">{s.ko}</span>
                    <span className="text-11 opacity-75">{s.en}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-14 text-ink-2/80">
              잘 모르면 양토로 두세요
            </span>
          </div>

          {/* 3) 작물과 정식일 */}
          <div className="flex flex-col gap-2">
            <span className="text-16 font-bold">
              <span className="text-emerald">3</span> 작물과 정식일
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-fill/14 flex h-12 gap-0.5 rounded-full p-[3px]">
                <button
                  type="button"
                  onClick={() => {
                    setCrop("apple");
                    setFDate("2021-04-05");
                  }}
                  className={`text-16 cursor-pointer rounded-full px-4.5 font-semibold transition-colors ${
                    crop === "apple"
                      ? "bg-seg text-ink shadow-segment"
                      : "text-ink-2/80 hover:text-ink"
                  }`}
                >
                  사과
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCrop("cabbage");
                    setFDate("2026-08-05");
                  }}
                  className={`text-16 cursor-pointer rounded-full px-4.5 font-semibold transition-colors ${
                    crop === "cabbage"
                      ? "bg-seg text-ink shadow-segment"
                      : "text-ink-2/80 hover:text-ink"
                  }`}
                >
                  배추
                </button>
              </div>
              <input
                type="date"
                value={fDate}
                onChange={(e) => setFDate(e.target.value)}
                className="rounded-row bg-tile text-17 shadow-inset-hairline h-12 min-w-[150px] flex-1 px-3.5 font-sans outline-none"
              />
            </div>
          </div>
        </section>

        {/* 오른쪽 열 */}
        <div className="flex flex-col gap-4">
          {/* 3. 내 밭의 물 판정 */}
          <section
            aria-label="내 밭의 물 판정"
            className={`rounded-card shadow-edge flex flex-col gap-3 p-5 ${
              CARD_BG[sample.tone] ?? "bg-card"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-15 text-ink-2/85 font-bold">
                내 밭의 물 판정
              </span>
              <span className="flex-1" />
              <span className="text-14 text-ink-2/80">
                {station.name} · {SOILS[soil].ko} ·{" "}
                {crop === "apple" ? "사과" : "배추"}
              </span>
            </div>

            <span
              className={`rounded-row text-15 self-start px-3 py-1.25 font-bold whitespace-nowrap ${
                BADGE_STYLE[sample.badgeTone] ?? "bg-fill/14 text-gray-ink"
              }`}
            >
              {sample.badge}
            </span>

            <div className="text-card-verdict leading-card font-bold text-pretty">
              {sample.title}
            </div>

            <div className="text-18 text-ink-2/92">
              {sample.shortage != null
                ? `부족한 물 ${sample.shortage} mm / 관수 시작점 ${sample.start} mm`
                : sample.sub}
            </div>

            {sample.shortage != null && (
              <div className="shadow-inset-edge relative h-3.5 rounded-full bg-white/95 dark:bg-white/14">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    GAUGE_COLOR[sample.gaugeTone] ?? "bg-brand"
                  }`}
                  style={{ width: `${sample.fill}%` }}
                />
                <div
                  className="bg-warn absolute -top-1.25 -bottom-1.25 w-[3px] -translate-x-1/2 rounded-full"
                  style={{ left: "45%" }}
                />
              </div>
            )}

            <span className="text-14 leading-body text-ink-2/80">
              흙의 종류에 따라 뿌리층이 담는 물{" "}
              <span className="text-ink-2/60">TAW</span>이 달라져 판정이
              바뀌어요. 위에서 토성을 바꿔 보세요.
            </span>
          </section>

          {/* 4. 한 해 농사 돌아보기 */}
          <section
            aria-label="한 해 농사 돌아보기"
            className="rounded-card bg-card flex flex-col gap-3 p-5"
          >
            <h2 className="text-20 m-0 font-bold">한 해 농사 돌아보기</h2>

            {!report ? (
              <>
                <label className="rounded-panel border-brand-ink/30 bg-lime/12 flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-4 text-center">
                  <Icon
                    name="upload"
                    size={30}
                    strokeWidth={2}
                    className="text-brand-ink"
                  />
                  <span className="text-17 text-brand-ink font-bold">
                    스마트팜 CSV 올리기
                  </span>
                  <span className="text-15 leading-body text-ink-2/85">
                    스마트팜에서 내려받은 기록 파일(.csv)을 올리면
                    <br />한 해 농사 보고서를 만들어 드려요
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFileName(file.name);
                        setReport(true);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFileName("스마트팜_관수기록_2026.csv (예시)");
                    setReport(true);
                  }}
                  className="bg-brand-ink/10 text-17 text-brand-ink hover:bg-brand-ink/15 h-[50px] cursor-pointer rounded-full font-bold transition-colors"
                >
                  예시 파일로 보기
                </button>
              </>
            ) : (
              <>
                <div className="text-14 text-ink-2/85 flex items-center gap-2">
                  <Icon
                    name="check"
                    size={16}
                    strokeWidth={2.6}
                    className="text-emerald shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{fileName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReport(false);
                      setFileName("");
                    }}
                    className="text-14 text-brand-ink cursor-pointer p-2 font-bold"
                  >
                    다시 올리기
                  </button>
                </div>

                <div className="text-22 leading-snug font-bold text-pretty">
                  {sample.head}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "물 준 횟수", val: sample.times },
                    { label: "모두 준 물", val: sample.total },
                    { label: "관수 필요 판정일", val: sample.needDays },
                    { label: "밭 기온 (센서)", val: "관측소보다 +0.8℃" },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="rounded-box bg-tile flex flex-col gap-0.5 p-3 px-3.5"
                    >
                      <span className="text-14 text-ink-2/85">
                        {stat.label}
                      </span>
                      <span className="text-22 font-bold">{stat.val}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-15 font-bold">달마다 준 물 (mm)</span>
                  <div className="grid h-[110px] grid-cols-5 items-end gap-2">
                    {["4월", "5월", "6월", "7월", "8월"].map((mLabel, i) => {
                      const mm = sample.months[i] ?? 0;
                      const maxVal = Math.max(12, ...sample.months);
                      const heightPct = Math.max(3, (mm / maxVal) * 85);
                      return (
                        <div
                          key={mLabel}
                          className="flex h-full flex-col items-center justify-end gap-1"
                        >
                          <span className="text-12 font-bold">{mm}</span>
                          <div
                            className="bg-emerald rounded-t-bar w-[60%]"
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-13 text-ink-2/85">
                            {mLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-end gap-2.5">
                  <Image
                    src="/brand/mon.png"
                    alt=""
                    width={40}
                    height={48}
                    className="h-auto w-10 shrink-0"
                  />
                  <div className="bg-bubble text-15 text-mint-ink flex-1 rounded-[18px_18px_18px_6px] p-3.5 px-4 leading-loose">
                    비 온 다음 날 물을 준 날이 3일 있었어요. 이런 날은
                    건너뛰어도 괜찮아요.
                  </div>
                </div>

                <span className="text-13 text-ink-2/75">
                  예시 보고서예요. 실제 보고서는 올린 기록으로 만들어져요.
                </span>
              </>
            )}
          </section>
        </div>
      </Grid>

      {/* 5. 자료 상자 */}
      <MetaBox meta={meta} />
    </div>
  );
}
