import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOCK_STATIONS } from "@/mocks/stations";

/**
 * 사전 자료(supabase/migrations/20261024010000_seed_dictionaries.sql)가
 * 데이터 계약 v1(docs/DATA_CONTRACT.md)의 값과 규칙대로 들어가는지 검사한다.
 * 계산 값(TAW, RAW, 작기 끝)은 FAO-56 식으로 다시 계산해 같은지 본다.
 */

const SEED = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261024010000_seed_dictionaries.sql",
  ),
  "utf8",
);

type Value = string | number | boolean | null;
type Row = Record<string, Value>;

/** "( 'a', 1.5, null, true )" 한 줄을 값 목록으로 바꾼다. */
function parseTuple(text: string): Value[] {
  const values: Value[] = [];
  let i = 0;
  const s = text
    .trim()
    .replace(/^\(/, "")
    .replace(/\)\s*,?\s*;?$/, "");
  while (i < s.length) {
    while (s[i] === " " || s[i] === ",") i++;
    if (i >= s.length) break;
    if (s[i] === "'") {
      let out = "";
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          out += "'";
          i += 2;
        } else if (s[i] === "'") {
          i++;
          break;
        } else {
          out += s[i++];
        }
      }
      values.push(out);
    } else {
      let j = i;
      while (j < s.length && s[j] !== ",") j++;
      const raw = s.slice(i, j).trim();
      i = j;
      if (raw === "null") values.push(null);
      else if (raw === "true") values.push(true);
      else if (raw === "false") values.push(false);
      else values.push(Number(raw));
    }
  }
  return values;
}

/** insert into public.<table> (열...) values (...), (...) on conflict ... 를 행 목록으로. */
function rowsOf(table: string): Row[] {
  const m = SEED.match(
    new RegExp(
      `insert into public\\.${table} \\(([^)]*)\\)\\s*values\\s*([\\s\\S]*?)\\non conflict`,
    ),
  );
  if (!m) return [];
  const cols = m[1].split(",").map((c) => c.trim());
  return m[2]
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => line.startsWith("("))
    .map((line) => {
      const vals = parseTuple(line);
      expect(vals, line).toHaveLength(cols.length);
      return Object.fromEntries(cols.map((c, k) => [c, vals[k]]));
    });
}

const stations = rowsOf("stations");
const crops = rowsOf("crops");
const seasons = rowsOf("crop_seasons");
const soils = rowsOf("soil_types");
const scenarios = rowsOf("scenarios");

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("사전 자료: 지점", () => {
  it("화면과 같은 10곳을 같은 순서로 넣는다", () => {
    const ids = [...stations]
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((r) => r.stn_id);
    expect(ids).toEqual(MOCK_STATIONS.map((s) => String(s.id)));
  });

  it("11/06 예보 수집은 춘천(101)만", () => {
    expect(stations.filter((r) => r.has_forecast).map((r) => r.stn_id)).toEqual(
      ["101"],
    );
  });

  it("춘천 예보 격자는 cropwater 와 같은 73·134", () => {
    const chuncheon = stations.find((r) => r.stn_id === "101");
    expect([chuncheon?.grid_nx, chuncheon?.grid_ny]).toEqual([73, 134]);
  });

  it("좌표는 한국 안, 풍속계 높이는 0보다 크다", () => {
    for (const r of stations) {
      expect(Number(r.lat)).toBeGreaterThan(33);
      expect(Number(r.lat)).toBeLessThan(39);
      expect(Number(r.lon)).toBeGreaterThan(124);
      expect(Number(r.lon)).toBeLessThan(132);
      expect(Number(r.wind_height_m)).toBeGreaterThan(0);
    }
  });
});

describe("사전 자료: 작물·작형", () => {
  it("작물은 사과와 김치배추", () => {
    expect(crops.map((r) => r.crop_id).sort()).toEqual([
      "apple",
      "kimchi_cabbage",
    ]);
  });

  it("작물마다 기본 작형이 하나", () => {
    for (const c of crops) {
      const defaults = seasons.filter(
        (s) => s.crop_id === c.crop_id && s.is_default,
      );
      expect(defaults, String(c.crop_id)).toHaveLength(1);
    }
  });

  it("기본 시작일: 사과 4월 1일, 여름배추(고랭지) 7월 1일", () => {
    const start = (id: string) =>
      seasons.find((s) => s.season_type_id === id)?.start_mmdd;
    expect(start("apple-main")).toBe("04-01");
    expect(start("kimchi_cabbage-summer")).toBe("07-01");
  });

  it("배추는 작형 4개, 여름 말고는 값을 비워 둔다", () => {
    const cabbage = seasons.filter((s) => s.crop_id === "kimchi_cabbage");
    expect(cabbage.map((s) => s.season_type_id).sort()).toEqual([
      "kimchi_cabbage-autumn",
      "kimchi_cabbage-spring",
      "kimchi_cabbage-summer",
      "kimchi_cabbage-winter",
    ]);
    for (const s of cabbage.filter(
      (s) => s.season_type_id !== "kimchi_cabbage-summer",
    )) {
      expect(s.start_mmdd).toBeNull();
      expect(s.l_ini_d).toBeNull();
    }
  });
});

describe("사전 자료: 토성", () => {
  it("12종, 기본은 양토 하나", () => {
    expect(soils).toHaveLength(12);
    expect(soils.filter((s) => s.is_default).map((s) => s.soil_code)).toEqual([
      "loam",
    ]);
  });

  it("Table 19 에 있는 9종은 범위 가운데 값, 없는 3종은 비워 둔다", () => {
    const empty = soils.filter((s) => s.fc === null).map((s) => s.soil_code);
    expect(empty.sort()).toEqual([
      "clay_loam",
      "sandy_clay",
      "sandy_clay_loam",
    ]);
    for (const s of soils.filter((s) => s.fc !== null)) {
      const mid = (a: Value, b: Value) => (Number(a) + Number(b)) / 2;
      expect(Number(s.fc)).toBeCloseTo(mid(s.fc_min, s.fc_max), 6);
      expect(Number(s.wp)).toBeCloseTo(mid(s.wp_min, s.wp_max), 6);
      expect(Number(s.wp)).toBeLessThan(Number(s.fc));
    }
  });

  it("양토는 FC 0.25 / WP 0.12", () => {
    const loam = soils.find((s) => s.soil_code === "loam");
    expect([loam?.fc, loam?.wp]).toEqual([0.25, 0.12]);
  });
});

describe("사전 자료: 기본 계산 조건", () => {
  it("지점 10곳 × 작물 2개 = 20개, 모두 양토·2026·기본 작형", () => {
    expect(scenarios).toHaveLength(20);
    for (const st of stations) {
      for (const c of crops) {
        const found = scenarios.filter(
          (s) => s.stn_id === st.stn_id && s.crop_id === c.crop_id,
        );
        expect(found, `${st.stn_id}-${c.crop_id}`).toHaveLength(1);
        const s = found[0];
        const season = seasons.find(
          (x) => x.crop_id === c.crop_id && x.is_default,
        );
        expect(s.season_type_id).toBe(season?.season_type_id);
        expect(s.soil_code).toBe("loam");
        expect(s.season_year).toBe(2026);
        expect(s.is_default).toBe(true);
        expect(s.scenario_id).toBe(
          `${st.stn_id}-${season?.season_type_id}-loam-2026`,
        );
      }
    }
  });

  it("TAW = 1000·(FC−WP)·Zr, RAW = p·TAW (FAO-56 식 82·83)", () => {
    for (const s of scenarios) {
      const crop = crops.find((c) => c.crop_id === s.crop_id)!;
      const soil = soils.find((x) => x.soil_code === s.soil_code)!;
      const taw =
        1000 * (Number(soil.fc) - Number(soil.wp)) * Number(crop.zr_m);
      expect(Number(s.taw_mm), String(s.scenario_id)).toBeCloseTo(taw, 6);
      expect(Number(s.raw_mm), String(s.scenario_id)).toBeCloseTo(
        Number(crop.p) * taw,
        6,
      );
    }
  });

  it("작기 시작 = 작형 기본 시작일, 끝 = 시작 + 생육단계 일수 합 − 1", () => {
    for (const s of scenarios) {
      const season = seasons.find(
        (x) => x.season_type_id === s.season_type_id,
      )!;
      const start = `${s.season_year}-${season.start_mmdd}`;
      const days =
        Number(season.l_ini_d) +
        Number(season.l_dev_d) +
        Number(season.l_mid_d) +
        Number(season.l_late_d);
      expect(s.season_start).toBe(start);
      expect(s.season_end).toBe(addDays(start, days - 1));
      expect(s.dr0_mm).toBe(0);
    }
  });

  it("계약서에 적은 작기 끝 날짜와 같다 (사과 10/27, 여름배추 9/28)", () => {
    const end = (crop: string) =>
      scenarios.find((s) => s.crop_id === crop)?.season_end;
    expect(end("apple")).toBe("2026-10-27");
    expect(end("kimchi_cabbage")).toBe("2026-09-28");
  });
});

describe("사전 자료: 여러 번 실행", () => {
  it.each(["stations", "crops", "crop_seasons", "soil_types", "scenarios"])(
    "%s 는 다시 넣어도 오류 없이 값만 고친다",
    (table) => {
      expect(SEED).toMatch(
        new RegExp(
          `insert into public\\.${table} [\\s\\S]*?on conflict \\([a-z_]+\\) do update set`,
        ),
      );
    },
  );
});
