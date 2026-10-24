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
    latestRun: async (s) => (calls.push(`latestRun ${s}`), RUN),
    outlook: async (r, s) => (calls.push(`outlook ${r} ${s}`), OUTLOOK),
    summary: async (r, s) => (calls.push(`summary ${r} ${s}`), SUMMARY),
    balance: async (s, u) => (calls.push(`balance ${s} ${u}`), BALANCE),
    ...over,
  };
}
const NOW = () => new Date("2026-10-25T00:30:00+09:00");
const CHUNCHEON = { id: 101, name: "춘천", measuresSunlight: true };

describe("getWaterView", () => {
  it("기본 재배 방식(초생 재배)의 조건을 읽고, 배추는 DB 이름으로 묻는다", async () => {
    const calls: Calls = [];
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake({}, calls),
      NOW,
    );
    expect(v.scenarioId).toBe("101-apple-main-k3-loam-2026");
    expect(calls).toContain("scenarios 101 apple 2026");
    expect(calls).toContain("outlook 7 101-apple-main-k3-loam-2026");
    expect(calls).toContain("balance 101-apple-main-k3-loam-2026 2026-10-25");
    expect(v.cultivation).toEqual([
      {
        setNo: 3,
        name: "초생 재배, 서리 지역",
        note: null,
        selected: true,
        isDefault: true,
      },
      {
        setNo: 1,
        name: "청경 재배, 서리 지역",
        note: "풀을 베는 과원",
        selected: false,
        isDefault: false,
      },
    ]);

    const c2: Calls = [];
    await getWaterView(
      { stationId: 101, crop: "cabbage" },
      CHUNCHEON,
      () => fake({}, c2),
      NOW,
    );
    expect(c2).toContain("kcSets kimchi_cabbage");
  });

  it("주소창 kc 로 재배 방식을 바꾼다", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple", kc: 1 },
      CHUNCHEON,
      () => fake(),
      NOW,
    );
    expect(v.scenarioId).toBe("101-apple-main-k1-loam-2026");
    expect(v.cultivation.find((c) => c.selected)?.setNo).toBe(1);
  });

  it("지금 상태는 전망 출발 날짜, 배지는 오늘 다음 날 판정까지 본다", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake(),
      NOW,
    );
    expect(v.now).toMatchObject({
      date: "2026-10-24",
      status: "caution",
      drMm: 50.7,
      rawMm: 65,
      tawMm: 130,
      numbers: "부족한 물 51 mm / 관수 시작점 65 mm",
      // 오늘(10/25)은 주의, 내일(10/26)은 관수 필요 → 미리 알림
      badge: { status: "need", label: "내일 관수 필요" },
    });
    expect(v.now?.gauge?.rawPct).toBe(50);
  });

  it("관수 필요 예상일, 권장 관수량, 주 지표 3일과 참고일", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake(),
      NOW,
    );
    expect(v.outlook?.need).toEqual({
      date: "2026-10-26",
      text: "내일(10/26 월)",
      range: "빠르면 오늘 · 늦으면 3일 안에는 없음",
    });
    expect(v.outlook?.advice).toBe("66 mm (공급 70 mm, 10a당 약 70톤)");
    expect(v.outlook?.days.map((d) => [d.date, d.status, d.reference])).toEqual(
      [
        ["2026-10-25", "caution", false],
        ["2026-10-26", "need", false],
        ["2026-10-27", "need", false],
        ["2026-10-28", "caution", true],
      ],
    );
    expect(v.outlook?.days[1]).toMatchObject({
      label: "내일(10/26 월)",
      rainMm: 4,
      popPct: 60,
    });
    expect(v.outlook?.etcSum).toBe("3.6 ± 0.9 mm");
  });

  it("작기 돌아보기 자료와 자료 상자 값을 낸다", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake(),
      NOW,
    );
    expect(v.season.map((d) => d.date)).toEqual(["2026-10-23", "2026-10-24"]);
    expect(v.meta).toEqual({
      source: "기상청 ASOS 춘천(101) · 단기예보 · FAO-56 물수지",
      issue: "10월 25일 02시 단기예보",
      updated: "10월 25일 02:41",
      short: "02시 예보 · 02:41 갱신",
    });
    expect(v.problem).toBeNull();
  });

  it("백업 회차는 발표 줄에 적는다", async () => {
    const run = {
      ...RUN,
      result: "백업: 직전 발표",
      src_run_at: "2026-10-24T08:00:00+00:00",
    };
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake({ latestRun: async () => run }),
      NOW,
    );
    expect(v.meta.issue).toBe(
      "10월 25일 02시 단기예보 (백업: 10월 24일 17시 발표로 대신함)",
    );
  });

  it("회차가 없으면 전망은 비우고 관측 물수지는 보여 준다", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake({ latestRun: async () => null }),
      NOW,
    );
    expect(v.outlook).toBeNull();
    expect(v.now).toMatchObject({ date: "2026-10-24", drMm: 50.7 });
    expect(v.meta.issue).toBe("자료 없음");
    expect(v.problem).toBeNull();
  });

  it("계산 조건이 없으면 '자료 없음'과 이유", async () => {
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => fake({ scenarios: async () => [] }),
      NOW,
    );
    expect(v.now).toBeNull();
    expect(v.problem).toBe("이 지역·작물의 2026 계산 조건이 아직 없어요.");
  });

  it("DB를 읽지 못하면 던지지 않고 '자료 없음'으로 돌려준다", async () => {
    const boom = fake({
      kcSets: async () => {
        throw new Error("crop_kc_sets 읽기 실패: timeout");
      },
    });
    const v = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => boom,
      NOW,
    );
    expect(v.problem).toBe(
      "DB에서 물 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
    expect(v.meta.updated).toBe("자료 없음");
    const noEnv = await getWaterView(
      { stationId: 101, crop: "apple" },
      CHUNCHEON,
      () => {
        throw new Error("env");
      },
      NOW,
    );
    expect(noEnv.problem).not.toBeNull();
  });
});
