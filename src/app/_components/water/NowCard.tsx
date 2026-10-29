import Image from "next/image";
import Link from "next/link";

import type { Selection } from "@/domain/selection";
import type {
  CommonNowCard as CommonNow,
  NowCard as Now,
  SoilOption,
} from "@/services/water";

import { STATUS_CARD, STATUS_FILL } from "../ui/status";
import { StatusBadge } from "../ui/StatusBadge";
import { SoilPicker } from "./SoilPicker";

/** ① 지금 토양 상태 (시안 그대로): 꼬리표 → 배지 → 판정 문구 → 숫자 줄 → 게이지 → ETo·ETc·비. */
export function NowCard({ now, dayLabel }: { now: Now; dayLabel: string }) {
  return (
    <section
      aria-label="지금 토양 상태"
      className={`rounded-card shadow-edge flex flex-col gap-3.5 p-5 ${STATUS_CARD[now.verdict.tone]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-15 text-ink-2/85 font-bold">
          ① 지금 토양 상태
        </span>
        <span className="flex-1" />
        <span className="text-14 text-ink-2/80">
          {dayLabel} · {now.basis}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {now.badges.map((b) => (
          <StatusBadge key={b.label} badge={b} className="text-16" />
        ))}
      </div>
      <div className="text-verdict leading-card tracking-title font-bold text-pretty">
        {now.verdict.text}
      </div>

      {now.active && now.drMm != null && now.gauge && (
        <>
          <div className="text-19 text-ink-2/92">
            부족한 물 <b className="text-ink">{Math.round(now.drMm)} mm</b> /
            관수 시작점 {Math.round(now.rawMm)} mm
          </div>
          <div className="flex flex-col gap-1.5 pt-1">
            <div
              aria-hidden="true"
              className="shadow-hairline relative h-4.5 rounded-full bg-white/95 dark:bg-white/14"
            >
              <div
                className="absolute inset-y-0 right-0 rounded-r-full bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--color-need-dot)_16%,transparent)_0_6px,color-mix(in_oklab,var(--color-need-dot)_6%,transparent)_6px_12px)]"
                style={{ left: `${now.gauge.rawPct}%` }}
              />
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${STATUS_FILL[now.gauge.status]}`}
                style={{ width: `${now.gauge.fillPct}%` }}
              />
              <div
                className="bg-warn absolute -top-1.5 -bottom-1.5 w-0.75 -translate-x-1/2 rounded-full"
                style={{ left: `${now.gauge.rawPct}%` }}
              />
            </div>
            <div className="text-13 text-ink-2/85 relative h-9.5 leading-[1.3]">
              <span className="absolute top-0 left-0">
                0<br />
                흙이 촉촉
              </span>
              <span
                className="text-warn absolute top-0 -translate-x-1/2 text-center font-bold whitespace-nowrap"
                style={{ left: `${now.gauge.rawPct}%` }}
              >
                {Math.round(now.rawMm)}
                <br />
                관수 시작점{" "}
                <span className="text-ink-2/60 font-normal">RAW</span>
              </span>
              <span className="absolute top-0 right-0 text-right">
                {Math.round(now.tawMm)}
                <br />
                뿌리층 전체 <span className="text-ink-2/60">TAW</span>
              </span>
            </div>
            {now.leftText && (
              <div className="text-17 font-bold">{now.leftText}</div>
            )}
          </div>
        </>
      )}

      {now.verdict.sub && (
        <div className="rounded-box bg-fill/8 flex items-center gap-3 px-3.5 py-3">
          <Image
            src="/brand/mon.png"
            alt=""
            width={165}
            height={196}
            className="block h-auto w-10 flex-none opacity-85 grayscale-[0.6]"
          />
          <span className="text-17 leading-body text-ink-2/90">
            {now.verdict.sub}
          </span>
        </div>
      )}

      {now.obs && now.active && (
        <div className="border-ink-2/18 flex flex-col gap-2 border-t-(length:--hairline) pt-3">
          <span className="text-13 text-ink-2/75">{now.obs.label}</span>
          <div className="grid grid-cols-3 gap-2">
            <Num
              label="기준 증발산"
              abbr="ETo"
              value={now.obs.eto}
              unit="mm/일"
            />
            <Num
              label="작물이 쓴 물"
              abbr="ETc"
              value={now.obs.etc}
              unit="mm/일"
            />
            <Num label="이날 비" value={now.obs.rain} unit="mm" />
          </div>
        </div>
      )}
    </section>
  );
}

function Num({
  label,
  abbr,
  value,
  unit,
}: {
  label: string;
  abbr?: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-14 text-ink-2/85">
        {label} {abbr && <span className="text-ink-2/60">{abbr}</span>}
      </span>
      <span className="text-20 font-bold tabular-nums">
        {value}
        <span className="text-14 font-medium"> {unit}</span>
      </span>
    </div>
  );
}

/** 작물 공통 ① 지금 토양 상태 카드: 배지 → 토양 속 남은 물 N% → 막대(60%·30% 눈금) → 남은 물 / 담을 수 있는 물 → 한 줄 설명 → 최근 7일 합 → 토양 고르기. */
export function CommonNowCard({
  commonNow,
  dayLabel,
  soils,
  selection,
  date,
}: {
  commonNow: CommonNow;
  dayLabel: string;
  soils: SoilOption[];
  selection: Selection;
  date: string | null;
}) {
  const tone = commonNow.status ?? "dormant";
  const fillPct =
    commonNow.awPct != null ? Math.max(2, Math.min(100, commonNow.awPct)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <section
        aria-label="지금 토양 상태"
        className={`rounded-card shadow-edge flex flex-col gap-3.5 p-5 ${STATUS_CARD[tone]}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-15 text-ink-2/85 font-bold">
            ① 지금 토양 상태
          </span>
          <span className="flex-1" />
          <span className="text-14 text-ink-2/80">
            {dayLabel} · {commonNow.basis}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge
            badge={{ status: tone, label: commonNow.badgeLabel }}
            className="text-16"
          />
        </div>

        <div className="text-verdict leading-card tracking-title font-bold text-pretty">
          {commonNow.headline}
        </div>

        {commonNow.active &&
          commonNow.awPct != null &&
          commonNow.remainMm != null && (
            <>
              <div className="text-19 text-ink-2/92">
                남은 물 <b className="text-ink">{commonNow.remainMm}</b> / 담을
                수 있는 물 {commonNow.tawMm} mm
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <div
                  aria-hidden="true"
                  className="shadow-hairline relative h-4.5 rounded-full bg-white/95 dark:bg-white/14"
                >
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${STATUS_FILL[tone]}`}
                    style={{ width: `${fillPct}%` }}
                  />
                  <div
                    className="bg-warn absolute -top-1.5 -bottom-1.5 w-0.75 -translate-x-1/2 rounded-full"
                    style={{ left: "30%" }}
                  />
                  <div
                    className="bg-ink-2/45 absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full"
                    style={{ left: "60%" }}
                  />
                </div>
                <div className="text-13 text-ink-2/85 relative h-8 leading-[1.3]">
                  <span className="absolute top-0 left-0">0%</span>
                  <span
                    className="text-warn absolute top-0 -translate-x-1/2 text-center font-bold whitespace-nowrap"
                    style={{ left: "30%" }}
                  >
                    30% 건조
                  </span>
                  <span
                    className="text-ink-2/85 absolute top-0 -translate-x-1/2 text-center font-semibold whitespace-nowrap"
                    style={{ left: "60%" }}
                  >
                    60% 충분
                  </span>
                  <span className="absolute top-0 right-0 text-right">
                    100%
                  </span>
                </div>
              </div>

              <div className="text-17 text-ink-2/92">
                {commonNow.description}
              </div>

              {commonNow.daysToDryText && (
                <div className="text-17 text-warn font-bold">
                  {commonNow.daysToDryText}
                </div>
              )}

              {commonNow.recent7dText && (
                <div className="border-ink-2/18 text-16 text-ink-2/88 border-t-(length:--hairline) pt-3">
                  {commonNow.recent7dText}
                </div>
              )}
            </>
          )}

        {!commonNow.active && commonNow.headline !== commonNow.description && (
          <div className="text-17 text-ink-2/90">{commonNow.description}</div>
        )}

        <SoilPicker soils={soils} selection={selection} date={date} />
      </section>
      <p className="text-13 text-ink-2/80 m-0 px-1">
        ※ 작물과 관계없이 겉토양 50 cm만 본 값이에요. 작물별 관수 판단은 작물을
        고르세요.
      </p>
    </div>
  );
}

/** 토성·계산근거 안내 말풍선 (시안 그대로). */
export function SoilBubble({
  farmHref,
  text,
}: {
  farmHref: string;
  text?: string;
}) {
  return (
    <div className="flex items-end gap-2.5">
      <Image
        src="/brand/mon.png"
        alt=""
        width={165}
        height={196}
        className="block h-auto w-11.5 flex-none"
      />
      <div className="bg-bubble text-16 text-mint-ink flex-1 rounded-[20px_20px_20px_6px] px-4 py-3.5 leading-loose text-pretty">
        {text ? (
          text
        ) : (
          <>
            토양은 양토로 계산했어요. 내 밭 토성은 회원이 되면 12종 중에서 고를
            수 있어요{" "}
            <Link
              href={farmHref}
              className="text-brand-ink hit-44 font-bold whitespace-nowrap underline"
            >
              미리보기
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
