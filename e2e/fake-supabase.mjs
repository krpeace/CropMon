// 화면 테스트용 가짜 Supabase (PostgREST 흉내). 값은 지어낸 것이다. 실제 농가·키 없음.
// 오늘(한국 날짜)을 기준으로 춘천(101) 사과·배추 자료와 지점 10곳의 적산온도를 만든다. 태백(216)만 묻는 읽기는 일부러 오류를 돌려준다.
// 날짜 규칙: 달력 날짜(예: 04-01)를 고정해 쓰지 않는다. 작기는 "오늘" 기준 상대 날짜(사과 = 오늘 안, 배추 = 오늘 밖)라
// 어느 날 돌려도 같은 결과가 나온다. 날짜를 바꿔 보려면 E2E_TODAY=YYYY-MM-DD (e2e/fake-clock.mjs, playwright.config.ts).
// E2E_TODAY 없이 한국 날짜가 1월 1~3일이면 올해 자료가 거의 없어 자동으로 그해 1월 4일로 잡는다 (playwright.config.ts).
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const DAY = 86_400_000;
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));
const add = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// 지점 사전 105곳 (데이터 계약 v1.6 마이그레이션 SQL 에서 그대로 읽는다)
const stationsSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261028030000_seed_stations_asos.sql",
  ),
  "utf8",
);
const stations = [
  ...stationsSql.matchAll(
    /\(\s*'(\d+)',\s*'([^']+)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(null|\d+),\s*(null|\d+),\s*(true|false),\s*(true|false),\s*(true|false),\s*(true|false|null),\s*'([^']+)',\s*(\d+)\s*\)/g,
  ),
].map((m) => ({
  stn_id: m[1],
  name_ko: m[2],
  sido: m[3],
  lat: Number(m[4]),
  lon: Number(m[5]),
  elev_m: Number(m[6]),
  wind_height_m: Number(m[7]),
  grid_nx: m[8] === "null" ? null : Number(m[8]),
  grid_ny: m[9] === "null" ? null : Number(m[9]),
  has_forecast: m[10] === "true",
  is_representative: m[11] === "true",
  is_active: m[12] === "true",
  measures_sunlight: m[13] === "null" ? null : m[13] === "true",
  synced_at: m[14],
  sort_order: Number(m[15]),
}));

// 단기예보 1차(c1, 20곳) 및 2차(c2, 67곳) 확대 반영: 운영 97곳 전체 has_forecast = true (20261109030000_stations_has_forecast_c2.sql)
for (const s of stations) {
  if (s.is_active) {
    s.has_forecast = true;
  }
}

// 일사 관측 실태 반영: 태백(true), 비대표 55곳(true), 미관측 32곳(false), 폐지·휴지 8곳(null) (20261109020000_stations_measures_sunlight.sql)
const NO_SUNLIGHT_STNS = new Set([
  "130",
  "140",
  "174",
  "188",
  "201",
  "202",
  "203",
  "211",
  "212",
  "217",
  "221",
  "226",
  "232",
  "236",
  "238",
  "243",
  "244",
  "247",
  "248",
  "260",
  "261",
  "268",
  "271",
  "272",
  "273",
  "277",
  "278",
  "281",
  "285",
  "289",
  "294",
  "295",
]);
for (const s of stations) {
  if (!s.is_active) {
    s.measures_sunlight = null;
  } else if (NO_SUNLIGHT_STNS.has(s.stn_id)) {
    s.measures_sunlight = false;
  } else {
    s.measures_sunlight = true;
  }
}

const kcSets = [
  ["apple-k3", "apple", 3, "초생 재배, 서리 지역", true, 1],
  ["apple-k1", "apple", 1, "청경 재배, 서리 지역", false, 2],
  ["apple-k4", "apple", 4, "초생 재배, 서리 없는 지역", false, 3],
  ["apple-k2", "apple", 2, "청경 재배, 서리 없는 지역", false, 4],
  ["kimchi_cabbage-k1", "kimchi_cabbage", 1, "기본 (양배추 값 임시)", true, 1],
].map(([kc_set_id, crop_id, set_no, name_ko, is_default, sort_order]) => ({
  kc_set_id,
  crop_id,
  set_no,
  name_ko,
  note: null,
  is_default,
  sort_order,
}));

// 작기는 오늘 기준 상대 날짜. 사과: 오늘이 작기 안(1월 1일은 휴면기). 배추: 오늘이 작기 밖(아직 안 심음).
// 사과 시작: 올해 2월 1일 (1월 한 달은 늘 휴면기). 오늘이 2월 1일 이전이면 오늘이 작기 안이도록 1월 2일 (1월 1일만 휴면기).
const APPLE_START = today > `${year}-02-01` ? `${year}-02-01` : `${year}-01-02`;
const APPLE_END = add(today, 30);
const CABBAGE_START = add(today, 60);
const CABBAGE_END = add(today, 150);
const SEASON = {
  apple: [APPLE_START, APPLE_END],
  kimchi_cabbage: [CABBAGE_START, CABBAGE_END],
};
const scen = (kc, crop, taw, raw, stn = "101") => ({
  scenario_id: `${stn}-${crop}-${kc}-loam-${year}`,
  stn_id: stn,
  crop_id: crop,
  season_year: year,
  is_default: kc === "k3" || crop !== "apple",
  kc_set_id: `${crop}-${kc}`,
  taw_mm: taw,
  raw_mm: raw,
  season_start: SEASON[crop][0],
  season_end: SEASON[crop][1],
});
const scenarios = [
  scen("k3", "apple", 130, 65),
  scen("k1", "apple", 130, 65),
  scen("k1", "kimchi_cabbage", 65, 29.25),
  // 수원(119): 예보 회차 없이 관측 물수지만 (지역 칩은 마지막 관측 판정을 쓴다)
  scen("k3", "apple", 130, 65, "119"),
  // 진주(192): 예보 회차가 있지만 계수는 춘천 값을 빌려 쓰는 지점 (물6)
  scen("k3", "apple", 130, 65, "192"),
  // 서귀포(189): 예보 없이 관측 물수지이지만 filled=true (추정 포함 E2E 검증용)
  scen("k3", "apple", 130, 65, "189"),
  // 전주(146): 예보 회차가 있고 출발일도 filled=true (앞으로 3일 + 전국 일부 추정 E2E 검증용)
  scen("k3", "apple", 130, 65, "146"),
  // 강릉(105): 대표 밖 87곳 예보 지점. 춘천 값을 빌려 써서 검증 전 안내가 뜬다 (#103)
  scen("k3", "apple", 130, 65, "105"),
  // 강릉(105) 배추, 서울(108) 사과·배추: 대표 밖 지점의 선택 줄·지역 목록 판정 E2E 검증용 (#138).
  // 예보 회차는 없이 관측 물수지만 있다 (사과는 기본 K3, 배추는 기본 K1).
  scen("k1", "kimchi_cabbage", 65, 29.25, "105"),
  scen("k3", "apple", 130, 65, "108"),
  scen("k1", "kimchi_cabbage", 65, 29.25, "108"),
];

const statusOf = (dr, raw) =>
  dr >= raw ? "need" : dr >= raw * 0.5 ? "caution" : "normal";
const balance = [];
for (const s of scenarios) {
  for (let d = `${year}-01-01`, i = 0; d < today; d = add(d, 1), i++) {
    const on = d >= s.season_start && d <= s.season_end;
    const dr = on ? ((i * 3) % Math.round(s.raw_mm * 1.2)) + 0.4 : null;
    balance.push({
      scenario_id: s.scenario_id,
      date: d,
      kc: on ? 0.9 : null,
      eto_mm: 2 + (i % 5) * 0.5,
      etc_mm: on ? 1.8 + (i % 5) * 0.45 : null,
      rain_mm: i % 7 === 0 ? 12 : 0,
      dr_mm: dr,
      status: on ? statusOf(dr, s.raw_mm) : "dormant",
      filled: (s.stn_id === "189" || s.stn_id === "146") && d >= add(today, -3),
    });
  }
}

const runAt = new Date(Date.parse(`${today}T02:00:00+09:00`)).toISOString();
const forecast_runs = [
  {
    run_id: 1,
    stn_id: "101",
    collector: "actions",
    run_at: runAt,
    run_name: "아침",
    result: "정시 성공",
    on_time: true,
    src_run_at: null,
    finished_at: new Date(Date.parse(runAt) + 41 * 60_000).toISOString(),
  },
  {
    run_id: 2,
    stn_id: "192",
    collector: "actions",
    run_at: runAt,
    run_name: "아침",
    result: "정시 성공",
    on_time: true,
    src_run_at: null,
    finished_at: new Date(Date.parse(runAt) + 41 * 60_000).toISOString(),
  },
  {
    run_id: 3,
    stn_id: "146",
    collector: "actions",
    run_at: runAt,
    run_name: "아침",
    result: "정시 성공",
    on_time: true,
    src_run_at: null,
    finished_at: new Date(Date.parse(runAt) + 41 * 60_000).toISOString(),
  },
  {
    run_id: 4,
    stn_id: "105",
    collector: "actions",
    run_at: runAt,
    run_name: "아침",
    result: "정시 성공",
    on_time: true,
    src_run_at: null,
    finished_at: new Date(Date.parse(runAt) + 41 * 60_000).toISOString(),
  },
];
const water_outlook = [];
const water_outlook_summary = [];
const RUN_OF = { 101: 1, 146: 3, 192: 2, 105: 4 }; // 예보 회차가 있는 지점
for (const s of scenarios) {
  const runId = RUN_OF[s.stn_id];
  if (!runId) continue;
  const on = today >= s.season_start && today <= s.season_end;
  const st = ["caution", "need", "need", "caution"];
  for (let lead = 0; lead < 4; lead++) {
    water_outlook.push({
      run_id: runId,
      scenario_id: s.scenario_id,
      target_date: add(today, lead),
      lead_day: lead,
      etc_mm: on ? 1.2 : null,
      etc_err_mm: on ? 0.3 : null,
      rain_fcst_mm: lead === 1 ? 4 : 0,
      pop_pct: lead === 1 ? 60 : 10,
      rain_expected_mm: lead === 1 ? 2.4 : 0,
      dr_center_mm: on ? 50 + lead * 8 : null,
      dr_early_mm: on ? 52 + lead * 8 : null,
      dr_late_mm: on ? 48 + lead * 8 : null,
      status: on ? st[lead] : "dormant",
    });
  }
  const last = balance.filter((b) => b.scenario_id === s.scenario_id).at(-1);
  water_outlook_summary.push({
    run_id: runId,
    scenario_id: s.scenario_id,
    horizon_days: 3,
    start_date: last.date,
    dr_start_mm: on ? 50.7 : null,
    status_start: on ? "caution" : "dormant",
    need_center_in: on ? 2 : null,
    need_early_in: on ? 1 : null,
    need_late_in: null,
    advice_net_mm: on ? 66.1 : null,
    advice_gross_mm: on ? 69.6 : null,
    etc_sum_mm: on ? 3.6 : null,
    etc_sum_err_mm: on ? 0.9 : null,
    rain_sum_mm: 4,
    rain_expected_sum_mm: 2.4,
  });
}

// 지점별 ASOS 관측 받은 시각 (온도·햇빛 자료 상자)
const weather_daily = ["101", "119", "146", "189"].map((stn_id) => ({
  stn_id,
  date: add(today, -1),
  fetched_at: new Date(Date.parse(runAt) + 20 * 60_000).toISOString(), // 02:20
}));

// 작물 사전: 적산온도 기준온도와 단계 (계약 v1.4·v1.5)
const crops = [
  {
    crop_id: "apple",
    t_base_c: 4,
    gdd_stages: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000],
  },
  { crop_id: "kimchi_cabbage", t_base_c: 4, gdd_stages: [300, 600, 900, 1200] },
  {
    crop_id: "common",
    t_base_c: 5,
    gdd_stages: [500, 1000, 1500, 2000, 2500, 3000],
  },
];

// 토성 사전 12종 (계약 v1.5)
const soil_types = [
  ["sand", "사토", false, false, 1],
  ["loamy_sand", "양질사토", false, false, 2],
  ["sandy_loam", "사양토", false, false, 3],
  ["silt", "미사토", false, false, 4],
  ["silt_loam", "미사질양토", false, false, 5],
  ["loam", "양토", true, false, 6],
  ["sandy_clay_loam", "사질식양토", false, true, 7],
  ["clay_loam", "식양토", false, true, 8],
  ["silty_clay_loam", "미사질식양토", false, false, 9],
  ["sandy_clay", "사질식토", false, true, 10],
  ["silty_clay", "미사질식토", false, false, 11],
  ["clay", "식토", false, false, 12],
].map(([soil_code, name_ko, is_default, is_estimated, sort_order]) => ({
  soil_code,
  name_ko,
  is_default,
  is_estimated,
  sort_order,
}));

// 작물 공통 토양 물 상태 (계약 v1.5)
const soil_water_daily = [];
const SOIL_CONFIGS = [
  {
    stn_id: "101",
    soil_code: "loam",
    taw_mm: 65,
    raw_mm: 26,
    dr_mm: 33.8,
    aw_pct: 48,
    status: "fair",
    days_to_dry: 6,
  },
  {
    stn_id: "101",
    soil_code: "sand",
    taw_mm: 30,
    raw_mm: 12,
    dr_mm: 24,
    aw_pct: 20,
    status: "dry",
    days_to_dry: null,
  },
  {
    stn_id: "101",
    soil_code: "sandy_clay_loam",
    taw_mm: 55,
    raw_mm: 22,
    dr_mm: 16.5,
    aw_pct: 70,
    status: "ample",
    days_to_dry: null,
  },
  {
    stn_id: "119",
    soil_code: "loam",
    taw_mm: 65,
    raw_mm: 26,
    dr_mm: 46.8,
    aw_pct: 28,
    status: "dry",
    days_to_dry: null,
  },
  {
    stn_id: "189",
    soil_code: "loam",
    taw_mm: 65,
    raw_mm: 26,
    dr_mm: 33.8,
    aw_pct: 48,
    status: "fair",
    days_to_dry: 6,
    filled: true,
  },
];
for (const cfg of SOIL_CONFIGS) {
  const lastDay = add(today, -1);
  for (let d = `${year}-01-01`, k = 0; d < today; d = add(d, 1), k++) {
    const m = Number(d.slice(5, 7));
    // 겨울철(12~2월)은 어제만 빼고 겨울철로 둔다: 어제 값은 늘 설정값이어야 "오늘 카드" 시험이 겨울에도 같은 결과다.
    const winter = (m === 12 || m === 1 || m === 2) && d !== add(today, -1);
    // 마지막 날(어제)은 설정값 그대로 (① 카드 테스트가 읽는다). 앞날은 그래프가 평평하지 않게 조금 흔든다.
    const last = d === lastDay;
    const dr = last
      ? cfg.dr_mm
      : Math.round(cfg.taw_mm * (0.15 + (0.7 * ((k * 5) % 11)) / 10) * 10) / 10;
    soil_water_daily.push({
      stn_id: cfg.stn_id,
      soil_code: cfg.soil_code,
      date: d,
      eto_mm: last ? 3.4 : 2 + (k % 5) * 0.5,
      rain_mm: !last && k % 9 === 0 ? 14 : 0,
      eto_7d_mm: 24,
      rain_7d_mm: 3,
      dp_mm: 0,
      dr_mm: winter ? null : dr,
      taw_mm: cfg.taw_mm,
      raw_mm: cfg.raw_mm,
      aw_pct: winter
        ? null
        : last
          ? cfg.aw_pct
          : Math.round(((cfg.taw_mm - dr) / cfg.taw_mm) * 100),
      status: winter ? "winter" : cfg.status,
      days_to_dry: winter ? null : cfg.days_to_dry,
      filled: Boolean(cfg.filled && d >= add(today, -3)),
      calc_version: "fake",
    });
  }
}

// 작물 공통 토양 물 상태 최신 뷰 (계약 v1.10: filled 포함)
// 한국 기준 최근 7일 이내의 지점·토성별 최신 1행
const since7d = add(today, -7);
const latestSoilMap = new Map();
for (const row of soil_water_daily) {
  if (row.date < since7d) continue;
  const key = `${row.stn_id}:${row.soil_code}`;
  const prev = latestSoilMap.get(key);
  if (!prev || prev.date < row.date) {
    latestSoilMap.set(key, {
      stn_id: row.stn_id,
      soil_code: row.soil_code,
      date: row.date,
      dr_mm: row.dr_mm,
      taw_mm: row.taw_mm,
      raw_mm: row.raw_mm,
      aw_pct: row.aw_pct,
      status: row.status,
      filled: row.filled,
    });
  }
}
const soil_water_latest = [...latestSoilMap.values()];

// 적산온도 (온도 화면). 지점마다 어제의 [올해 누적, 평년 누적, 며칠 빠른가]를 정해 두고,
// 1년 모양은 같은 곡선을 늘리고 줄인다. 춘천은 4,165 / 3,973 (+192), 수원은 다음 단계(2,500)에 아직 못 닿음.
const HEAT = {
  101: [4165, 3973, 20],
  216: [2700, 2650, null],
  119: [2200, 2100, 6],
  131: [2300, 2210, 5],
  129: [2100, 2050, 2],
  146: [2400, 2310, 4],
  156: [2350, 2400, -3],
  136: [2250, 2150, 5],
  192: [2380, 2300, 4],
  189: [2900, 2750, 7],
  108: [2320, 2240, 3],
};
const yesterday = add(today, -1);
// heat-sun 이 매일 09:20(KST)에 올리는 시각 = 00:20Z (계약 v1.8). weather_daily 의 받은 시각(02:20)과 일부러 다르게 둔다.
const HEAT_SUN_UPDATED_AT = `${today}T00:20:05.000Z`;
const yearDays = [];
for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = add(d, 1)) {
  yearDays.push(d);
}
// 하루 적산온도 모양 (겨울 0, 여름 크게)
const shape = [];
let acc = 0;
yearDays.forEach((_, i) => {
  // 바닥(0.5)을 둔다: 1월 초에도 어제까지 누적이 0 이 되지 않아야 (어제 누적값으로 곡선을 늘리고 줄이므로) 나누기가 안 깨진다.
  acc += Math.max(0.5, 7 - 15 * Math.cos((2 * Math.PI * (i - 15)) / 365));
  shape.push(acc);
});
const yIdx = Math.max(0, yearDays.indexOf(yesterday));
const r1 = (v) => Math.round(v * 10) / 10;
const heat_daily = [];
for (const [stn_id, [cumY, normalY, lead]] of Object.entries(HEAT)) {
  const cutoff = stn_id === "189" ? add(today, -3) : yesterday;
  for (const crop_id of ["apple", "kimchi_cabbage", "common"]) {
    yearDays.forEach((date, i) => {
      const observed = date <= cutoff;
      const cum = observed ? r1((cumY * shape[i]) / shape[yIdx]) : null;
      heat_daily.push({
        stn_id,
        crop_id,
        date,
        t_base_c: crop_id === "common" ? 5 : 4,
        gdd_day: observed
          ? r1((cumY * (shape[i] - (shape[i - 1] ?? 0))) / shape[yIdx])
          : null,
        gdd_cum: cum,
        gdd_normal_cum: r1((normalY * shape[i]) / shape[yIdx]),
        lead_days: observed ? lead : null,
        normal_from: 2016,
        normal_to: 2025,
        filled: false,
        calc_version: "fake",
        updated_at: HEAT_SUN_UPDATED_AT,
      });
    });
  }
}

// 적산일사 (햇빛 화면). 지점마다 어제의 [올해 누적, 평년 누적]을 정해 두고, 달마다 올해/평년 비율을 달리한다
// (3월이 가장 적음). 춘천은 3,218 / 3,352 (96%). 진주(192)는 줄이 없다 = 햇빛을 재지 않는 지점.
const SUN = {
  101: [3218, 3352],
  216: [3500, 3333],
  119: [3351, 3419],
  131: [3487, 3453],
  129: [3251, 3352],
  146: [3385, 3419],
  156: [3556, 3453],
  136: [3660, 3520],
  189: [2993, 3184],
  // 홍천(212): 사전(measures_sunlight)은 '확인 안 됨'(null)이지만 DB 에는 자료가 있다 (자료 상자는 DB 기준)
  212: [3100, 3200],
  108: [3400, 3320],
};
const SUN_MONTH = [
  1.03, 0.98, 0.85, 1.02, 1.05, 0.96, 0.91, 1.03, 1, 1.04, 1, 1,
];
const sunNormalDay = yearDays.map(
  (_, i) => 12 + 6 * Math.cos((2 * Math.PI * (i - 172)) / 365),
);
const sunYearDay = yearDays.map(
  (d, i) => sunNormalDay[i] * SUN_MONTH[Number(d.slice(5, 7)) - 1],
);
const sumTo = (arr, n) => arr.slice(0, n + 1).reduce((a, b) => a + b, 0);
const sun_daily = [];
for (const [stn_id, [cumY, normalY]] of Object.entries(SUN)) {
  const cutoff = stn_id === "189" ? add(today, -3) : yesterday;
  const fy = cumY / sumTo(sunYearDay, yIdx);
  const fn = normalY / sumTo(sunNormalDay, yIdx);
  let cy = 0;
  let cn = 0;
  yearDays.forEach((date, i) => {
    const observed = date <= cutoff;
    const dy = observed ? sunYearDay[i] * fy : null;
    const dn = sunNormalDay[i] * fn;
    if (dy != null) cy += dy;
    cn += dn;
    sun_daily.push({
      stn_id,
      date,
      rs_day_mj: dy == null ? null : r1(dy),
      rs_cum_mj: dy == null ? null : r1(cy),
      rs_normal_day_mj: r1(dn),
      rs_normal_cum_mj: r1(cn),
      normal_from: 2016,
      normal_to: 2025,
      filled: false,
      calc_version: "fake",
      updated_at: HEAT_SUN_UPDATED_AT,
    });
  });
}

// 울진(130): 일사 미측정 7곳 유형(sun_daily 365줄이 모두 null & filled=true) 재현
for (const date of yearDays) {
  sun_daily.push({
    stn_id: "130",
    date,
    rs_day_mj: null,
    rs_cum_mj: null,
    rs_normal_day_mj: null,
    rs_normal_cum_mj: null,
    normal_from: 2016,
    normal_to: 2025,
    filled: true,
    calc_version: "fake",
    updated_at: HEAT_SUN_UPDATED_AT,
  });
}

// 적산 계열 새 표 (결정 0063 · 0072). 옛 표 값과 같은 숫자를 계열 키(기준온도 · 누적 시작)로 옮긴다.
// 사과 (4, 01-01) · 배추 = 작물 공통 (5, 01-01) · 일사 01-01. 배추와 공통은 같은 계열이라 한 벌만 둔다.
// 포도 비가림 (10, 04-20) 줄은 화면이 아직 안 읽으므로 두지 않는다 (G1).
const heat_series_daily = heat_daily
  .filter((r) => r.crop_id === "apple" || r.crop_id === "common")
  .map((r) => {
    const row = { ...r, cum_start_mmdd: "01-01" };
    delete row.crop_id; // 새 표에는 작물 열이 없다
    return row;
  });
const sun_series_daily = sun_daily.map((r) => ({
  ...r,
  cum_start_mmdd: "01-01",
}));
// 계열 목록 뷰 (crop_accum_series). 운영 뷰의 5줄과 같은 모양. 숫자는 문자로 와도(4.0) 화면이 수로 읽는다.
const crop_accum_series = [
  {
    crop_id: "apple",
    season_type_id: "apple-main",
    heat_t_base_c: 4,
    heat_cum_start_mmdd: "01-01",
    sun_cum_start_mmdd: "01-01",
  },
  {
    crop_id: "kimchi_cabbage",
    season_type_id: "kimchi_cabbage-summer",
    heat_t_base_c: 5,
    heat_cum_start_mmdd: "01-01",
    sun_cum_start_mmdd: "01-01",
  },
  {
    crop_id: "grape",
    season_type_id: "grape-rainshelter",
    heat_t_base_c: 10,
    heat_cum_start_mmdd: "04-20",
    sun_cum_start_mmdd: "04-20",
  },
  {
    crop_id: "grape",
    season_type_id: "grape-heated",
    heat_t_base_c: null,
    heat_cum_start_mmdd: null,
    sun_cum_start_mmdd: "01-01",
  },
  {
    crop_id: "common",
    season_type_id: null,
    heat_t_base_c: 5,
    heat_cum_start_mmdd: "01-01",
    sun_cum_start_mmdd: "01-01",
  },
];

// 옛 표는 화면이 읽으면 안 된다 (결정 0072): 읽으면 오류를 돌려줘 e2e 가 깨지게 한다.
const OLD_TABLES = new Set(["heat_daily", "sun_daily"]);

const TABLES = {
  stations,
  crops,
  soil_types,
  soil_water_daily,
  soil_water_latest,
  heat_series_daily,
  sun_series_daily,
  crop_accum_series,
  weather_daily,
  crop_kc_sets: kcSets,
  scenarios,
  forecast_runs,
  water_outlook,
  water_outlook_summary,
  water_balance_daily: balance,
};

function filter(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    out = out.filter((r) => {
      const x = r[k] == null ? null : String(r[k]);
      if (op === "eq") return x === val;
      if (op === "neq") return x !== val;
      if (op === "lte") return x != null && x <= val;
      if (op === "gte") return x != null && x >= val;
      if (op === "in") {
        const list = val.replace(/^\(|\)$/g, "").split(",");
        return list.map((v) => v.replace(/"/g, "")).includes(x);
      }
      return true;
    });
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort(
      (a, b) =>
        (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) *
        (dir === "desc" ? -1 : 1),
    );
  }
  const limit = params.get("limit");
  return limit ? out.slice(0, Number(limit)) : out;
}

// ── 로그인 흉내 (이슈 #182, 결정 0061) ──────────────────────────────────────────────
// 실제 Supabase Auth 의 PKCE 흐름을 흉내 낸다: /auth/v1/authorize → (우리) /auth/callback?code → /auth/v1/token → 세션.
// 토큰은 실행할 때 만든다(소스에 JWT 모양 글자를 적지 않는다 — 비밀 검사 오탐 방지). 서명 방식은 HS256 흉내라서
// supabase-js 의 getClaims() 가 공개 열쇠(JWKS) 대신 /auth/v1/user 로 확인한다. 실제 서명 방식(비대칭 열쇠) 확인은 L3 실제 로그인 때.
// 시험이 /__fake/scenario 로 다음 로그인의 결과를 정하고, /__fake/calls 로 호출 횟수를 본다.
// 동의 판 (이슈 #191, 결정 0065): 서버(src/domain/legal.ts)가 지금 받아 주는 판과 같아야 한다. 어긋나면 legal.test.ts 의 확인이 알려 준다.
const CURRENT_TERMS = "terms-2027-01-01";
const CURRENT_PRIVACY = "privacy-2027-01-01";
// "같은 사용자로 로그인"(sameUser)할 때의 회원 번호 — 다른 "기기"(새 브라우저 문맥)에서 같은 계정으로 로그인하는 시험에 쓴다.
const SAME_USER_ID = "00000000-0000-4000-8000-0000000000a1";
const LEGACY_TERMS = "terms-2026-01-01";
const LEGACY_PRIVACY = "privacy-2026-01-01";
/** 기록이 없는 회원의 동의 판: consentMode 가 정한다. */
function defaultConsent() {
  if (authState.consentMode === "done")
    return { terms: CURRENT_TERMS, privacy: CURRENT_PRIVACY };
  if (authState.consentMode === "legacy")
    return { terms: LEGACY_TERMS, privacy: LEGACY_PRIVACY };
  return { terms: null, privacy: null };
}
const authState = {
  scenario: "ok", // ok | cancel | provider-error | no-code | exchange-fail
  ensure: "ok", // ok | fail  (public.ensure_my_member 호출 결과)
  // 동의 흉내. 기본 "done" = 새 회원도 지금 판으로 동의한 것으로 읽힘(기존 시험이 그대로 통과). "needed" = 새 회원은 동의 전.
  // done = 지금 판으로 동의 · needed = 동의 전(첫 동의) · legacy = 예전 판에 동의했던 회원(이슈 #199, 약관이 바뀌어 다시 묻는 중)
  consentMode: "done", // done | needed | legacy
  membersRead: "ok", // ok | fail  (GET /rest/v1/members 결과)
  consentSave: "ok", // ok | fail  (rpc record_my_consent 결과)
  sameUser: false, // true 면 로그인마다 같은 회원 번호(다시 로그인 시험용)
  consents: new Map(), // user id -> { terms, privacy }
  consentCalls: 0,
  consentLast: null, // 마지막으로 기록된 { terms, privacy }
  // 화면 설정 계정 저장 흉내 (이슈 #193, 결정 0066): 회원 번호별 { layout, font_scale, theme } (없으면 null = 한 번도 저장 안 함)
  settings: new Map(),
  settingsWrite: "ok", // ok | fail  (PATCH /rest/v1/members 결과)
  settingsReads: 0, // GET /rest/v1/members?select=layout,… 횟수 (끔 · 비회원은 0 이어야 한다)
  settingsWrites: 0,
  settingsLast: null, // 마지막으로 쓴 줄 내용
  // 회원 정보 · 탈퇴 흉내 (이슈 #195, 결정 0067)
  email: "tester@example.invalid", // 로그인한 회원의 메일 (null 이면 메일 없음)
  identities: null, // null 이면 로그인한 공급자 하나. ["kakao", "google"] 처럼 정하면 그 목록 (카카오 회원번호는 KAKAO_ID)
  profileRead: "ok", // ok | fail  (회원 정보 화면의 읽기만 실패 — 동의 확인 읽기는 그대로, 관문에 안 걸리게)
  profile: {}, // 회원 정보 줄을 덮어쓸 값 { display_name, provider, created_at, ... }
  withdrawMode: "ok", // ok | fail  (rpc delete_my_account 결과)
  kakaoUnlink: "ok", // ok | fail  (카카오 연결 끊기 흉내의 결과)
  // 탈퇴 재인증 · 구글 취소 · 네이버 삭제 흉내 (이슈 #197, 결정 0068)
  reauthOther: false, // true 면 탈퇴 재인증(redirect_to 에 flow=withdraw)으로 로그인한 사람이 "다른 계정"이 된다
  providerToken: "on", // on | off  (토큰 응답에 provider_token 을 싣는가 — 사용자 지정 공급자가 안 주는 경우 흉내)
  googleRevoke: "ok", // ok | fail  (구글 토큰 취소 결과)
  naverDelete: "ok", // ok | fail  (네이버 토큰 삭제 결과 — 실패는 HTTP 200 안의 오류 본문으로 흉내)
  lastProviderToken: null, // 마지막으로 내려 준 공급자 토큰
  googleRevokes: [], // { token, contentType }
  naverDeletes: [], // { contentType, params }
  authorizeCalls: [], // { provider, prompt, authType, flow }
  withdrawCalls: 0,
  withdrawn: [], // 탈퇴한 회원 번호
  kakaoUnlinkCalls: [], // { authorization, body }
  authCalls: 0, // /auth/v1/* 호출 횟수 (쿠키 없는 방문이 Supabase 를 안 부르는지 확인용)
  ensureCalls: 0,
  codes: new Map(), // code -> provider
  tokens: new Map(), // access_token -> user
  refresh: new Map(), // refresh_token -> user
};
// 카카오 회원번호 흉내 (숫자). 로그인 정보의 identities 와 연결 끊기 요청 본문이 같은지 시험이 본다.
const KAKAO_ID = "4200000001";
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const access = [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({
      sub: user.id,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 3600,
      session_id: randomUUID(),
    }),
    randomBytes(24).toString("base64url"),
  ].join(".");
  const refreshToken = randomBytes(12).toString("base64url");
  authState.tokens.set(access, user);
  authState.refresh.set(refreshToken, user);
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refreshToken,
    user,
  };
}
const readText = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
const bearerUser = (req) =>
  authState.tokens.get(
    (req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""),
  );

/** 로그인 · 회원 줄 확인 흉내. 처리했으면 true. */
async function handleAuthRoutes(req, res, url) {
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const redirect = (location) => {
    res.writeHead(302, { location });
    res.end();
  };

  // 시험이 쓰는 조작 창
  if (url.pathname === "/__fake/scenario") {
    const body = await readBody(req);
    if (body.scenario) authState.scenario = body.scenario;
    if (body.ensure) authState.ensure = body.ensure;
    if (body.consentMode) authState.consentMode = body.consentMode;
    if (body.membersRead) authState.membersRead = body.membersRead;
    if (body.consentSave) authState.consentSave = body.consentSave;
    if (typeof body.sameUser === "boolean") authState.sameUser = body.sameUser;
    if (body.settingsWrite) authState.settingsWrite = body.settingsWrite;
    if (body.withdrawMode) authState.withdrawMode = body.withdrawMode;
    if (body.kakaoUnlink) authState.kakaoUnlink = body.kakaoUnlink;
    if ("email" in body) authState.email = body.email;
    if ("identities" in body) authState.identities = body.identities;
    if (body.profile) authState.profile = body.profile;
    if (body.profileRead) authState.profileRead = body.profileRead;
    if (typeof body.reauthOther === "boolean")
      authState.reauthOther = body.reauthOther;
    if (body.providerToken) authState.providerToken = body.providerToken;
    if (body.googleRevoke) authState.googleRevoke = body.googleRevoke;
    if (body.naverDelete) authState.naverDelete = body.naverDelete;
    // 같은 회원(sameUser)의 계정 설정을 미리 채운다 (다른 기기에서 저장해 둔 것처럼)
    if (body.settings) authState.settings.set(SAME_USER_ID, body.settings);
    json(200, { scenario: authState.scenario, ensure: authState.ensure });
    return true;
  }
  if (url.pathname === "/__fake/reset") {
    authState.scenario = "ok";
    authState.ensure = "ok";
    authState.authCalls = 0;
    authState.ensureCalls = 0;
    authState.consentMode = "done";
    authState.membersRead = "ok";
    authState.consentSave = "ok";
    authState.sameUser = false;
    authState.consents = new Map();
    authState.consentCalls = 0;
    authState.consentLast = null;
    authState.settings = new Map();
    authState.settingsWrite = "ok";
    authState.settingsReads = 0;
    authState.settingsWrites = 0;
    authState.settingsLast = null;
    authState.email = "tester@example.invalid";
    authState.identities = null;
    authState.profile = {};
    authState.profileRead = "ok";
    authState.reauthOther = false;
    authState.providerToken = "on";
    authState.googleRevoke = "ok";
    authState.naverDelete = "ok";
    authState.lastProviderToken = null;
    authState.googleRevokes = [];
    authState.naverDeletes = [];
    authState.authorizeCalls = [];
    authState.withdrawMode = "ok";
    authState.kakaoUnlink = "ok";
    authState.withdrawCalls = 0;
    authState.withdrawn = [];
    authState.kakaoUnlinkCalls = [];
    json(200, { ok: true });
    return true;
  }
  if (url.pathname === "/__fake/calls") {
    json(200, {
      auth: authState.authCalls,
      ensure: authState.ensureCalls,
      consent: authState.consentCalls,
      consentLast: authState.consentLast,
      settingsReads: authState.settingsReads,
      settingsWrites: authState.settingsWrites,
      settingsLast: authState.settingsLast,
      settings: Object.fromEntries(authState.settings),
      withdrawCalls: authState.withdrawCalls,
      withdrawn: authState.withdrawn,
      kakaoUnlinkCalls: authState.kakaoUnlinkCalls,
      kakaoId: KAKAO_ID,
      reauth: {
        lastProviderToken: authState.lastProviderToken,
        googleRevokes: authState.googleRevokes,
        naverDeletes: authState.naverDeletes,
        authorizeCalls: authState.authorizeCalls,
      },
    });
    return true;
  }

  // 자기 members 줄의 동의 판 두 열 (supabase-js maybeSingle 은 배열을 받아 0줄이면 null)
  if (url.pathname === "/rest/v1/members" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(401, { code: "42501", message: "로그인이 필요합니다 (가짜)" });
      return true;
    }
    if (authState.membersRead === "fail") {
      json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
      return true;
    }
    // 화면 설정 세 열 읽기 (select 에 layout 이 있으면)
    if ((url.searchParams.get("select") ?? "").includes("layout")) {
      authState.settingsReads += 1;
      const s = authState.settings.get(user.id) ?? {};
      json(200, [
        {
          layout: s.layout ?? null,
          font_scale: s.font_scale ?? null,
          theme: s.theme ?? null,
        },
      ]);
      return true;
    }
    const saved = authState.consents.get(user.id);
    // 회원 정보 화면의 읽기 (select 에 display_name 이 있으면)
    if ((url.searchParams.get("select") ?? "").includes("display_name")) {
      if (authState.profileRead === "fail") {
        json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
        return true;
      }
      const dflt = defaultConsent();
      const tv = saved ? saved.terms : dflt.terms;
      const pv = saved ? saved.privacy : dflt.privacy;
      json(200, [
        {
          display_name: "가짜별명",
          provider: user.app_metadata.provider,
          created_at: "2026-08-12T01:00:00Z",
          terms_version: tv,
          terms_agreed_at: tv ? "2026-08-12T01:00:00Z" : null,
          privacy_version: pv,
          privacy_confirmed_at: pv ? "2026-08-12T01:00:00Z" : null,
          ...authState.profile,
        },
      ]);
      return true;
    }
    const dflt = defaultConsent();
    const row = saved
      ? { terms_version: saved.terms, privacy_version: saved.privacy }
      : { terms_version: dflt.terms, privacy_version: dflt.privacy };
    json(200, [row]);
    return true;
  }

  // 화면 설정 쓰기: PATCH /rest/v1/members?user_id=eq.<회원 번호>  (supabase-js update().eq().select())
  if (url.pathname === "/rest/v1/members" && req.method === "PATCH") {
    const user = bearerUser(req);
    if (!user) {
      json(401, { code: "42501", message: "로그인이 필요합니다 (가짜)" });
      return true;
    }
    const body = await readBody(req);
    authState.settingsWrites += 1;
    if (authState.settingsWrite === "fail") {
      json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
      return true;
    }
    // 자기 줄만 (RLS 흉내): user_id=eq.<내 번호> 가 아니면 0줄
    const target = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
    if (target !== user.id) {
      json(200, []);
      return true;
    }
    authState.settings.set(user.id, {
      ...(authState.settings.get(user.id) ?? {}),
      ...body,
    });
    authState.settingsLast = body;
    json(200, [{ user_id: user.id }]);
    return true;
  }

  if (url.pathname === "/rest/v1/rpc/record_my_consent") {
    const user = bearerUser(req);
    if (!user) {
      json(401, { code: "28000", message: "로그인이 필요합니다 (가짜)" });
      return true;
    }
    const body = await readBody(req);
    authState.consentCalls += 1;
    if (authState.consentSave === "fail") {
      json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
      return true;
    }
    authState.consentLast = {
      terms: body.p_terms_version,
      privacy: body.p_privacy_version,
    };
    authState.consents.set(user.id, authState.consentLast);
    res.writeHead(204);
    res.end();
    return true;
  }

  // 회원 탈퇴: 호출 횟수를 세고, 성공하면 그 회원의 로그인 · 설정 · 동의를 지운다(진짜 auth.users 삭제 흉내)
  if (url.pathname === "/rest/v1/rpc/delete_my_account") {
    const user = bearerUser(req);
    if (!user) {
      json(401, { code: "42501", message: "로그인이 필요합니다 (가짜)" });
      return true;
    }
    authState.withdrawCalls += 1;
    if (authState.withdrawMode === "fail") {
      json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
      return true;
    }
    authState.withdrawn.push(user.id);
    for (const [k, v] of authState.tokens)
      if (v.id === user.id) authState.tokens.delete(k);
    for (const [k, v] of authState.refresh)
      if (v.id === user.id) authState.refresh.delete(k);
    authState.settings.delete(user.id);
    authState.consents.delete(user.id);
    res.writeHead(204);
    res.end();
    return true;
  }

  // 구글 토큰 취소 흉내 (GOOGLE_API_BASE 를 이 가짜로 가리킨 서버만 부른다): POST /revoke, form 본문 token=
  if (url.pathname === "/revoke" && req.method === "POST") {
    const form = new URLSearchParams(await readText(req));
    authState.googleRevokes.push({
      token: form.get("token") ?? "",
      contentType: req.headers["content-type"] ?? "",
    });
    if (authState.googleRevoke === "fail") {
      json(400, { error: "invalid_token" });
      return true;
    }
    json(200, {});
    return true;
  }

  // 네이버 토큰 삭제 흉내 (NAVER_API_BASE): POST /oauth2.0/token, form 본문 grant_type=delete…
  if (url.pathname === "/oauth2.0/token" && req.method === "POST") {
    const form = new URLSearchParams(await readText(req));
    authState.naverDeletes.push({
      contentType: req.headers["content-type"] ?? "",
      params: Object.fromEntries(form),
    });
    if (authState.naverDelete === "fail") {
      json(200, { error: "invalid_request", error_description: "fake" });
      return true;
    }
    json(200, {
      access_token: form.get("access_token") ?? "",
      result: "success",
    });
    return true;
  }

  // 카카오 연결 끊기 흉내 (KAKAO_API_BASE 를 이 가짜로 가리킨 서버만 부른다). 요청 모양을 그대로 적어 둔다.
  if (url.pathname === "/v1/user/unlink" && req.method === "POST") {
    const body = await readText(req);
    authState.kakaoUnlinkCalls.push({
      authorization: req.headers.authorization ?? "",
      contentType: req.headers["content-type"] ?? "",
      body,
    });
    if (authState.kakaoUnlink === "fail") {
      json(401, { msg: "가짜 오류 (화면 테스트)", code: -401 });
      return true;
    }
    json(200, { id: Number(KAKAO_ID) });
    return true;
  }

  if (url.pathname === "/rest/v1/rpc/ensure_my_member") {
    if (!bearerUser(req)) {
      json(401, { code: "42501", message: "로그인이 필요합니다 (가짜)" });
      return true;
    }
    authState.ensureCalls += 1;
    if (authState.ensure === "fail") {
      json(500, { code: "XX000", message: "가짜 오류 (화면 테스트)" });
      return true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }

  if (!url.pathname.startsWith("/auth/v1/")) return false;
  authState.authCalls += 1;
  const route = url.pathname.slice("/auth/v1/".length);

  if (route === "authorize") {
    const back = url.searchParams.get("redirect_to") ?? "";
    const sep = back.includes("?") ? "&" : "?";
    const provider = url.searchParams.get("provider") ?? "";
    // 재인증 확인: 어떤 공급자 · 어떤 옵션(prompt · auth_type)으로 시작했나, 탈퇴 재인증(flow=withdraw)인가
    const isWithdrawFlow = /[?&]flow=withdraw(&|$)/.test(back);
    authState.authorizeCalls.push({
      provider,
      prompt: url.searchParams.get("prompt"),
      authType: url.searchParams.get("auth_type"),
      flow: isWithdrawFlow ? "withdraw" : null,
    });
    if (authState.scenario === "cancel") {
      return (
        redirect(
          `${back}${sep}error=access_denied&error_code=access_denied&error_description=${encodeURIComponent("User denied access")}`,
        ),
        true
      );
    }
    if (authState.scenario === "provider-error") {
      return (
        redirect(
          `${back}${sep}error=server_error&error_description=${encodeURIComponent("provider boom")}`,
        ),
        true
      );
    }
    if (authState.scenario === "no-code") return (redirect(back), true);
    const code = `fake-${randomBytes(8).toString("hex")}`;
    authState.codes.set(code, {
      provider,
      other: isWithdrawFlow && authState.reauthOther,
    });
    return (redirect(`${back}${sep}code=${code}`), true);
  }

  if (route === "token") {
    const grant = url.searchParams.get("grant_type");
    const body = await readBody(req);
    if (grant === "pkce") {
      if (
        authState.scenario === "exchange-fail" ||
        !authState.codes.has(body.auth_code)
      ) {
        json(400, {
          code: 400,
          error_code: "flow_state_not_found",
          msg: "가짜 오류 (화면 테스트)",
        });
        return true;
      }
      const { provider, other } = authState.codes.get(body.auth_code);
      authState.codes.delete(body.auth_code);
      const user = {
        id: !other && authState.sameUser ? SAME_USER_ID : randomUUID(),
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider },
        user_metadata: {},
        created_at: new Date().toISOString(),
        ...(authState.email ? { email: authState.email } : {}),
        identities: (authState.identities ?? [provider]).map((p) => ({
          provider: p,
          id: p === "kakao" ? KAKAO_ID : randomUUID(),
          identity_data:
            p === "kakao" ? { provider_id: KAKAO_ID, sub: KAKAO_ID } : {},
        })),
      };
      const session = makeSession(user);
      // 공급자 토큰은 로그인 직후 한 번만 준다 (Supabase 와 같음). 끄면(사용자 지정 공급자 흉내) 필드를 싣지 않는다.
      if (authState.providerToken !== "off") {
        authState.lastProviderToken = `fake-provider-token-${randomBytes(6).toString("hex")}`;
        session.provider_token = authState.lastProviderToken;
      }
      json(200, session);
      return true;
    }
    if (grant === "refresh_token") {
      const user = authState.refresh.get(body.refresh_token);
      if (!user) {
        json(400, {
          code: 400,
          error_code: "refresh_token_not_found",
          msg: "없는 토큰",
        });
        return true;
      }
      json(200, makeSession(user));
      return true;
    }
    json(400, {
      code: 400,
      error_code: "validation_failed",
      msg: "지원하지 않는 방식",
    });
    return true;
  }

  if (route === "user") {
    const user = bearerUser(req);
    if (!user) {
      json(401, {
        code: 401,
        error_code: "bad_jwt",
        msg: "토큰이 올바르지 않습니다 (가짜)",
      });
      return true;
    }
    json(200, user);
    return true;
  }

  if (route === "logout") {
    res.writeHead(204);
    res.end();
    return true;
  }

  json(404, {
    code: 404,
    error_code: "not_found",
    msg: `가짜에 없는 길 ${route}`,
  });
  return true;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") return send(200, { ok: true });
    if (await handleAuthRoutes(req, res, url)) return;
    const table = url.pathname.replace("/rest/v1/", "");
    // 태백(216)만 묻는 읽기는 일부러 오류 (여러 지점을 한꺼번에 묻는 읽기는 정상)
    if (/eq\.216\b|eq\.216-/.test(decodeURIComponent(url.search))) {
      return send(500, { message: "가짜 오류 (화면 테스트)" });
    }
    if (OLD_TABLES.has(table)) {
      return send(500, {
        message: `옛 표 ${table} 는 화면이 읽지 않는다 (결정 0072)`,
      });
    }
    const rows = TABLES[table];
    if (!rows) return send(404, { message: `없는 표 ${table}` });
    const out = filter(rows, url.searchParams);
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      return out.length === 1
        ? send(200, out[0])
        : send(406, { message: "행 수가 1이 아님" });
    }
    return send(200, out);
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`가짜 Supabase ${PORT} (오늘 ${today})`),
  );
