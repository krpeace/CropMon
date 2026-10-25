// 화면 테스트용 가짜 Supabase (PostgREST 흉내). 값은 지어낸 것이다. 실제 농가·키 없음.
// 오늘(한국 날짜)을 기준으로 춘천(101) 사과·배추 자료를 만든다. 태백(216)은 일부러 오류를 돌려준다.
import http from "node:http";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const DAY = 86_400_000;
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));
const add = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

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

const scen = (kc, crop, start, end, taw, raw, stn = "101") => ({
  scenario_id: `${stn}-${crop}-${kc}-loam-${year}`,
  stn_id: stn,
  crop_id: crop,
  season_year: year,
  is_default: kc === "k3" || crop !== "apple",
  kc_set_id: `${crop}-${kc}`,
  taw_mm: taw,
  raw_mm: raw,
  season_start: `${year}-${start}`,
  season_end: `${year}-${end}`,
});
const scenarios = [
  scen("k3", "apple", "04-01", "11-15", 130, 65),
  scen("k1", "apple", "04-01", "11-15", 130, 65),
  scen("k1", "kimchi_cabbage", "06-01", "09-08", 65, 29.25),
  // 수원(119): 예보 회차 없이 관측 물수지만 (지역 칩은 마지막 관측 판정을 쓴다)
  scen("k3", "apple", "04-01", "11-15", 130, 65, "119"),
  // 진주(192): 예보 회차가 있지만 계수는 춘천 값을 빌려 쓰는 지점 (물6)
  scen("k3", "apple", "04-01", "11-15", 130, 65, "192"),
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
      filled: false,
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
];
const water_outlook = [];
const water_outlook_summary = [];
const RUN_OF = { 101: 1, 192: 2 }; // 예보 회차가 있는 지점
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
const weather_daily = ["101", "119"].map((stn_id) => ({
  stn_id,
  date: add(today, -1),
  fetched_at: new Date(Date.parse(runAt) + 20 * 60_000).toISOString(), // 02:20
}));

const TABLES = {
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

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") return send(200, { ok: true });
    const table = url.pathname.replace("/rest/v1/", "");
    // 태백(216)만 묻는 읽기는 일부러 오류 (여러 지점을 한꺼번에 묻는 읽기는 정상)
    if (/eq\.216\b|eq\.216-/.test(decodeURIComponent(url.search))) {
      return send(500, { message: "가짜 오류 (화면 테스트)" });
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
