import { describe, expect, it } from "vitest";

import type {
  BalanceRow,
  OutlookRow,
  RunRow,
  SummaryRow,
  WaterSource,
} from "@/infra/supabase/water-source";

import { getWaterView } from "./water";

/** 가짜 DB. 값은 지어낸 것이다 (춘천 사과, 10/25 아침 회차). */
const KC_SETS = [
  {
    kc_set_id: "apple-k3",
    set_no: 3,
    name_ko: "초생 재배, 서리 지역",
    note: null,
    is_default: true,
    sort_order: 1,
  },
  {
    kc_set_id: "apple-k1",
    set_no: 1,
    name_ko: "청경 재배, 서리 지역",
    note: "풀을 베는 과원",
    is_default: false,
    sort_order: 2,
  },
];
const SCENARIOS = [
  {
    scenario_id: "101-apple-main-k1-loam-2026",
    kc_set_id: "apple-k1",
    taw_mm: 130,
    raw_mm: 65,
    season_start: "2026-04-01",
    season_end: "2026-11-15",
  },
  {
    scenario_id: "101-apple-main-k3-loam-2026",
    kc_set_id: "apple-k3",
    taw_mm: 130,
    raw_mm: 65,
    season_start: "2026-04-01",
    season_end: "2026-11-15",
  },
];
const RUN: RunRow = {
  run_id: 7,
  run_at: "2026-10-24T17:00:00+00:00",
  run_name: "아침",
  result: "정시 성공",
  on_time: true,
  finished_at: "2026-10-24T17:41:09+00:00",
  src_run_at: null,
};
const day = (
  target_date: string,
  lead_day: number,
  status: string,
): OutlookRow => ({
  target_date,
  lead_day,
  etc_mm: 1.2,
  etc_err_mm: 0.3,
  rain_fcst_mm: lead_day === 1 ? 4 : 0,
  pop_pct: lead_day === 1 ? 60 : 10,
  rain_expected_mm: lead_day === 1 ? 2.4 : 0,
  dr_center_mm: 50 + lead_day,
  dr_early_mm: 51 + lead_day,
  dr_late_mm: 49 + lead_day,
  status,
});
const OUTLOOK = [
  day("2026-10-28", 3, "caution"),
  day("2026-10-25", 0, "caution"),
  day("2026-10-26", 1, "need"),
  day("2026-10-27", 2, "need"),
];
const SUMMARY: SummaryRow = {
  horizon_days: 3,
  start_date: "2026-10-24",
  dr_start_mm: 50.7,
  status_start: "caution",
  need_center_in: 2,
  need_early_in: 1,
  need_late_in: null,
  advice_net_mm: 66.1,
  advice_gross_mm: 69.6,
  etc_sum_mm: 3.6,
  etc_sum_err_mm: 0.9,
  rain_sum_mm: 4,
  rain_expected_sum_mm: 2.4,
};
const BALANCE: BalanceRow[] = [
  {
    date: "2026-10-23",
    kc: 0.9,
    eto_mm: 1.5,
    etc_mm: 1.35,
    rain_mm: 0,
    dr_mm: 49.4,
    status: "caution",
    filled: false,
  },
  {
    date: "2026-10-24",
    kc: 0.9,
    eto_mm: 1.4,
    etc_mm: 1.26,
    rain_mm: 0,
    dr_mm: 50.7,
    status: "caution",
    filled: false,
  },
];

type Calls = string[];
function fake(over: Partial<WaterSource> = {}, calls: Calls = []): WaterSource {
  return {
    kcSets: async (c) => (calls.push(`kcSets ${c}`), KC_SETS),
    scenarios: async (s, c, y) => (
      calls.push(`scenarios ${s} ${c} ${y}`),
      SCENARIOS
    ),
    recentRuns: async (s, n) => (calls.push(`recentRuns ${s} ${n}`), [RUN]),
    outlook: async (r, s) => (calls.push(`outlook ${r} ${s}`), OUTLOOK),
    summary: async (r, s) => (calls.push(`summary ${r} ${s}`), SUMMARY),
    balance: async (s, u) => (calls.push(`balance ${s} ${u}`), BALANCE),
    ...over,
  };
}
const NOW = () => new Date("2026-10-25T08:30:00+09:00");
const CHUNCHEON = { id: 101, name: "춘천", measuresSunlight: true };

const APPLE = { stationId: 101, crop: "apple" as const };
const TODAY = { date: null, run: null };
const view = (
  q: { date: string | null; run: "02" | "17" | null } = TODAY,
  over: Partial<WaterSource> = {},
  calls: Calls = [],
  selection: Parameters<typeof getWaterView>[0] = APPLE,
) =>
  getWaterView(selection, CHUNCHEON, q, {
    createSource: () => fake(over, calls),
    now: NOW,
  });

describe("재배 방식과 읽는 조건", () => {
  it("기본 재배 방식의 조건을 읽고, 배추는 DB 이름으로 묻는다", async () => {
    const calls: Calls = [];
    const v = await view(TODAY, {}, calls);
    expect(v.scenarioId).toBe("101-apple-main-k3-loam-2026");
    expect(calls).toContain("scenarios 101 apple 2026");
    expect(calls).toContain("recentRuns 101 4");
    expect(calls).toContain("outlook 7 101-apple-main-k3-loam-2026");
    expect(calls).toContain("balance 101-apple-main-k3-loam-2026 2026-10-25");
    expect(
      v.cultivation.map((c) => [c.setNo, c.selected, c.isDefault]),
    ).toEqual([
      [3, true, true],
      [1, false, false],
    ]);
    const c2: Calls = [];
    await view(TODAY, {}, c2, { stationId: 101, crop: "cabbage" });
    expect(c2).toContain("kcSets kimchi_cabbage");
  });

  it("주소창 kc 로 재배 방식을 바꾼다", async () => {
    const v = await view(TODAY, {}, [], { ...APPLE, kc: 1 });
    expect(v.scenarioId).toBe("101-apple-main-k1-loam-2026");
  });
});

describe("오늘", () => {
  it("① 지금 상태: 출발 상태, 판정 문구, 배지 둘, 게이지, 관측값", async () => {
    const v = await view();
    expect(v.day).toMatchObject({
      date: "2026-10-25",
      isToday: true,
      label: "10월 25일 (일) 오늘",
      prev: "2026-10-24",
      next: null,
      min: "2026-10-23",
    });
    expect(v.now).toMatchObject({
      basis: "어제까지 관측 기준",
      status: "caution",
      verdict: { text: "오늘은 괜찮아요, 내일 물 주세요", tone: "need" },
      badges: [
        { status: "caution", label: "주의" },
        { status: "need", label: "내일 관수 필요" },
      ],
      active: true,
      drMm: 50.7,
      leftText: "관수 시작점까지 14 mm 남았어요",
      obs: { label: "어제 관측", eto: "1.4", etc: "1.3", rain: "0.0" },
    });
    expect(v.now?.gauge?.rawPct).toBe(50);
  });

  it("② 앞으로 3일: 회차 기준, 예상일·권장량, 마지막 날은 참고", async () => {
    const v = await view();
    expect(v.outlook?.basis).toBe("02시 예보 기준");
    expect(v.outlook?.runs).toEqual([
      { hour: "02", available: true, selected: true },
      { hour: "17", available: false, selected: false },
    ]);
    expect(v.outlook?.need?.text).toBe("내일(10/26 월)");
    expect(v.outlook?.advice).toBe("66 mm (공급 70 mm, 10a당 약 70톤)");
    expect(v.outlook?.days.map((d) => [d.rel, d.kind, d.statusLabel])).toEqual([
      ["오늘", "예보", "주의"],
      ["내일", "예보", "관수 필요"],
      ["모레", "예보", "관수 필요"],
      ["글피", "참고", "주의"],
    ]);
    expect(v.outlook?.days[1]).toMatchObject({
      date: "10월 26일 (월)",
      etc: "1.2 mm",
      rain: "4 mm (60%)",
      dr: "51 mm",
    });
  });

  it("오늘 17시 회차가 있으면 기본은 새 회차, 주소창으로 02시를 고른다", async () => {
    const eve = {
      ...RUN,
      run_id: 8,
      run_at: "2026-10-25T08:00:00+00:00",
      run_name: "저녁",
      finished_at: "2026-10-25T08:40:00+00:00",
    };
    const runs = { recentRuns: async () => [eve, RUN] };
    const calls: Calls = [];
    const v = await view(TODAY, runs, calls);
    expect(calls).toContain("outlook 8 101-apple-main-k3-loam-2026");
    expect(
      v.outlook?.runs.map((r) => [r.hour, r.available, r.selected]),
    ).toEqual([
      ["02", true, false],
      ["17", true, true],
    ]);
    expect(v.meta.short).toBe("17시 예보 · 17:40 갱신");
    const c2: Calls = [];
    await view({ date: null, run: "02" }, runs, c2);
    expect(c2).toContain("outlook 7 101-apple-main-k3-loam-2026");
  });

  it("자료 상자: 실제 회차와 갱신 시각, 백업이면 적는다", async () => {
    expect((await view()).meta).toEqual({
      source: "기상청 ASOS 춘천(101) · 단기예보 · FAO-56 물수지",
      issue: "10월 25일 02시 단기예보",
      updated: "10월 25일 02:41",
      short: "02시 예보 · 02:41 갱신",
    });
    const run = {
      ...RUN,
      result: "백업: 직전 발표",
      src_run_at: "2026-10-24T08:00:00+00:00",
    };
    const v = await view(TODAY, { recentRuns: async () => [run] });
    expect(v.meta.issue).toBe(
      "10월 25일 02시 단기예보 (백업: 10월 24일 17시 발표로 대신함)",
    );
  });

  it("회차가 없으면 전망은 비우고 마지막 관측 물수지로 지금 상태", async () => {
    const v = await view(TODAY, { recentRuns: async () => [] });
    expect(v.outlook).toBeNull();
    expect(v.now).toMatchObject({
      basis: "어제까지 관측 기준",
      drMm: 50.7,
      // 예보가 없으면 앞날("3일 동안")을 말하지 않는다
      verdict: { text: "아직 여유 있어요" },
    });
    expect(v.meta.issue).toBe("자료 없음");
  });
});

describe("휴면기", () => {
  it("휴면기에는 관수 필요 예상일을 보이지 않는다", async () => {
    const v = await view(TODAY, {
      summary: async () => ({
        ...SUMMARY,
        status_start: "dormant",
        dr_start_mm: null,
        need_center_in: null,
        need_early_in: null,
        advice_net_mm: null,
        advice_gross_mm: null,
      }),
    });
    expect(v.outlook?.need).toBeNull();
    expect(v.now).toMatchObject({
      status: "dormant",
      active: false,
      gauge: null,
    });
  });
});

describe("지난 날", () => {
  it("그날 관측 물수지와 다음 3일(관측, 없으면 예보)", async () => {
    const v = await view({ date: "2026-10-23", run: null });
    expect(v.day).toMatchObject({
      date: "2026-10-23",
      isToday: false,
      label: "10월 23일 (금)",
      prev: null,
      next: "2026-10-24",
    });
    expect(v.now).toMatchObject({
      basis: "관측 물수지",
      drMm: 49.4,
      verdict: {
        text: "이날은 괜찮았어요, 사흘 뒤 물을 줘야 했어요",
        tone: "caution",
      },
      obs: { label: "이날 관측", eto: "1.5" },
    });
    expect(v.outlook).toMatchObject({
      basis: "관측 + 02시 예보",
      runs: [],
      need: null,
      advice: null,
    });
    expect(v.outlook?.days.map((d) => [d.rel, d.kind, d.etcLabel])).toEqual([
      ["다음날", "관측", "작물이 쓴 물"],
      ["이틀 뒤", "예보", "작물이 쓸 물"],
      ["사흘 뒤", "예보", "작물이 쓸 물"],
    ]);
  });

  it("자료 첫날보다 앞이면 첫날로", async () => {
    const v = await view({ date: "2026-01-05", run: null });
    expect(v.day?.date).toBe("2026-10-23");
  });
});

describe("작기 돌아보기와 실패", () => {
  it("작기 자료와 월별 요약", async () => {
    const v = await view();
    expect(v.season.map((d) => [d.date, d.drMm])).toEqual([
      ["2026-10-23", 49.4],
      ["2026-10-24", 50.7],
    ]);
    expect(v.months).toEqual([
      { month: "10월 ~24일", eto: 3, etc: 3, rain: 0, needDays: 0 },
    ]);
    expect(v.problem).toBeNull();
  });

  it("계산 조건이 없으면 '자료 없음'과 이유, 대표 밖 지점이면 대표 지점 안내", async () => {
    const v = await view(TODAY, { scenarios: async () => [] });
    expect(v.now).toBeNull();
    expect(v.problem).toBe("이 지역·작물의 2026 계산 조건이 아직 없어요.");

    const hongcheon = {
      id: 212,
      name: "홍천",
      sido: "강원",
      isRepresentative: false,
      measuresSunlight: false,
      sunlightMeasured: null,
    };
    const vOut = await getWaterView(
      { stationId: 212, crop: "apple" },
      hongcheon,
      TODAY,
      {
        createSource: () => fake({ scenarios: async () => [] }),
        now: NOW,
      },
    );
    expect(vOut.now).toBeNull();
    expect(vOut.problem).toBe(
      "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요",
    );
  });

  it("DB를 읽지 못하면 던지지 않고 '자료 없음'으로 돌려준다", async () => {
    const v = await view(TODAY, {
      kcSets: async () => {
        throw new Error("crop_kc_sets 읽기 실패: timeout");
      },
    });
    expect(v.problem).toBe(
      "DB에서 물 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
    expect(v.meta.updated).toBe("자료 없음");
    const noEnv = await getWaterView(APPLE, CHUNCHEON, TODAY, {
      createSource: () => {
        throw new Error("env");
      },
    });
    expect(noEnv.problem).not.toBeNull();
  });
});
