import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WATER_STATUSES } from "@/domain/water-status";

/**
 * 계약서(docs/DATA_CONTRACT.md)와 마이그레이션(supabase/migrations/)이 따로 놀지 않는지 검사한다.
 * - 계약서의 테이블 목록 = 마이그레이션이 만드는 테이블 목록
 * - 모든 테이블에 RLS, 읽기 정책이 있고 쓰기 권한·쓰기 정책이 없다
 * - 판정 상태 이름이 화면(src/domain/water-status.ts)과 같다
 */

const ROOT = process.cwd();
const CONTRACT = readFileSync(join(ROOT, "docs/DATA_CONTRACT.md"), "utf8");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

/** 주석(-- ...)을 지우고 소문자로 바꾼 SQL 전체. */
const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
  .join("\n")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

/** 연결 확인용 표. 계산 결과가 아니라서 공개 테이블(v1 9개 + v1.1 1개 + v1.3 1개 + v1.4 2개 + v1.5 1개)과 따로 센다. */
const HEALTH_TABLE = "app_health";

const PUBLIC_TABLES = [
  "stations",
  "crops",
  "crop_seasons",
  "soil_types",
  "crop_kc_sets",
  "scenarios",
  "forecast_runs",
  "weather_daily",
  "water_balance_daily",
  "water_outlook",
  "water_outlook_summary",
  "heat_daily",
  "sun_daily",
  "soil_water_daily",
] as const;

function tablesInContract(): string[] {
  // "### `public.stations`" 모양의 제목
  return [...CONTRACT.matchAll(/^###\s+`public\.([a-z_]+)`/gm)].map(
    (m) => m[1],
  );
}

function tablesInSql(): string[] {
  return [
    ...SQL.matchAll(/create table if not exists public\.([a-z_]+)\s*\(/g),
  ].map((m) => m[1]);
}

describe("데이터 계약과 마이그레이션", () => {
  it("계약서에 공개 테이블 14개와 app_health 가 있다", () => {
    expect(tablesInContract().sort()).toEqual(
      [...PUBLIC_TABLES, HEALTH_TABLE].sort(),
    );
  });

  it("마이그레이션이 만드는 테이블이 계약서의 테이블과 같다", () => {
    expect(tablesInSql().sort()).toEqual(tablesInContract().sort());
  });

  it("계약서의 현재 버전이 v1.7 이다", () => {
    expect(CONTRACT).toMatch(/## 현재 버전: v1\.7\b/);
  });

  it("지점 사전에 시도·대표 여부·운영 여부·일사 관측·동기화 시각 열이 있다 (v1.6)", () => {
    expect(SQL).toMatch(
      /alter table public\.stations\s+add column if not exists sido text/,
    );
    expect(SQL).toMatch(
      /alter table public\.stations\s+add column if not exists is_representative boolean not null default false/,
    );
    expect(SQL).toMatch(
      /alter table public\.stations\s+add column if not exists is_active boolean not null default true/,
    );
    expect(SQL).toMatch(
      /alter table public\.stations\s+add column if not exists measures_sunlight boolean/,
    );
    expect(SQL).toMatch(
      /alter table public\.stations\s+add column if not exists synced_at timestamptz/,
    );
    for (const col of [
      "sido",
      "is_representative",
      "is_active",
      "measures_sunlight",
      "synced_at",
    ]) {
      expect(CONTRACT).toContain(`\`${col}\``);
    }
  });

  const bodyOf = (table: string) =>
    SQL.match(
      new RegExp(
        `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
      ),
    )?.[1];

  it("작물 공통 물 상태는 지점 × 토성 × 날짜, 6가지 상태 코드 (v1.5)", () => {
    const soilWater = bodyOf("soil_water_daily");
    expect(soilWater).toBeDefined();
    expect(soilWater).toMatch(/primary key \(stn_id, soil_code, date\)/);
    for (const c of [
      "eto_mm",
      "rain_mm",
      "eto_7d_mm",
      "rain_7d_mm",
      "dp_mm",
      "dr_mm",
      "taw_mm",
      "raw_mm",
      "aw_pct",
      "status",
      "days_to_dry",
      "filled",
      "calc_version",
      "updated_at",
    ]) {
      expect(soilWater).toContain(c);
    }
    const codes = soilWater
      ?.match(/status in \(([^)]*)\)/)?.[1]
      .split(",")
      .map((x) => x.trim().replace(/'/g, ""))
      .sort();
    expect(codes).toEqual(
      ["winter", "pool", "ample", "fair", "dry", "very_dry"].sort(),
    );
  });

  it("토성 사전에 is_estimated 열이 있다 (v1.5)", () => {
    expect(SQL).toMatch(
      /alter table public\.soil_types\s+add column if not exists is_estimated boolean not null default false/,
    );
  });

  it("추정 토성 3종과 작물 공통(common)이 시드에 있다 (v1.5)", () => {
    for (const code of ["sandy_clay_loam", "clay_loam", "sandy_clay"]) {
      expect(SQL).toContain(code);
    }
    expect(SQL).toContain("common");
    expect(SQL).toContain("작물 공통");
  });

  it("적산온도는 지점 × 작물 × 날짜, 적산일사는 지점 × 날짜 (v1.4)", () => {
    const heat = bodyOf("heat_daily");
    const sun = bodyOf("sun_daily");
    expect(heat).toMatch(/primary key \(stn_id, crop_id, date\)/);
    expect(sun).toMatch(/primary key \(stn_id, date\)/);
    for (const c of ["gdd_cum", "gdd_normal_cum", "lead_days", "t_base_c"]) {
      expect(heat).toContain(c);
    }
    for (const c of ["rs_cum_mj", "rs_normal_cum_mj"]) expect(sun).toContain(c);
    // 평년 기간을 줄마다 남긴다 (2016–2025 같은 기간을 화면에 적기 위해)
    for (const b of [heat, sun]) {
      expect(b).toMatch(/normal_from int not null/);
      expect(b).toMatch(/normal_to int not null/);
    }
  });

  it("작물 사전에 적산온도 기준온도와 단계가 있다 (v1.4)", () => {
    expect(SQL).toMatch(
      /alter table public\.crops\s+add column if not exists t_base_c numeric/,
    );
    expect(SQL).toMatch(
      /alter table public\.crops\s+add column if not exists gdd_stages int\[\]/,
    );
  });

  it("3일 전망 요약은 회차 × 계산 조건마다 한 줄, 예상일은 0 이상 (v1.3)", () => {
    const body = SQL.match(
      /create table if not exists public\.water_outlook_summary\s*\(([\s\S]*?)\n\);/,
    )?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/primary key \(run_id, scenario_id\)/);
    expect(body).toMatch(
      /horizon_days int not null check \(horizon_days >= 1\)/,
    );
    for (const c of ["need_center_in", "need_early_in", "need_late_in"]) {
      expect(body).toContain(`${c} int check (${c} >= 0)`);
    }
    const codes = body
      ?.match(/status_start in \(([^)]*)\)/)?.[1]
      .split(",")
      .map((x) => x.trim().replace(/'/g, ""))
      .sort();
    expect(codes).toEqual([...WATER_STATUSES].sort());
  });

  it("3일 전망 요약 status_start 설명에 휴면기 판정 기준(회차 발표 날짜)이 기술되어 있다", () => {
    expect(CONTRACT).toContain("휴면기는 회차 발표 날짜 기준");
    expect(CONTRACT).toContain(
      "3일 전망 요약(`status_start`)의 휴면기는 회차 발표 날짜(한국 날짜)의 Kc로 판정합니다. 작기 마지막 다음 날 아침에 관수를 권하거나, 작기 첫날 아침에 휴면기로 나오는 하루 어긋남을 막기 위해서입니다 (croplib-dp 결정 0015).",
    );
    expect(CONTRACT).toContain(
      "(구조 그대로, 문구만) `status_start` 휴면기 판정 기준 = 회차 발표 날짜",
    );
  });

  it("3일 전망의 선행일은 0~4 (아침 D+0~D+3, 저녁 D+1~D+4, v1.2)", () => {
    const checks = [
      ...SQL.matchAll(/check \(lead_day between (\d) and (\d)\)/g),
    ];
    expect(checks.at(-1)?.slice(1, 3)).toEqual(["0", "4"]); // 마지막에 실행되는 제약이 남는다
    expect(SQL).toContain(
      "alter table public.water_outlook drop constraint if exists water_outlook_lead_day_check",
    );
  });

  it("원자료 Storage 버킷 raw 는 비공개로 만든다 (v1.2)", () => {
    expect(SQL).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s+values \('raw', 'raw', false\)/,
    );
    expect(SQL).toMatch(/on conflict \(id\) do update set public = false/);
  });

  it("계산 조건은 재배 방식(kc_set_id)을 반드시 가리킨다 (v1.1)", () => {
    expect(SQL).toMatch(
      /alter table public\.scenarios\s+add column if not exists kc_set_id text references public\.crop_kc_sets \(kc_set_id\)/,
    );
    expect(SQL).toMatch(
      /alter table public\.scenarios\s+alter column kc_set_id set not null/,
    );
  });

  describe.each([...PUBLIC_TABLES, HEALTH_TABLE])("public.%s", (table) => {
    it("RLS 를 켠다", () => {
      expect(SQL).toContain(
        `alter table public.${table} enable row level security`,
      );
    });

    it("비회원·회원에게 읽기 정책이 있다", () => {
      const policy = new RegExp(
        `create policy "[^"]+"\\s+on public\\.${table}\\s+for select\\s+to anon, authenticated\\s+using \\(true\\)`,
      );
      expect(SQL).toMatch(policy);
    });

    it("쓰기 정책이 없다", () => {
      const write = new RegExp(
        `create policy "[^"]+"\\s+on public\\.${table}\\s+for (insert|update|delete|all)`,
      );
      expect(SQL).not.toMatch(write);
    });

    it("비회원·회원은 읽기 권한만 받는다", () => {
      const grantSelect = new RegExp(
        `grant select\\s*(\\([^)]*\\))?\\s*on public\\.${table} to anon, authenticated`,
      );
      expect(SQL).toMatch(grantSelect);

      const grantWrite = new RegExp(
        `grant\\s+(insert|update|delete|truncate|all)[^;]*on public\\.${table}\\b`,
      );
      expect(SQL).not.toMatch(grantWrite);
    });
  });

  describe.each(PUBLIC_TABLES)("public.%s 권한 정리", (table) => {
    it("기본으로 붙는 권한을 먼저 거둔다", () => {
      expect(SQL).toContain(
        `revoke all on public.${table} from anon, authenticated`,
      );
    });
  });

  /** 한 테이블의 create table 안에서 status 가 받는 값 목록. */
  function statusCheck(table: string): string[] {
    const body = SQL.match(
      new RegExp(
        `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
      ),
    )?.[1];
    const list = body?.match(/status in \(([^)]*)\)/)?.[1];
    if (!list) return [];
    return list
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .sort();
  }

  it("관측 물수지의 상태 이름이 화면과 같다", () => {
    expect(statusCheck("water_balance_daily")).toEqual(
      [...WATER_STATUSES].sort(),
    );
  });

  it("예보 전망은 과습을 판정하지 않는다 (관측 물수지 날만)", () => {
    expect(statusCheck("water_outlook")).toEqual(
      WATER_STATUSES.filter((s) => s !== "wet").sort(),
    );
  });

  it("계약서가 판정 상태 이름을 모두 적는다", () => {
    for (const status of WATER_STATUSES) {
      expect(CONTRACT).toContain(`\`${status}\``);
    }
  });

  it("계약서가 작물 공통 판정 코드를 모두 적는다 (v1.5)", () => {
    for (const status of [
      "winter",
      "pool",
      "ample",
      "fair",
      "dry",
      "very_dry",
    ]) {
      expect(CONTRACT).toContain(`\`${status}\``);
    }
  });

  it("서버 키는 이 저장소 문서에 쓰지 않는다", () => {
    expect(CONTRACT.toLowerCase()).not.toMatch(/eyj[a-z0-9_-]{20,}/);
  });
});
