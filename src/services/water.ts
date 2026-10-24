import { koreanClock } from "@/domain/datetime";
import type { Selection } from "@/domain/selection";
import {
  CROP_DB_ID,
  firstMainDate,
  koreanDate,
  markOutlookDays,
  needDay,
  pickKcSet,
  type NeedDay,
} from "@/domain/water-outlook";
import {
  todayBadge,
  WATER_STATUS_LABEL,
  WATER_STATUSES,
  type StatusBadge,
  type WaterStatus,
} from "@/domain/water-status";
import {
  createWaterSource,
  type WaterSource,
} from "@/infra/supabase/water-source";

import type { PageMeta, Station } from "./shell";

/**
 * 물 화면에 필요한 값을 DB에서 읽어 화면용으로 정리한다 (데이터 계약 v1.3).
 * 계산하지 않는다. 숫자는 반올림해 문구로만 바꾼다.
 */

export type Cultivation = {
  setNo: number;
  name: string;
  note: string | null;
  selected: boolean;
  isDefault: boolean;
};

export type WaterGauge = {
  status: WaterStatus;
  fillPct: number;
  rawPct: number;
};

export type WaterNow = {
  /** 이 상태의 날짜 (전망 출발 날짜, 없으면 마지막 관측 물수지 날). */
  date: string;
  status: WaterStatus;
  badge: StatusBadge;
  drMm: number | null;
  rawMm: number;
  tawMm: number;
  numbers: string;
  gauge: WaterGauge | null;
};

export type OutlookDay = {
  date: string;
  label: string;
  status: WaterStatus;
  statusLabel: string;
  /** 마지막 참고일 (관수 필요 예상일은 보지 않는 날). */
  reference: boolean;
  etcMm: number | null;
  etcErrMm: number | null;
  rainMm: number | null;
  popPct: number | null;
  rainExpectedMm: number | null;
  drMm: number | null;
  drEarlyMm: number | null;
  drLateMm: number | null;
};

export type WaterOutlook = {
  firstDate: string;
  horizon: number;
  need: NeedDay;
  /** 권장 관수량 문구. 예상일이 없으면 null. */
  advice: string | null;
  etcSum: string | null;
  rainSum: string | null;
  days: OutlookDay[];
};

export type SeasonDay = {
  date: string;
  drMm: number | null;
  rainMm: number | null;
  etcMm: number | null;
  status: WaterStatus;
  filled: boolean;
};

export type WaterView = {
  meta: PageMeta;
  cultivation: Cultivation[];
  scenarioId: string | null;
  rawMm: number | null;
  tawMm: number | null;
  now: WaterNow | null;
  outlook: WaterOutlook | null;
  /** 2026 작기 관측 물수지 (그래프·표용), 날짜 순. */
  season: SeasonDay[];
  /** 자료를 보여 줄 수 없을 때 그 이유. 없으면 null. */
  problem: string | null;
};

const NO_DATA = "자료 없음";
const MIN_FILL_PCT = 2;
const mm = (v: number) => Math.round(v);
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

function status(code: string): WaterStatus {
  return (WATER_STATUSES as readonly string[]).includes(code)
    ? (code as WaterStatus)
    : "normal";
}

function source(station: Station) {
  return `기상청 ASOS ${station.name}(${station.id}) · 단기예보 · FAO-56 물수지`;
}

function noMeta(station: Station): PageMeta {
  return {
    source: source(station),
    issue: NO_DATA,
    updated: NO_DATA,
    short: NO_DATA,
  };
}

function issueText(at: string | null) {
  const c = koreanClock(at);
  return c ? `${c.month}월 ${c.day}일 ${c.hour}시` : null;
}

function waterMeta(
  station: Station,
  run: Awaited<ReturnType<WaterSource["latestRun"]>>,
): PageMeta {
  const issue = run && issueText(run.run_at);
  if (!run || !issue) return noMeta(station);
  const src = issueText(run.src_run_at);
  const note =
    run.result === "백업: 직전 발표" && src
      ? ` (백업: ${src} 발표로 대신함)`
      : run.result === "정시 성공"
        ? ""
        : ` (${run.result})`;
  const done = koreanClock(run.finished_at);
  const hour = koreanClock(run.run_at)!.hour;
  return {
    source: source(station),
    issue: `${issue} 단기예보${note}`,
    updated: done
      ? `${done.month}월 ${done.day}일 ${done.hour}:${done.minute}`
      : NO_DATA,
    short: `${hour}시 예보 · ${done ? `${done.hour}:${done.minute}` : NO_DATA} 갱신`,
  };
}

function gauge(
  s: WaterStatus,
  dr: number | null,
  raw: number,
  taw: number,
): WaterGauge | null {
  if (dr == null || taw <= 0) return null;
  return {
    status: s,
    fillPct: Math.max(MIN_FILL_PCT, (dr / taw) * 100),
    rawPct: (raw / taw) * 100,
  };
}

function empty(meta: PageMeta, problem: string | null): WaterView {
  return {
    meta,
    cultivation: [],
    scenarioId: null,
    rawMm: null,
    tawMm: null,
    now: null,
    outlook: null,
    season: [],
    problem,
  };
}

const createDefault = () => createWaterSource();

export async function getWaterView(
  selection: Selection,
  station: Station,
  createSource: () => WaterSource = createDefault,
  now: () => Date = () => new Date(),
): Promise<WaterView> {
  try {
    return await readView(selection, station, createSource(), now());
  } catch (error) {
    console.error("[water] DB 읽기 실패:", error);
    return empty(
      noMeta(station),
      "DB에서 물 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  }
}

async function readView(
  selection: Selection,
  station: Station,
  db: WaterSource,
  at: Date,
): Promise<WaterView> {
  const today = koreanDate(at.toISOString());
  const year = Number(today.slice(0, 4));
  const stnId = String(station.id);
  const cropId = CROP_DB_ID[selection.crop];

  const [sets, scenarios, run] = await Promise.all([
    db.kcSets(cropId),
    db.scenarios(stnId, cropId, year),
    db.latestRun(stnId),
  ]);
  const meta = waterMeta(station, run);
  const set = pickKcSet(sets, selection.kc);
  const cultivation = sets.map((s) => ({
    setNo: s.set_no,
    name: s.name_ko,
    note: s.note,
    selected: s.kc_set_id === set?.kc_set_id,
    isDefault: s.is_default,
  }));
  const scenario = scenarios.find((s) => s.kc_set_id === set?.kc_set_id);
  if (!scenario) {
    return {
      ...empty(meta, `이 지역·작물의 ${year} 계산 조건이 아직 없어요.`),
      cultivation,
    };
  }
  const { scenario_id: id, raw_mm: raw, taw_mm: taw } = scenario;

  const [balance, outlookRows, summary] = await Promise.all([
    db.balance(id, today),
    run ? db.outlook(run.run_id, id) : Promise.resolve([]),
    run ? db.summary(run.run_id, id) : Promise.resolve(null),
  ]);

  const season = balance.map((b): SeasonDay => ({
    date: b.date,
    drMm: b.dr_mm,
    rainMm: b.rain_mm,
    etcMm: b.etc_mm,
    status: status(b.status),
    filled: b.filled,
  }));

  let outlook: WaterOutlook | null = null;
  if (run && summary && outlookRows.length > 0) {
    const firstDate = firstMainDate(run.run_at, run.run_name);
    const horizon = summary.horizon_days;
    const need = needDay({
      center: summary.need_center_in,
      early: summary.need_early_in,
      late: summary.need_late_in,
      firstDate,
      today,
      horizon,
    });
    const days = markOutlookDays(outlookRows, horizon).map((r): OutlookDay => {
      const s = status(r.status);
      return {
        date: r.target_date,
        label: needDay({ center: 1, firstDate: r.target_date, today, horizon })
          .text,
        status: s,
        statusLabel: WATER_STATUS_LABEL[s],
        reference: r.reference,
        etcMm: r.etc_mm,
        etcErrMm: r.etc_err_mm,
        rainMm: r.rain_fcst_mm,
        popPct: r.pop_pct,
        rainExpectedMm: r.rain_expected_mm,
        drMm: r.dr_center_mm,
        drEarlyMm: r.dr_early_mm,
        drLateMm: r.dr_late_mm,
      };
    });
    const net = summary.advice_net_mm;
    const gross = summary.advice_gross_mm;
    outlook = {
      firstDate,
      horizon,
      need,
      advice:
        net == null
          ? null
          : gross == null
            ? `${mm(net)} mm`
            : `${mm(net)} mm (공급 ${mm(gross)} mm, 10a당 약 ${mm(gross)}톤)`,
      etcSum:
        summary.etc_sum_mm == null
          ? null
          : `${one(summary.etc_sum_mm)}${summary.etc_sum_err_mm == null ? "" : ` ± ${one(summary.etc_sum_err_mm)}`} mm`,
      rainSum:
        summary.rain_sum_mm == null
          ? null
          : `${one(summary.rain_sum_mm)} mm (기대 ${one(summary.rain_expected_sum_mm ?? 0)} mm)`,
      days,
    };
  }

  const last = balance.at(-1);
  const startDr = summary ? summary.dr_start_mm : (last?.dr_mm ?? null);
  const startStatus = summary
    ? status(summary.status_start)
    : last
      ? status(last.status)
      : null;
  const startDate = summary ? summary.start_date : last?.date;
  // 배지의 "내일"은 오늘 다음 날 (todayBadge 가 내일 관수 필요를 미리 알려 준다).
  const next = outlook?.days.find((d) => !d.reference && d.date > today);
  const nowView: WaterNow | null =
    startStatus && startDate
      ? {
          date: startDate,
          status: startStatus,
          badge: todayBadge(startStatus, next?.status ?? startStatus),
          drMm: startDr,
          rawMm: raw,
          tawMm: taw,
          numbers:
            startDr == null
              ? NO_DATA
              : `부족한 물 ${mm(startDr)} mm / 관수 시작점 ${mm(raw)} mm`,
          gauge: gauge(startStatus, startDr, raw, taw),
        }
      : null;

  return {
    meta,
    cultivation,
    scenarioId: id,
    rawMm: raw,
    tawMm: taw,
    now: nowView,
    outlook,
    season,
    problem: null,
  };
}
