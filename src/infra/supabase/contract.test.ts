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

/** 연결 확인용 표. 계산 결과가 아니라서 공개 테이블(v1 9개 + v1.1 1개 + v1.3 1개)과 따로 센다. */
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
  it("계약서에 공개 테이블 11개와 app_health 가 있다", () => {
    expect(tablesInContract().sort()).toEqual(
      [...PUBLIC_TABLES, HEALTH_TABLE].sort(),
    );
  });

  it("마이그레이션이 만드는 테이블이 계약서의 테이블과 같다", () => {
    expect(tablesInSql().sort()).toEqual(tablesInContract().sort());
  });

  it("계약서의 현재 버전이 v1.3 이다", () => {
    expect(CONTRACT).toMatch(/## 현재 버전: v1\.3\b/);
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

  it("서버 키는 이 저장소 문서에 쓰지 않는다", () => {
    expect(CONTRACT.toLowerCase()).not.toMatch(/eyj[a-z0-9_-]{20,}/);
  });
});
