import { koreanClock } from "@/domain/datetime";
import type { Selection } from "@/domain/selection";
import {
  addDays,
  CROP_DB_ID,
  dayLabel,
  firstMainDate,
  koreanDate,
  markOutlookDays,
  needDay,
  pickKcSet,
  relDay,
  type NeedDay,
  type RunHour,
  type WaterQuery,
} from "@/domain/water-outlook";
import {
  WATER_STATUS_LABEL,
  WATER_STATUSES,
  type StatusBadge,
  type WaterStatus,
} from "@/domain/water-status";
import {
  leftText,
  monthlySummary,
  waterVerdict,
  type MonthRow,
  type Verdict,
} from "@/domain/water-verdict";
import {
  createWaterSource,
  type BalanceRow,
  type OutlookRow,
  type RunRow,
  type WaterSource,
} from "@/infra/supabase/water-source";

import type { PageMeta, Station } from "./shell";

/**
 * 물 화면에 필요한 값을 DB에서 읽어 화면용으로 정리한다 (데이터 계약 v1.3, 결정 0008·0009).
 * 계산하지 않는다. 숫자는 반올림해 문구로 바꾸고, 월별 표만 일별 값을 더한다(표시용 합계).
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

export type DayNav = {
  /** 기준 날짜. */
  date: string;
  today: string;
  isToday: boolean;
  /** "10월 25일 (일) 오늘" */
  label: string;
  /** 전날·다음날. 갈 수 없으면 null. 다음날이 오늘이면 today. */
  prev: string | null;
  next: string | null;
  /** 고를 수 있는 첫날 (작기 자료의 첫날). */
  min: string;
};

export type NowCard = {
  /** "어제까지 관측 기준" 처럼 이 상태의 기준. */
  basis: string;
  status: WaterStatus;
  badges: StatusBadge[];
  verdict: Verdict;
  /** 부족한 물을 보여 줄 수 있는 날 (휴면기·자료 없음이면 false). */
  active: boolean;
  drMm: number | null;
  rawMm: number;
  tawMm: number;
  gauge: WaterGauge | null;
  leftText: string | null;
  /** 그날(또는 마지막 관측일) ETo·ETc·비. */
  obs: {
    label: string;
    eto: string;
    etc: string;
    rain: string;
  } | null;
};

export type OutlookDay = {
  /** "내일", "다음날" */
  rel: string;
  /** "10월 26일 (월)" */
  date: string;
  iso: string;
  /** 예보 · 관측 · 참고(마지막 참고일) */
  kind: "예보" | "관측" | "참고";
  reference: boolean;
  status: WaterStatus;
  statusLabel: string;
  etcLabel: string;
  etc: string;
  rainLabel: string;
  rain: string;
  dr: string;
};

export type OutlookCard = {
  /** "02시 예보 기준", "관측값 기준" */
  basis: string;
  /** 오늘 받은 발표 회차 고르기. 지난 날을 볼 때는 빈 목록. */
  runs: { hour: RunHour; available: boolean; selected: boolean }[];
  /** 관수 필요 예상일·권장 관수량은 오늘 기준으로만 (요약 표). */
  need: NeedDay | null;
  advice: string | null;
  days: OutlookDay[];
};

export type SeasonDay = {
  date: string;
  etoMm: number | null;
  etcMm: number | null;
  rainMm: number | null;
  drMm: number | null;
  status: WaterStatus;
};

export type WaterView = {
  meta: PageMeta;
  cultivation: Cultivation[];
  scenarioId: string | null;
  day: DayNav | null;
  now: NowCard | null;
  outlook: OutlookCard | null;
  season: SeasonDay[];
  months: MonthRow[];
  rawMm: number | null;
  tawMm: number | null;
  /** 자료를 보여 줄 수 없을 때 그 이유. 없으면 null. */
  problem: string | null;
};

const NO_DATA = "자료 없음";
const DASH = "—";
const MIN_FILL_PCT = 2;
const mm = (v: number) => Math.round(v);
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const orDash = (v: number | null, f: (x: number) => string) =>
  v == null ? DASH : f(v);

function status(code: string): WaterStatus {
  return (WATER_STATUSES as readonly string[]).includes(code)
    ? (code as WaterStatus)
    : "normal";
}

function badge(s: WaterStatus): StatusBadge {
  return { status: s, label: WATER_STATUS_LABEL[s] };
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

function runHour(run: RunRow): RunHour {
  return koreanClock(run.run_at)?.hour === "17" ? "17" : "02";
}

function issueText(at: string | null) {
  const c = koreanClock(at);
  return c ? `${c.month}월 ${c.day}일 ${c.hour}시` : null;
}

function waterMeta(station: Station, run: RunRow | null): PageMeta {
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
  const doneTime = done ? `${done.hour}:${done.minute}` : NO_DATA;
  return {
    source: source(station),
    issue: `${issue} 단기예보${note}`,
    updated: done ? `${done.month}월 ${done.day}일 ${doneTime}` : NO_DATA,
    short: `${runHour(run)}시 예보 · ${doneTime} 갱신`,
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
    day: null,
    now: null,
    outlook: null,
    season: [],
    months: [],
    rawMm: null,
    tawMm: null,
    problem,
  };
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

type Deps = { createSource?: () => WaterSource; now?: () => Date };

export async function getWaterView(
  selection: Selection,
  station: Station,
  query: WaterQuery = { date: null, run: null },
  {
    createSource = () => createWaterSource(),
    now = () => new Date(),
  }: Deps = {},
): Promise<WaterView> {
  try {
    return await readView(selection, station, query, createSource(), now());
  } catch (error) {
    console.error("[water] DB 읽기 실패:", error);
    return empty(
      noMeta(station),
      "DB에서 물 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  }
}

function pickRun(runs: RunRow[], today: string, want: RunHour | null) {
  const todays = runs.filter((r) => koreanDate(r.run_at) === today);
  const run =
    (want && todays.find((r) => runHour(r) === want)) || runs[0] || null;
  return { run, todays };
}

async function readView(
  selection: Selection,
  station: Station,
  query: WaterQuery,
  db: WaterSource,
  at: Date,
): Promise<WaterView> {
  const today = koreanDate(at.toISOString());
  const year = Number(today.slice(0, 4));
  const stnId = String(station.id);
  const cropId = CROP_DB_ID[selection.crop];

  const [sets, scenarios, runs] = await Promise.all([
    db.kcSets(cropId),
    db.scenarios(stnId, cropId, year),
    db.recentRuns(stnId, 4),
  ]);
  const { run, todays } = pickRun(runs, today, query.run);
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
    run ? db.outlook(run.run_id, id) : Promise.resolve([] as OutlookRow[]),
    run ? db.summary(run.run_id, id) : Promise.resolve(null),
  ]);

  const byDate = new Map(balance.map((b) => [b.date, b]));
  const min = balance[0]?.date ?? today;
  const date =
    query.date && query.date >= min ? query.date : query.date ? min : today;
  const isToday = date === today;
  const day: DayNav = {
    date,
    today,
    isToday,
    label: `${dayLabel(date)}${isToday ? " 오늘" : ""}`,
    prev: date > min ? addDays(date, -1) : null,
    next: isToday ? null : addDays(date, 1),
    min,
  };

  const season = balance.map((b): SeasonDay => ({
    date: b.date,
    etoMm: b.eto_mm,
    etcMm: b.etc_mm,
    rainMm: b.rain_mm,
    drMm: b.dr_mm,
    status: status(b.status),
  }));
  const ctx = {
    selection,
    scenario,
    raw,
    taw,
    run,
    todays,
    today,
    date,
    byDate,
    balance,
    outlookRows,
    summary,
  };

  return {
    meta,
    cultivation,
    scenarioId: id,
    day,
    now: isToday ? nowToday(ctx) : nowPast(ctx),
    outlook: isToday ? outlookToday(ctx) : outlookPast(ctx),
    season,
    months: monthlySummary(season),
    rawMm: raw,
    tawMm: taw,
    problem: null,
  };
}

type Ctx = {
  selection: Selection;
  scenario: { season_start: string; season_end: string };
  raw: number;
  taw: number;
  run: RunRow | null;
  todays: RunRow[];
  today: string;
  date: string;
  byDate: Map<string, BalanceRow>;
  balance: BalanceRow[];
  outlookRows: OutlookRow[];
  summary: Awaited<ReturnType<WaterSource["summary"]>>;
};

function obsOf(row: BalanceRow | undefined, ref: string, past = false) {
  if (!row) return null;
  const name = past && row.date === ref ? "이날" : relDay(row.date, ref);
  return {
    label: `${name ?? dayLabel(row.date)} 관측`,
    eto: orDash(row.eto_mm, one),
    etc: orDash(row.etc_mm, one),
    rain: orDash(row.rain_mm, one),
  };
}

function card(
  c: Ctx,
  s: WaterStatus,
  dr: number | null,
  needIn: number | null,
  basis: string,
  obs: NowCard["obs"],
): NowCard {
  const verdict = waterVerdict({
    status: s,
    needIn,
    past: c.date !== c.today,
    crop: c.selection.crop,
    seasonStart: c.scenario.season_start,
    seasonEnd: c.scenario.season_end,
    date: c.date,
  });
  const active = dr != null && s !== "dormant";
  return {
    basis,
    status: s,
    badges: [
      badge(s),
      ...(verdict.extra
        ? [{ status: "need" as const, label: verdict.extra }]
        : []),
    ],
    verdict,
    active,
    drMm: dr,
    rawMm: c.raw,
    tawMm: c.taw,
    gauge: active ? gauge(s, dr, c.raw, c.taw) : null,
    leftText: active && dr != null ? leftText(dr, c.raw) : null,
    obs,
  };
}

function nowToday(c: Ctx): NowCard | null {
  const last = c.balance.at(-1);
  const sm = c.summary;
  if (sm && c.run) {
    const first = firstMainDate(c.run.run_at, c.run.run_name);
    const k = sm.need_center_in;
    const needIn =
      k == null
        ? null
        : k === 0
          ? 0
          : daysBetween(c.today, addDays(first, k - 1));
    const basis =
      sm.start_date === addDays(c.today, -1)
        ? "어제까지 관측 기준"
        : sm.start_date === c.today
          ? "오늘 예보까지 반영"
          : `${dayLabel(sm.start_date)} 기준`;
    const obs = obsOf(c.byDate.get(sm.start_date) ?? last, c.today);
    return card(c, status(sm.status_start), sm.dr_start_mm, needIn, basis, obs);
  }
  if (!last) return null;
  return card(
    c,
    status(last.status),
    last.dr_mm,
    null,
    `${dayLabel(last.date)} 관측 기준`,
    obsOf(last, c.today),
  );
}

/** 지난 날 다음 3일: 관측 물수지가 있으면 관측, 없으면 고른 회차의 예보. */
function nextDays(c: Ctx) {
  const fc = new Map(c.outlookRows.map((o) => [o.target_date, o]));
  return [1, 2, 3].map((j) => {
    const iso = addDays(c.date, j);
    return { j, iso, obs: c.byDate.get(iso), fc: fc.get(iso) };
  });
}

function nowPast(c: Ctx): NowCard | null {
  const row = c.byDate.get(c.date);
  if (!row) return null;
  const s = status(row.status);
  let needIn: number | null = s === "need" ? 0 : null;
  if (needIn == null) {
    for (const d of nextDays(c)) {
      const st = d.obs?.status ?? d.fc?.status;
      if (st === "need") {
        needIn = d.j;
        break;
      }
    }
  }
  return card(c, s, row.dr_mm, needIn, "관측 물수지", obsOf(row, c.date, true));
}

const REL_PAST = ["다음날", "이틀 뒤", "사흘 뒤"];

function fcDay(
  o: OutlookRow & { reference: boolean },
  rel: string,
): OutlookDay {
  const s = status(o.status);
  return {
    rel,
    date: dayLabel(o.target_date),
    iso: o.target_date,
    kind: o.reference ? "참고" : "예보",
    reference: o.reference,
    status: s,
    statusLabel: WATER_STATUS_LABEL[s],
    etcLabel: "작물이 쓸 물",
    etc: orDash(o.etc_mm, (v) => `${one(v)} mm`),
    rainLabel: "예상 비 (확률)",
    rain:
      o.rain_fcst_mm == null
        ? DASH
        : `${mm(o.rain_fcst_mm)} mm${o.pop_pct == null ? "" : ` (${mm(o.pop_pct)}%)`}`,
    dr: orDash(o.dr_center_mm, (v) => `${mm(v)} mm`),
  };
}

function obsDay(b: BalanceRow, rel: string): OutlookDay {
  const s = status(b.status);
  return {
    rel,
    date: dayLabel(b.date),
    iso: b.date,
    kind: "관측",
    reference: false,
    status: s,
    statusLabel: WATER_STATUS_LABEL[s],
    etcLabel: "작물이 쓴 물",
    etc: orDash(b.etc_mm, (v) => `${one(v)} mm`),
    rainLabel: "내린 비",
    rain: orDash(b.rain_mm, (v) => `${one(v)} mm`),
    dr: orDash(b.dr_mm, (v) => `${mm(v)} mm`),
  };
}

function runsSeg(c: Ctx) {
  const have = new Map(c.todays.map((r) => [runHour(r), r]));
  const sel = c.run ? runHour(c.run) : null;
  const selIsToday = c.run ? have.get(runHour(c.run)) === c.run : false;
  if (have.size === 0) return [];
  return (["02", "17"] as const).map((hour) => ({
    hour,
    available: have.has(hour),
    selected: selIsToday && sel === hour,
  }));
}

function outlookToday(c: Ctx): OutlookCard | null {
  const sm = c.summary;
  if (!c.run || !sm || c.outlookRows.length === 0) return null;
  const dormant = sm.status_start === "dormant";
  const firstDate = firstMainDate(c.run.run_at, c.run.run_name);
  const horizon = sm.horizon_days;
  const need = needDay({
    center: sm.need_center_in,
    early: sm.need_early_in,
    late: sm.need_late_in,
    firstDate,
    today: c.today,
    horizon,
  });
  const net = sm.advice_net_mm;
  const gross = sm.advice_gross_mm;
  return {
    basis: `${runHour(c.run)}시 예보 기준`,
    runs: runsSeg(c),
    // 휴면기·작기 아님에는 관수 필요 예상일을 보이지 않는다
    need: dormant ? null : need,
    advice:
      net == null
        ? null
        : gross == null
          ? `${mm(net)} mm`
          : `${mm(net)} mm (공급 ${mm(gross)} mm, 10a당 약 ${mm(gross)}톤)`,
    days: markOutlookDays(c.outlookRows, horizon).map((o) =>
      fcDay(o, relDay(o.target_date, c.today) ?? dayLabel(o.target_date)),
    ),
  };
}

function outlookPast(c: Ctx): OutlookCard | null {
  const days = nextDays(c).flatMap((d) => {
    const rel = REL_PAST[d.j - 1];
    if (d.obs) return [obsDay(d.obs, rel)];
    if (d.fc) return [fcDay({ ...d.fc, reference: false }, rel)];
    return [];
  });
  if (days.length === 0) return null;
  const mixed = days.some((d) => d.kind !== "관측");
  return {
    basis: mixed && c.run ? `관측 + ${runHour(c.run)}시 예보` : "관측값 기준",
    runs: [],
    need: null,
    advice: null,
    days,
  };
}
