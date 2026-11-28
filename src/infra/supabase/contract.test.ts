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

/** 회원 표(v2.0). 읽기 전용 공개 표와 권한 규칙이 달라(자기 줄만) 표별 공개 표 검사에서 따로 뺀다. */
const MEMBERS_TABLE = "members";

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
  "soil_water_daily",
  "heat_series_daily",
  "sun_series_daily",
  "irrigation_methods",
] as const;

/** 적산 계열 새 표(v2.2, 결정 0063). 공개 표(누구나 읽기, 서버 키만 쓰기)라 PUBLIC_TABLES 검사에도 들어간다. */
const SERIES_TABLES = ["heat_series_daily", "sun_series_daily"] as const;

/** 농장 표(v2.1, 결정 0062). 회원 본인 줄만 읽고 쓰는 표와 서버 키만 쓰는 결과 표라 공개 표 검사와 따로 본다. */
const FARM_TABLES = [
  "farms",
  "farm_seasons",
  "irrigation_logs",
  "farm_calc_status",
  "farm_water_daily",
  "farm_water_outlook",
  "farm_water_outlook_summary",
] as const;
/** 회원이 쓰는(넣기 · 고치기 · 지우기) 표. 나머지 다섯은 회원 읽기만. */
const MEMBER_WRITABLE = ["farms", "irrigation_logs"] as const;

const MIGRATION_FARMS = "20261120000000_data_contract_v2_1_farms.sql";
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
const FARMS_SQL = stripComments(
  readFileSync(join(MIGRATIONS_DIR, MIGRATION_FARMS), "utf8"),
);
/** `;` 로 끊은 문장들 (함수 본문의 `;` 때문에 함수는 따로 본다). */
const FARMS_STATEMENTS = FARMS_SQL.split(";").map((s) => s.trim());

function tablesInContract(): string[] {
  // "### `public.stations`" 모양의 제목
  return [...CONTRACT.matchAll(/^###\s+`public\.([a-z_]+)`/gm)].map(
    (m) => m[1],
  );
}

/** 마이그레이션이 만든 표에서 마이그레이션이 지운 표를 뺀 것 (= 지금 DB 에 있는 표). */
function tablesInSql(): string[] {
  const dropped = new Set(
    [...SQL.matchAll(/drop table if exists public\.([a-z_]+)/g)].map(
      (m) => m[1],
    ),
  );
  return [...SQL.matchAll(/create table if not exists public\.([a-z_]+)\s*\(/g)]
    .map((m) => m[1])
    .filter((t) => !dropped.has(t));
}

describe("데이터 계약과 마이그레이션", () => {
  it("계약서에 공개 테이블 15개(적산 계열 표 2개 포함), 회원 표 members, 농장 표 7개, app_health 가 있다", () => {
    expect(tablesInContract().sort()).toEqual(
      [...PUBLIC_TABLES, MEMBERS_TABLE, ...FARM_TABLES, HEALTH_TABLE].sort(),
    );
  });

  it("마이그레이션이 만드는 테이블이 계약서의 테이블과 같다", () => {
    expect(tablesInSql().sort()).toEqual(tablesInContract().sort());
  });

  it("계약서의 현재 버전이 v2.6 이다", () => {
    expect(CONTRACT).toMatch(/## 현재 버전: v2\.6\b/);
  });

  describe("soil_water_latest 뷰 filled 열 (v1.10)", () => {
    it("soil_water_latest 뷰 마지막 열로 filled 를 조회한다", () => {
      expect(SQL).toMatch(
        /create or replace view public\.soil_water_latest\s+with\s*\(security_invoker\s*=\s*true\)\s+as\s+select distinct on\s*\(stn_id,\s*soil_code\)\s+stn_id,\s+soil_code,\s+date,\s+dr_mm,\s+taw_mm,\s+raw_mm,\s+aw_pct,\s+status,\s+filled\s+from public\.soil_water_daily/,
      );
    });

    it("계약서 soil_water_latest 표에 filled 열과 기상청 사후 정정 한계가 적혀 있다", () => {
      const section = CONTRACT.split("#### 지점·토성별 최신 1줄 뷰:")[1].split(
        "### `public.",
      )[0];
      expect(section).toContain("`filled`");
      expect(CONTRACT).toContain("한계 (기상청 사후 정정·철회)");
    });
  });

  describe("soil_water_latest 뷰 (v1.9)", () => {
    it("정렬 가속을 위한 복합 색인이 있다", () => {
      expect(SQL).toMatch(
        /create index if not exists idx_soil_water_daily_stn_soil_date_desc\s+on public\.soil_water_daily\s*\(stn_id,\s*soil_code,\s*date desc\)/,
      );
    });

    it("with (security_invoker = true) 로 뷰를 생성한다", () => {
      expect(SQL).toMatch(
        /create or replace view public\.soil_water_latest\s+with\s*\(security_invoker\s*=\s*true\)\s+as\s+select distinct on\s*\(stn_id,\s*soil_code\)/,
      );
    });

    it("한국 기준 최근 7일 이내 조건이 있다", () => {
      expect(SQL).toMatch(
        /where date >= \(\(now\(\) at time zone 'asia\/seoul'\)::date - 7\)/,
      );
    });

    it("비회원·회원에게 select 권한을 부여한다", () => {
      expect(SQL).toMatch(
        /grant select on public\.soil_water_latest to anon, authenticated;/,
      );
    });

    it("계약서에 soil_water_latest 뷰 설명이 있다", () => {
      expect(CONTRACT).toContain("public.soil_water_latest");
    });
  });

  it("updated_at 갱신 함수는 직접 부를 수 없게 막는다 (v1.8)", () => {
    expect(SQL).toMatch(
      /create or replace function public\.set_updated_at\(\)\s+returns trigger/,
    );
    expect(SQL).toMatch(
      /revoke all on function public\.set_updated_at\(\) from public, anon, authenticated/,
    );
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

  it("적산 계열 표는 값 열과 평년 기간을 줄마다 남긴다 (v1.4 에서 옮김)", () => {
    const heat = bodyOf("heat_series_daily");
    const sun = bodyOf("sun_series_daily");
    for (const c of ["gdd_cum", "gdd_normal_cum", "lead_days", "t_base_c"]) {
      expect(heat).toContain(c);
    }
    for (const c of ["rs_cum_mj", "rs_normal_cum_mj"]) expect(sun).toContain(c);
    // 평년 기간을 줄마다 남긴다 (2016–2025 같은 기간을 화면에 적기 위해)
    for (const b of [heat, sun]) {
      expect(b).toMatch(/normal_from\s+int\w*\s+not null/);
      expect(b).toMatch(/normal_to\s+int\w*\s+not null/);
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

  describe("public.weather_daily 일사 출처 (rs_source)", () => {
    it("rs_source 열이 추가되고 허용값은 null 또는 observed, sunshine, temp_range 이다", () => {
      expect(SQL).toMatch(
        /alter table public\.weather_daily\s+add column if not exists rs_source text null/,
      );
      expect(SQL).toMatch(
        /check\s*\(\s*rs_source is null or rs_source in \('observed',\s*'sunshine',\s*'temp_range'\)\s*\)/,
      );
    });

    it("계약서 weather_daily 표에 rs_source 가 적혀 있다", () => {
      const section = CONTRACT.split("### `public.weather_daily`")[1].split(
        "### `public.",
      )[0];
      expect(section).toContain("`rs_source`");
    });
  });

  describe("public.db_size_bytes (croplib-dp 용량 경고 RPC, #77)", () => {
    it("db_size_bytes 함수가 정의되어 있고 jsonb 를 돌려준다", () => {
      expect(SQL).toMatch(
        /create or replace function public\.db_size_bytes\(\)\s*returns jsonb/,
      );
    });

    it("security definer 가 없고(기본 invoker) service_role 만 실행 권한이 있다", () => {
      const fnSql = SQL.split("function public.db_size_bytes")[1]?.split(
        ";",
      )[0];
      expect(fnSql).not.toContain("security definer");
      expect(SQL).toMatch(
        /revoke all on function public\.db_size_bytes\(\) from public, anon, authenticated;/,
      );
      expect(SQL).toMatch(
        /grant execute on function public\.db_size_bytes\(\) to service_role;/,
      );
    });

    it("계약서에 db_size_bytes() 함수와 service_role 권한이 적혀 있다", () => {
      expect(CONTRACT).toContain("`public.db_size_bytes()`");
      expect(CONTRACT).toContain("`service_role`");
      expect(CONTRACT).toContain("`POST /rest/v1/rpc/db_size_bytes`");
    });
  });
});

/**
 * 회원 DB (v2.0, 이슈 #178, 결정 0059).
 * 실제 동작(가입 트리거, 자기 줄만 보임, 탈퇴)은 supabase/checks/d1_1_members_check.sql 을 사용자가 SQL Editor 에서 돌려 확인한다.
 * 여기서는 마이그레이션·계약서·확인 SQL 의 글자가 약속대로인지 본다.
 */
describe("회원 DB (v2.0)", () => {
  /** v2.0 마이그레이션 파일 하나(주석 제거·소문자). */
  const MEMBERS_FILE = readdirSync(MIGRATIONS_DIR).find((n) =>
    n.endsWith("_data_contract_v2_0_members.sql"),
  );
  const MEMBERS_SQL = MEMBERS_FILE
    ? readFileSync(join(MIGRATIONS_DIR, MEMBERS_FILE), "utf8")
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n")
        .toLowerCase()
    : "";

  const UPDATABLE = [
    "display_name",
    "terms_version",
    "terms_agreed_at",
    "privacy_version",
    "privacy_confirmed_at",
    "age14_confirmed_at",
    "layout",
    "font_scale",
    "theme",
  ];
  const PROTECTED = [
    "user_id",
    "provider",
    "role",
    "role_verified_at",
    "created_at",
    "updated_at",
  ];

  /** create or replace function <name>( … $$; 한 덩어리 (소문자). */
  const fn = (name: string) =>
    MEMBERS_SQL.match(
      new RegExp(
        `create or replace function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$;`,
      ),
    )?.[0];
  /** 함수 선언부(본문 `as $$` 앞). */
  const head = (name: string) => fn(name)?.split("as $$")[0];

  it("v2.0 마이그레이션 파일이 있다", () => {
    expect(MEMBERS_FILE).toBeDefined();
  });

  describe("public.members 표", () => {
    const body = MEMBERS_SQL.match(
      /create table if not exists public\.members\s*\(([\s\S]*?)\n\);/,
    )?.[1]?.replace(/[ \t]+/g, " ");

    it("회원 한 사람 = 한 줄, auth.users 를 지우면 같이 지워진다", () => {
      expect(body).toBeDefined();
      expect(body).toMatch(
        /user_id uuid primary key references auth\.users \(id\) on delete cascade/,
      );
    });

    it("열이 모두 있다 (이메일은 저장하지 않음)", () => {
      for (const c of [...UPDATABLE, ...PROTECTED]) expect(body).toContain(c);
      expect(body).not.toMatch(/\bemail\b/);
    });

    it("provider · role · theme 허용값을 DB 가 막고, jsonb 칸은 객체만 받는다", () => {
      expect(body).toMatch(
        /provider text check \(provider in \('kakao', ?'naver', ?'google'\)\)/,
      );
      expect(body).toMatch(
        /role text check \(role in \('farmer', ?'advisor'\)\)/,
      );
      expect(body).toMatch(
        /theme text check \(theme in \('light', ?'dark'\)\)/,
      );
      for (const c of ["layout", "font_scale"]) {
        expect(body).toMatch(
          new RegExp(
            `${c} jsonb check \\(jsonb_typeof\\(${c}\\) = 'object'\\)`,
          ),
        );
      }
    });

    it("created_at · updated_at 은 비어 있지 않고 기본값 now()", () => {
      expect(body).toMatch(/created_at timestamptz not null default now\(\)/);
      expect(body).toMatch(/updated_at timestamptz not null default now\(\)/);
    });

    it("고칠 때 updated_at 을 지금으로 바꾸는 트리거가 있다", () => {
      expect(MEMBERS_SQL).toMatch(
        /create trigger members_set_updated_at\s+before update on public\.members\s+for each row execute function public\.set_updated_at\(\)/,
      );
    });
  });

  describe("public.members 권한 (자기 줄만)", () => {
    it("RLS 를 켜고 기본 권한을 먼저 거둔다", () => {
      expect(MEMBERS_SQL).toContain(
        "alter table public.members enable row level security",
      );
      expect(MEMBERS_SQL).toContain(
        "revoke all on public.members from anon, authenticated",
      );
    });

    it("읽기 정책은 회원 본인의 자기 줄뿐이다", () => {
      expect(MEMBERS_SQL).toMatch(
        /create policy "[^"]+"\s+on public\.members\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/,
      );
      expect(MEMBERS_SQL).toMatch(
        /grant select on public\.members to authenticated;/,
      );
    });

    it("고치기 정책도 자기 줄뿐이고 넣기·지우기 정책이 없다", () => {
      expect(MEMBERS_SQL).toMatch(
        /create policy "[^"]+"\s+on public\.members\s+for update\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/,
      );
      expect(MEMBERS_SQL).not.toMatch(
        /create policy "[^"]+"\s+on public\.members\s+for (insert|delete|all)/,
      );
    });

    it("anon 에는 이 표의 권한과 정책이 하나도 없다", () => {
      expect(MEMBERS_SQL).not.toMatch(
        /grant [^;]*on public\.members to [^;]*\banon\b/,
      );
      expect(MEMBERS_SQL).not.toMatch(
        /create policy "[^"]+"\s+on public\.members[^;]*\banon\b/,
      );
    });

    it("고칠 수 있는 열은 정해진 9개뿐, role · provider 등은 못 바꾼다", () => {
      const list = MEMBERS_SQL.match(
        /grant update \(([^)]*)\) on public\.members to authenticated;/,
      )?.[1];
      expect(list).toBeDefined();
      const cols = list!.split(",").map((c) => c.trim());
      expect([...cols].sort()).toEqual([...UPDATABLE].sort());
      for (const c of PROTECTED) expect(cols).not.toContain(c);
    });

    it("넣기·지우기·전체 권한을 주지 않는다 (열 목록 없는 update 포함)", () => {
      expect(MEMBERS_SQL).not.toMatch(
        /grant\s+(insert|delete|truncate|all|update)\s+on public\.members/,
      );
      expect(MEMBERS_SQL).not.toMatch(
        /grant\s+(insert|delete|truncate|all)[^;]*on public\.members/,
      );
    });
  });

  describe("보안 정의(security definer) 함수", () => {
    it("모든 보안 정의 함수는 set search_path = '' 이다", () => {
      const defs = [
        ...MEMBERS_SQL.matchAll(/create or replace function [\s\S]*?as \$\$/g),
      ]
        .map((m) => m[0])
        .filter((h) => h.includes("security definer"));
      expect(defs.length).toBeGreaterThanOrEqual(3);
      for (const h of defs) expect(h).toContain("set search_path = ''");
    });
  });

  describe("가입 트리거 public.handle_new_user()", () => {
    it("auth.users 에 줄이 생기면(after insert) 부른다", () => {
      expect(MEMBERS_SQL).toMatch(
        /drop trigger if exists on_auth_user_created on auth\.users;\s*create trigger on_auth_user_created\s+after insert on auth\.users\s+for each row execute function public\.handle_new_user\(\)/,
      );
    });

    it("이름 · 공급자를 같은 내부 함수 member_seed 로 고르고 on conflict do nothing", () => {
      const f = fn("public.handle_new_user");
      expect(f).toBeDefined();
      expect(f).toContain("public.member_seed(");
      expect(f).toContain("on conflict (user_id) do nothing");
    });

    it("오류를 삼킨다: exception when others 로 경고만 남기고 new 를 돌려준다", () => {
      const f = fn("public.handle_new_user");
      expect(f).toMatch(
        /exception\s+when others then\s+raise warning[^;]*;\s*return new;/,
      );
    });

    it("경고 문구에 오류 원문(sqlerrm, 이름이 섞일 수 있음)을 쓰지 않는다", () => {
      expect(fn("public.handle_new_user")).not.toContain("sqlerrm");
    });

    it("직접 부를 수 없다 (실행 권한 없음)", () => {
      expect(MEMBERS_SQL).toMatch(
        /revoke all on function public\.handle_new_user\(\) from public, anon, authenticated;/,
      );
      expect(MEMBERS_SQL).not.toMatch(
        /grant execute on function public\.handle_new_user/,
      );
    });
  });

  describe("이름 · 공급자 고르기 public.member_seed()", () => {
    it("naver · custom:naver 는 naver, kakao · google 만 받고 모르는 값은 비운다", () => {
      const f = fn("public.member_seed");
      expect(f).toBeDefined();
      expect(f).toContain("'custom:naver");
      expect(f).toContain("'kakao'");
      expect(f).toContain("'google'");
      expect(f).toContain("else null");
    });

    it("이름 후보를 name → full_name → nickname 순으로 보고 길이를 자른다", () => {
      const f = fn("public.member_seed")!;
      const i = ["'name'", "'full_name'", "'nickname'"].map((k) =>
        f.indexOf(k),
      );
      expect(i.every((x) => x > 0)).toBe(true);
      expect([...i].sort((a, b) => a - b)).toEqual(i);
      expect(f).toMatch(/left\(/);
    });

    it("직접 부를 수 없다 (실행 권한 없음)", () => {
      expect(MEMBERS_SQL).toMatch(
        /revoke all on function public\.member_seed\(jsonb, jsonb\) from public, anon, authenticated;/,
      );
    });
  });

  describe("public.ensure_my_member() — 줄이 빠진 회원이 자기 줄을 만든다", () => {
    it("인자 없음, 아무것도 돌려주지 않고, 비회원이면 오류", () => {
      const h = head("public.ensure_my_member");
      expect(h).toBeDefined();
      expect(h).toMatch(/ensure_my_member\(\)\s+returns void/);
      expect(fn("public.ensure_my_member")).toMatch(
        /if auth\.uid\(\) is null then\s+raise exception/,
      );
    });

    it("자기 auth.users 줄에서 member_seed 로 넣고 두 번 불러도 오류가 없다", () => {
      const f = fn("public.ensure_my_member");
      expect(f).toContain("public.member_seed(");
      expect(f).toMatch(/where u\.id = auth\.uid\(\)/);
      expect(f).toContain("on conflict (user_id) do nothing");
    });

    it("회원(authenticated)만 실행한다", () => {
      expect(MEMBERS_SQL).toMatch(
        /revoke all on function public\.ensure_my_member\(\) from public, anon;/,
      );
      expect(MEMBERS_SQL).toMatch(
        /grant execute on function public\.ensure_my_member\(\) to authenticated;/,
      );
    });
  });

  describe("탈퇴 ops.withdrawn_accounts · public.delete_my_account()", () => {
    it("탈퇴 기록 표: 회원 번호는 되돌릴 수 없는 해시만, RLS 켬 · 정책 없음 · 권한 없음", () => {
      const body = MEMBERS_SQL.match(
        /create table if not exists ops\.withdrawn_accounts\s*\(([\s\S]*?)\n\);/,
      )?.[1]?.replace(/[ \t]+/g, " ");
      expect(body).toBeDefined();
      expect(body).toMatch(/user_hash text primary key/);
      expect(body).toMatch(/withdrawn_at timestamptz not null default now\(\)/);
      expect(MEMBERS_SQL).toContain(
        "alter table ops.withdrawn_accounts enable row level security",
      );
      expect(MEMBERS_SQL).toContain(
        "revoke all on ops.withdrawn_accounts from anon, authenticated",
      );
      expect(MEMBERS_SQL).not.toMatch(/create policy "[^"]+"\s+on ops\./);
    });

    it("delete_my_account: 인자 없음, 비회원이면 오류, 해시 한 줄 + auth.users 삭제", () => {
      const h = head("public.delete_my_account");
      expect(h).toMatch(/delete_my_account\(\)\s+returns void/);
      const f = fn("public.delete_my_account")!;
      expect(f).toMatch(/if v_uid is null then\s+raise exception/);
      expect(f).toContain(
        "encode(sha256(convert_to(v_uid::text, 'utf8')), 'hex')",
      );
      expect(f).toMatch(
        /on conflict \(user_hash\) do update set withdrawn_at = now\(\)/,
      );
      expect(f).toMatch(/delete from auth\.users where id = v_uid/);
      expect(f.indexOf("insert into ops.withdrawn_accounts")).toBeLessThan(
        f.indexOf("delete from auth.users"),
      );
    });

    it("회원만 실행하고 anon 은 못 한다", () => {
      expect(MEMBERS_SQL).toMatch(
        /revoke all on function public\.delete_my_account\(\) from public, anon;/,
      );
      expect(MEMBERS_SQL).toMatch(
        /grant execute on function public\.delete_my_account\(\) to authenticated;/,
      );
    });
  });

  it("이미 있는 auth.users 줄은 마이그레이션 끝에서 한 번 채운다", () => {
    expect(MEMBERS_SQL).toMatch(
      /insert into public\.members \(user_id, display_name, provider\)\s+select u\.id, s\.display_name, s\.provider\s+from auth\.users u[\s\S]*?on conflict \(user_id\) do nothing;\s*$/,
    );
  });

  describe("계약서 v2.0", () => {
    const section = CONTRACT.split("### `public.members`")[1]?.split(
      /\n### /,
    )[0];

    it("members 열 · 권한 · 가입 트리거 · 고칠 수 있는 열이 적혀 있다", () => {
      expect(section).toBeDefined();
      for (const c of [...UPDATABLE, ...PROTECTED])
        expect(section).toContain(`\`${c}\``);
      expect(section).toContain("handle_new_user");
      expect(section).toContain("on_auth_user_created");
    });

    it("jsonb 칸은 참고용이며 모양은 화면이 거른다고 적혀 있다", () => {
      expect(section).toContain("참고용");
      expect(section).toMatch(/parse/);
    });

    it("ops.withdrawn_accounts 는 공개 표가 아닌 제목으로 적혀 있다", () => {
      expect(CONTRACT).toMatch(/^### `ops\.withdrawn_accounts`/m);
      expect(tablesInContract()).not.toContain("withdrawn_accounts");
    });

    it("운영용 함수 delete_my_account · ensure_my_member 가 적혀 있다", () => {
      expect(CONTRACT).toContain("`public.delete_my_account()`");
      expect(CONTRACT).toContain("`public.ensure_my_member()`");
    });

    it("권한 문장이 공개 표와 회원 표를 나눈다 (회원 표는 자기 줄만)", () => {
      const rule = CONTRACT.split("## 공통 규칙")[1]
        .split("\n")
        .find((l) => l.startsWith("- **권한:**"));
      expect(rule).toContain("자기 줄");
      expect(rule).toContain("서버 키");
    });

    it("농장 쪽은 v2.1 로 더한다고 적혀 있다", () => {
      expect(CONTRACT).toMatch(/v2\.1/);
    });
  });

  describe("확인 SQL · 되돌리기 SQL (사용자가 SQL Editor 에서 실행)", () => {
    const CHECK = readFileSync(
      join(ROOT, "supabase/checks/d1_1_members_check.sql"),
      "utf8",
    ).toLowerCase();
    const ROLLBACK = readFileSync(
      join(ROOT, "supabase/checks/d1_1_members_rollback.sql"),
      "utf8",
    ).toLowerCase();

    it("확인 SQL 은 아무것도 남기지 않고(rollback) 마지막에 all_ok 를 낸다", () => {
      expect(CHECK).toContain("all_ok");
      expect(CHECK).toContain("raise exception 'd1_1_check_rollback'");
      expect(CHECK).not.toMatch(/^\s*commit\s*;/m);
    });

    it("확인 SQL 이 가짜 회원을 gen_random_uuid() 와 example.invalid 로 만든다", () => {
      expect(CHECK).toContain("gen_random_uuid()");
      expect(CHECK).toContain("example.invalid");
    });

    it("확인 SQL 이 핵심 항목을 모두 본다", () => {
      for (const k of [
        "custom:naver",
        "set local role authenticated",
        "set local role anon",
        "request.jwt.claims",
        "delete_my_account()",
        "ensure_my_member()",
        "withdrawn_accounts",
        "insufficient_privilege",
      ]) {
        expect(CHECK).toContain(k);
      }
    });

    it("되돌리기 SQL 은 트리거 → 함수 → 표 순서로 지운다", () => {
      const order = [
        "drop trigger if exists on_auth_user_created on auth.users",
        "drop function if exists public.handle_new_user()",
        "drop function if exists public.ensure_my_member()",
        "drop function if exists public.delete_my_account()",
        "drop function if exists public.member_seed(jsonb, jsonb)",
        "drop table if exists ops.withdrawn_accounts",
        "drop table if exists public.members",
      ].map((s) => ROLLBACK.indexOf(s));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  });

  it("members 는 공개 표의 '읽기만' 검사 목록(PUBLIC_TABLES)에 섞지 않는다", () => {
    expect([...PUBLIC_TABLES]).not.toContain(MEMBERS_TABLE);
  });
});

describe("농장 표 (v2.1, 결정 0062)", () => {
  it("계약서에 새 표 7개와 변경 기록 v2.1 이 있다", () => {
    for (const t of FARM_TABLES) {
      expect(CONTRACT, t).toContain(`### \`public.${t}\``);
    }
    expect(CONTRACT).toMatch(/\*\*v2\.1:\*\*/);
  });

  it("마이그레이션이 새 표 7개를 만든다 (계약서의 이름과 같다)", () => {
    for (const t of FARM_TABLES) {
      expect(FARMS_SQL, t).toContain(
        `create table if not exists public.${t} (`,
      );
    }
  });

  for (const t of FARM_TABLES) {
    describe(t, () => {
      it("RLS 를 켜고 기본으로 붙는 권한을 먼저 거두며, 비회원(anon)에게는 아무 권한도 주지 않는다", () => {
        expect(FARMS_SQL).toContain(
          `alter table public.${t} enable row level security;`,
        );
        expect(FARMS_SQL).toContain(
          `revoke all on public.${t} from anon, authenticated;`,
        );
        const grants = FARMS_STATEMENTS.filter(
          (s) => s.startsWith("grant") && s.includes(`on public.${t} `),
        );
        expect(grants.length).toBeGreaterThan(0);
        for (const g of grants) {
          expect(g, g).toContain("to authenticated");
          expect(g, g).not.toMatch(/\banon\b/);
        }
      });

      it("읽기 정책이 있고 모든 정책이 회원(authenticated) 대상이며 자기 농장으로 좁힌다", () => {
        const policies = FARMS_STATEMENTS.filter(
          (s) =>
            s.startsWith("create policy") && s.includes(` on public.${t} `),
        );
        expect(policies.some((p) => p.includes("for select"))).toBe(true);
        for (const p of policies) {
          expect(p, p).toContain("to authenticated");
          expect(p, p).not.toMatch(/\banon\b/);
          expect(p, p).toContain("auth.uid()");
        }
      });
    });
  }

  it("회원이 쓰는 표는 farms · irrigation_logs 둘뿐이고 정책이 넣기 · 고치기 · 지우기까지 있다", () => {
    for (const t of FARM_TABLES) {
      const policies = FARMS_STATEMENTS.filter(
        (s) => s.startsWith("create policy") && s.includes(` on public.${t} `),
      );
      const writes = ["for insert", "for update", "for delete"].filter((cmd) =>
        policies.some((p) => p.includes(cmd)),
      );
      if ((MEMBER_WRITABLE as readonly string[]).includes(t)) {
        expect(writes, t).toHaveLength(3);
      } else {
        expect(writes, `${t} 에는 회원 쓰기 정책이 없다`).toHaveLength(0);
        const grants = FARMS_STATEMENTS.filter(
          (s) => s.startsWith("grant") && s.includes(`on public.${t} `),
        );
        for (const g of grants) {
          expect(g, g).toMatch(/^grant select on/);
        }
      }
    }
  });

  it("회원이 못 고치는 열은 열 단위 권한으로 막는다 (farms: farm_id · user_id · created_at · updated_at)", () => {
    const update = FARMS_STATEMENTS.find((s) =>
      s.startsWith("grant update ("),
    )!;
    const cols = update.match(
      /grant update \(([^)]*)\)\s+on public\.farms/,
    )![1];
    for (const c of ["farm_id", "user_id", "created_at", "updated_at"]) {
      expect(cols, c).not.toMatch(new RegExp(`\\b${c}\\b`));
    }
    expect(cols).toMatch(/\birrigated_area_m2\b/);
    const insert = FARMS_STATEMENTS.find((s) =>
      /^grant insert \([^)]*\)\s+on public\.farms/.test(s),
    )!;
    const icols = insert.match(
      /grant insert \(([^)]*)\)\s+on public\.farms/,
    )![1];
    for (const c of ["farm_id", "created_at", "updated_at"]) {
      expect(icols, c).not.toMatch(new RegExp(`\\b${c}\\b`));
    }
    expect(icols).toMatch(/\buser_id\b/); // 넣을 때만 정할 수 있다 (정책이 auth.uid() 와 같아야 통과)
  });

  it("irrigation_logs: farm_id · log_id · created_at 은 회원이 정하거나 바꿀 수 없다", () => {
    const update = FARMS_STATEMENTS.find((s) =>
      /^grant update \([^)]*\) on public\.irrigation_logs/.test(s),
    )!;
    const ucols = update.match(/\(([^)]*)\)/)![1];
    expect(ucols).not.toMatch(/\bfarm_id\b/);
    expect(ucols).not.toMatch(/\blog_id\b/);
    const insert = FARMS_STATEMENTS.find((s) =>
      /^grant insert \([^)]*\) on public\.irrigation_logs/.test(s),
    )!;
    const icols = insert.match(/\(([^)]*)\)/)![1];
    expect(icols).not.toMatch(/\blog_id\b/);
    expect(icols).not.toMatch(/\bcreated_at\b/);
  });

  it("회원 1명 = 농장 1개 색인 farms_one_per_user, 탈퇴하면 연쇄로 지워진다 (on delete cascade)", () => {
    expect(FARMS_SQL).toMatch(
      /create unique index if not exists farms_one_per_user on public\.farms \(user_id\)/,
    );
    expect(FARMS_SQL).toMatch(
      /user_id\s+uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/,
    );
    for (const t of [
      "farm_seasons",
      "irrigation_logs",
      "farm_calc_status",
      "farm_water_daily",
      "farm_water_outlook",
      "farm_water_outlook_summary",
    ]) {
      const body = FARMS_SQL.match(
        new RegExp(
          `create table if not exists public\\.${t} \\(([\\s\\S]*?)\\n\\);`,
        ),
      )![1];
      expect(body, t).toMatch(
        /references public\.farms \(farm_id\) on delete cascade/,
      );
    }
  });

  it("작물 · 작형 · 재배 방식 관계는 합성 외래키로 DB 가 지킨다 (farms · farm_seasons)", () => {
    expect(FARMS_SQL).toMatch(
      /foreign key \(season_type_id, crop_id\)\s+references public\.crop_seasons \(season_type_id, crop_id\)/,
    );
    expect(FARMS_SQL).toMatch(
      /foreign key \(kc_set_id, crop_id\)\s+references public\.crop_kc_sets \(kc_set_id, crop_id\)/,
    );
    expect(FARMS_SQL).toContain(
      "create unique index if not exists crop_seasons_type_crop_key",
    );
    expect(FARMS_SQL).toContain(
      "create unique index if not exists crop_kc_sets_kc_crop_key",
    );
    expect(FARMS_SQL).toMatch(
      /check \(\(crop_id = 'common'\) = \(season_type_id is null\)\)/,
    );
  });

  it("작기 줄: 같은 농장의 날짜 겹침 금지(배제 제약, btree_gist), 끝 ≥ 시작, 366일 이하", () => {
    expect(FARMS_SQL).toContain("create extension if not exists btree_gist");
    expect(FARMS_SQL).toMatch(
      /exclude using gist \(farm_id with =, daterange\(start_date, end_date, '\[\]'\) with &&\)/,
    );
    expect(FARMS_SQL).toMatch(
      /check \(end_date >= start_date and end_date - start_date \+ 1 <= 366\)/,
    );
  });

  it("시작 월-일은 실제 있는 날만 (02-29 · 04-31 거절) — 표의 check 가 is_valid_mmdd 를 부른다", () => {
    expect(FARMS_SQL).toContain(
      "create or replace function public.is_valid_mmdd",
    );
    expect(FARMS_SQL).toMatch(/when '02' then 28/);
    expect(FARMS_SQL).toMatch(
      /season_start_mmdd\s+text check \(public\.is_valid_mmdd\(season_start_mmdd\)\)/,
    );
    expect(FARMS_SQL).toMatch(
      /check \(\(season_start_mmdd is null\) = \(season_start_source is null\)\)/,
    );
  });

  it("관수 기록: 지금 작기 줄 시작일 ~ 오늘(한국 날짜) 규칙을 트리거가 지키고, 지우기에는 걸리지 않는다", () => {
    expect(FARMS_SQL).toMatch(
      /create trigger irrigation_logs_check_date\s+before insert or update on public\.irrigation_logs/,
    );
    const fn = FARMS_SQL.match(
      /create or replace function public\.irrigation_logs_check_date\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toContain("public.farm_current_season(new.farm_id, v_today)");
    expect(fn).toContain("public.kst_today()");
    expect(fn).toMatch(/new\.date < cur\.start_date or new\.date > v_today/);
    // 고칠 때는 날짜(나 농장)가 바뀔 때만 검사한다
    expect(fn).toMatch(/new\.date = old\.date and new\.farm_id = old\.farm_id/);
    expect(FARMS_SQL).not.toMatch(
      /before[^;]*delete[^;]*irrigation_logs_check_date/,
    );
  });

  it("지금 줄의 정의는 한 곳: 끝이 오늘 이후(끝나는 날 당일 포함) 중 시작이 가장 이른 줄", () => {
    const fn = FARMS_SQL.match(
      /create or replace function public\.farm_current_season[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/s\.end_date >= p_today/);
    expect(fn).toMatch(/order by s\.start_date\s+limit 1/);
    // sync 와 관수 기록 규칙이 이 함수를 같이 쓴다
    expect(
      FARMS_SQL.match(/public\.farm_current_season\(/g)!.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("sync_farm_seasons 는 서버 키만 실행하고, 안쪽 · 내부 함수는 서버 키도 못 부른다", () => {
    expect(FARMS_SQL).toContain(
      "revoke all on function public.sync_farm_seasons(uuid) from public, anon, authenticated;",
    );
    expect(FARMS_SQL).toContain(
      "grant execute on function public.sync_farm_seasons(uuid) to service_role;",
    );
    for (const fn of [
      "public.sync_farm_seasons_at(uuid, date)",
      "public.touch_farm_calc(uuid, date)",
      "public.farm_current_season(uuid, date)",
    ]) {
      expect(FARMS_SQL, fn).toContain(
        `revoke all on function ${fn} from public, anon, authenticated, service_role;`,
      );
    }
  });

  it("보안 정의 함수는 모두 search_path 를 비운다", () => {
    const fns = FARMS_SQL.split("create or replace function ").slice(1);
    expect(fns.length).toBeGreaterThanOrEqual(15);
    for (const f of fns) {
      const head = f.split("$$")[0];
      if (head.includes("security definer")) {
        expect(head, head.slice(0, 60)).toContain("set search_path = ''");
      }
    }
  });

  it("작기 연도 규칙은 farm_season_window 한 곳이고, 날짜를 인자로 받는 안쪽 함수가 있다 (확인 SQL 이 오늘을 바꿔 부름)", () => {
    expect(FARMS_SQL).toMatch(
      /function public\.farm_season_window\(p_start_mmdd text, p_len int, p_today date\)/,
    );
    expect(FARMS_SQL).toMatch(
      /function public\.sync_farm_seasons_at\(p_farm_id uuid, p_today date\)/,
    );
    // season_end_mmdd 는 끝 계산에 쓰지 않는다 (무시)
    const body = FARMS_SQL.match(
      /create or replace function public\.sync_farm_seasons_at[\s\S]*?\$\$;/,
    )![0];
    expect(body).not.toMatch(/season_end_mmdd/);
  });

  it("다시 계산 요청: 기다리는 중에는 더 이른 날로만 당기고, 농장 줄이 없으면 아무것도 안 하며, 오류를 내지 않는다", () => {
    const fn = FARMS_SQL.match(
      /create or replace function public\.touch_farm_calc[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/least\(s\.recalc_from, excluded\.recalc_from\)/);
    expect(fn).toMatch(/s\.done_at is null or s\.requested_at > s\.done_at/);
    expect(fn).toMatch(/if not exists \(select 1 from public\.farms/);
    expect(fn).toMatch(/exception\s+when others then\s+raise warning/);
    expect(fn).toContain("clock_timestamp()");
  });

  it("깨우기: 2분 창 + 매분 보충 예약 croplib-farm-calc-sweep, 건너뛰기 설정, farm_calc.yml", () => {
    expect(FARMS_SQL).toMatch(/interval '2 minutes'/);
    expect(FARMS_SQL).toContain("ops.dispatch_workflow('farm_calc.yml')");
    expect(FARMS_SQL).toContain("cropmon.skip_wake");
    expect(FARMS_SQL).toMatch(
      /select cron\.schedule\('croplib-farm-calc-sweep', '\* \* \* \* \*', \$cron\$select ops\.farm_calc_sweep\(\)\$cron\$\);/,
    );
    // 깨우기가 실패해도 회원의 저장은 성공한다
    const wake = FARMS_SQL.match(
      /create or replace function ops\.farm_calc_try_wake[\s\S]*?\$\$;/,
    )![0];
    expect(wake).toMatch(/exception\s+when others then\s+raise warning/);
    // 기다리는 요청만 가볍게 찾는 색인
    expect(FARMS_SQL).toMatch(
      /create index if not exists farm_calc_status_pending_idx[\s\S]*?where requested_at is not null and \(done_at is null or requested_at > done_at\)/,
    );
  });

  it("쓰는 물 etc_only: 세 공개 표 check 와 새 결과 표가 받는다", () => {
    for (const [table, col] of [
      ["water_balance_daily", "status"],
      ["water_outlook", "status"],
      ["water_outlook_summary", "status_start"],
    ] as const) {
      expect(FARMS_SQL, table).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+add constraint ${table}_${col}_check\\s+check \\(${col} in \\([^)]*'etc_only'\\)\\)`,
        ),
      );
    }
    for (const t of [
      "farm_water_daily",
      "farm_water_outlook",
      "farm_water_outlook_summary",
    ]) {
      const body = FARMS_SQL.match(
        new RegExp(
          `create table if not exists public\\.${t} \\(([\\s\\S]*?)\\n\\);`,
        ),
      )![1];
      expect(body, t).toContain("'etc_only'");
    }
  });

  it("기본 조건 색인은 작형 기준 (stn_id, season_type_id, season_year)", () => {
    expect(FARMS_SQL).toMatch(
      /drop index if exists public\.scenarios_one_default;/,
    );
    expect(FARMS_SQL).toMatch(
      /create unique index if not exists scenarios_one_default\s+on public\.scenarios \(stn_id, season_type_id, season_year\)\s+where is_default;/,
    );
  });

  it("사전 열: crop_seasons.is_protected · cum_start_mmdd, crops.gdd_stage_labels (길이는 gdd_stages 와 같아야 함)", () => {
    expect(FARMS_SQL).toMatch(
      /add column if not exists is_protected boolean not null default false/,
    );
    expect(FARMS_SQL).toMatch(
      /add column if not exists cum_start_mmdd text check/,
    );
    expect(FARMS_SQL).toMatch(
      /add column if not exists gdd_stage_labels text\[\]/,
    );
    expect(FARMS_SQL).toMatch(
      /cardinality\(gdd_stage_labels\) = cardinality\(gdd_stages\)/,
    );
  });

  it("결과 표는 공개 표와 같은 열이고 scenario_id 자리에 farm_id 가 온다 (farm_water_daily)", () => {
    const pub = SQL.match(
      /create table if not exists public\.water_balance_daily \(([\s\S]*?)\n\);/,
    )![1];
    const farm = FARMS_SQL.match(
      /create table if not exists public\.farm_water_daily \(([\s\S]*?)\n\);/,
    )![1];
    const names = (body: string) =>
      body
        .split("\n")
        .map((l) => l.trim().match(/^([a-z_0-9]+)\s/)?.[1])
        .filter((n): n is string => Boolean(n) && n !== "primary");
    const pubCols = names(pub).filter((c) => c !== "scenario_id");
    const farmCols = names(farm);
    for (const c of pubCols) expect(farmCols, c).toContain(c);
    for (const extra of ["farm_season_id", "irr_l", "taw_mm", "raw_mm"]) {
      expect(farmCols, extra).toContain(extra);
    }
    expect(farmCols).toContain("farm_id");
    expect(farmCols).not.toContain("scenario_id");
  });

  it("확인 SQL · 되돌리기 SQL 이 있고, 되돌리기는 farms · etc_only 줄이 0 인지 먼저 확인하고 보충 예약을 함께 멈춘다", () => {
    const check = readFileSync(
      join(ROOT, "supabase/checks/d1_2_farms_check.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      join(ROOT, "supabase/checks/d1_2_farms_rollback.sql"),
      "utf8",
    );
    expect(check).toContain("all_ok");
    expect(check).toContain("cropmon.skip_wake");
    expect(check).toContain("raise exception 'd1_2_check_rollback'");
    expect(rollback).toMatch(/select count\(\*\) from public\.farms/);
    expect(rollback).toMatch(/status = 'etc_only'/);
    expect(rollback).toContain("cron.unschedule(jobname)");
    expect(rollback).toContain("croplib-farm-calc-sweep");
    expect(rollback).not.toMatch(/drop table[^;]*auth\.users/);
    expect(rollback).not.toMatch(/delete from auth\.users/);
  });
});

describe("깨우기 스위치 · sync_all_farm_seasons (v2.1 보충, 결정 0062)", () => {
  const rollback = readFileSync(
    join(ROOT, "supabase/checks/d1_2_farms_rollback.sql"),
    "utf8",
  );
  const decision = readFileSync(
    join(ROOT, "docs/decisions/0062-farm-db.md"),
    "utf8",
  );
  const ENABLE_SQL = "update ops.farm_calc_wake set enabled = true;";

  it("깨우기 스위치 enabled 는 기본이 꺼짐이고 이미 있는 표에도 열이 들어간다", () => {
    expect(FARMS_SQL).toMatch(
      /create table if not exists ops\.farm_calc_wake \([\s\S]*?enabled\s+boolean not null default false/,
    );
    expect(FARMS_SQL).toContain(
      "alter table ops.farm_calc_wake add column if not exists enabled boolean not null default false;",
    );
  });

  it("꺼져 있으면 깨우는 함수가 부르지도 마지막 깨우기 시각을 바꾸지도 않고(부르기 앞에서 끝), 요청 기록은 스위치와 무관하다", () => {
    const wake = FARMS_SQL.match(
      /create or replace function ops\.farm_calc_try_wake[\s\S]*?\$\$;/,
    )![0];
    // 스위치를 읽고 꺼짐이면 부르기(dispatch)와 시각 바꾸기(update) 앞에서 끝낸다
    const gate = wake.indexOf("if not coalesce(v_enabled, false) then");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(wake.indexOf("ops.dispatch_workflow"));
    expect(gate).toBeLessThan(wake.indexOf("update ops.farm_calc_wake"));
    // 요청 기록(touch_farm_calc)은 스위치를 보지 않는다
    const touch = FARMS_SQL.match(
      /create or replace function public\.touch_farm_calc[\s\S]*?\$\$;/,
    )![0];
    expect(touch).not.toMatch(/enabled/);
    expect(touch).toContain("insert into public.farm_calc_status");
  });

  it("판단 함수 farm_calc_wake_due 가 스위치 인자를 받고 꺼짐이면 늘 거짓이다 (판단표)", () => {
    expect(FARMS_SQL).toMatch(
      /function ops\.farm_calc_wake_due\(\s*p_now timestamptz,\s*p_last timestamptz,\s*p_has_newer_pending boolean,\s*p_require_pending boolean,\s*p_enabled boolean\s*\)/,
    );
    expect(FARMS_SQL).toContain("select coalesce(p_enabled, false)");
    expect(FARMS_SQL).toContain(
      "revoke all on function ops.farm_calc_wake_due(timestamptz, timestamptz, boolean, boolean, boolean) from public, anon, authenticated;",
    );
  });

  it("sync_all_farm_seasons(): 모든 농장에 안쪽 함수를 부르고 처리한 수를 돌려주며, 서버 키만 실행한다", () => {
    const fn = FARMS_SQL.match(
      /create or replace function public\.sync_all_farm_seasons\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/returns int/);
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = ''");
    expect(fn).toContain("public.sync_farm_seasons_at(v_farm, v_today)");
    expect(fn).toContain("public.kst_today()");
    // 한 농장이 실패해도 전체가 멈추지 않고, 실패한 농장은 세지 않는다 (경고에는 sqlstate 만)
    expect(fn).toMatch(
      /exception\s+when others then\s+raise warning '[^']*\(sqlstate %\)'/,
    );
    expect(FARMS_SQL).toContain(
      "revoke all on function public.sync_all_farm_seasons() from public, anon, authenticated;",
    );
    expect(FARMS_SQL).toContain(
      "grant execute on function public.sync_all_farm_seasons() to service_role;",
    );
  });

  it("되돌리기 SQL 이 새 함수(sync_all_farm_seasons · 5인자 farm_calc_wake_due)를 지운다", () => {
    expect(rollback).toContain(
      "drop function if exists public.sync_all_farm_seasons();",
    );
    expect(rollback).toContain(
      "drop function if exists ops.farm_calc_wake_due(timestamptz, timestamptz, boolean, boolean, boolean);",
    );
  });

  it("계약서와 결정 0062 에 켜는 SQL · croplib-dp 약속 · 쓰는 열이 적혀 있다", () => {
    expect(CONTRACT).toContain(ENABLE_SQL);
    expect(decision).toContain(ENABLE_SQL);
    // 정기 계산은 croplib-dp 가 collect.yml 뒤에 부른다 — CropMon cron 이 아니다
    expect(decision).toMatch(/collect\.yml/);
    expect(decision).toMatch(/CropMon cron ?이 아니/);
    expect(decision).toContain("sync_all_farm_seasons()");
    expect(CONTRACT).toContain("sync_all_farm_seasons()");
    // farm_calc_status: 누가 쓰는 열인지
    expect(CONTRACT).toMatch(
      /croplib-dp 가 쓰는 열[^\n]*`done_at`[^\n]*`result`[^\n]*`error`[^\n]*`calc_version`/,
    );
    expect(CONTRACT).toMatch(
      /트리거가 쓰는 열[^\n]*`requested_at`[^\n]*`recalc_from`/,
    );
  });

  it("확인 SQL 이 스위치 꺼짐 판단표 · 꺼짐 동작 · sync_all 항목을 가진다", () => {
    const check = readFileSync(
      join(ROOT, "supabase/checks/d1_2_farms_check.sql"),
      "utf8",
    );
    expect(check).toMatch(/'8c 깨우기 판단\(스위치 꺼짐\)/);
    expect(check).toMatch(/'8e 스위치가 꺼져 있으면/);
    expect(check).toMatch(/'4p sync_all_farm_seasons\(\)/);
  });
});

const MIGRATION_SERIES = "20261120100000_data_contract_v2_2_series.sql";
const SERIES_SQL = stripComments(
  readFileSync(join(MIGRATIONS_DIR, MIGRATION_SERIES), "utf8"),
);
const SERIES_STATEMENTS = SERIES_SQL.split(";").map((s) => s.trim());

describe("적산 계열 새 표 · 뷰 (v2.2, 결정 0063, D1-3 1단계)", () => {
  it("계약서에 새 표 둘과 계열 목록 뷰, 변경 기록 v2.2 가 있다", () => {
    for (const t of SERIES_TABLES) {
      expect(CONTRACT, t).toContain(`### \`public.${t}\``);
    }
    expect(CONTRACT).toContain("`public.crop_accum_series`");
    expect(CONTRACT).toMatch(/\*\*v2\.2:\*\*/);
    // 뷰 제목은 표 제목(### `public.…`)과 달라서 표 목록 시험에 섞이지 않는다
    expect(CONTRACT).toMatch(
      /^#### 계열 목록 뷰: `public\.crop_accum_series`/m,
    );
  });

  it("이 마이그레이션은 새 표 둘과 뷰만 만든다", () => {
    for (const t of SERIES_TABLES) {
      expect(SERIES_SQL, t).toContain(
        `create table if not exists public.${t} (`,
      );
    }
    expect(SERIES_SQL).toContain(
      "create or replace view public.crop_accum_series",
    );
    expect(
      [
        ...SERIES_SQL.matchAll(
          /create table if not exists public\.([a-z_]+)\s*\(/g,
        ),
      ].map((m) => m[1]),
    ).toEqual([...SERIES_TABLES]);
  });

  it("옛 heat_daily · sun_daily 는 한 글자도 바꾸지 않는다 (create · alter · drop · insert · update · delete · grant · revoke 어디에도 안 나온다)", () => {
    const touches = SERIES_STATEMENTS.filter(
      (s) =>
        /^(create|alter|drop|insert|update|delete|truncate|grant|revoke|comment)\b/.test(
          s,
        ) && /public\.(heat_daily|sun_daily)\b/.test(s),
    );
    expect(touches).toEqual([]);
    // 되돌리기 SQL 도 옛 표를 건드리지 않는다
    const rollback = stripComments(
      readFileSync(
        join(ROOT, "supabase/checks/d1_3a_series_rollback.sql"),
        "utf8",
      ),
    );
    expect(rollback).not.toMatch(
      /(drop|alter|delete|truncate)[^;]*\b(heat_daily|sun_daily)\b/,
    );
  });

  it("heat_series_daily 키는 (stn_id, t_base_c, cum_start_mmdd, date) 이고 crop_id 열이 없다", () => {
    const body = SERIES_SQL.match(
      /create table if not exists public\.heat_series_daily \(([\s\S]*?)\n\);/,
    )![1];
    expect(body).toMatch(
      /primary key \(stn_id, t_base_c, cum_start_mmdd, date\)/,
    );
    expect(body).not.toMatch(/\bcrop_id\b/);
    expect(body).toMatch(
      /stn_id\s+text not null references public\.stations \(stn_id\)/,
    );
    expect(body).toMatch(
      /t_base_c\s+numeric not null check \(t_base_c between -10 and 30\)/,
    );
    expect(body).toMatch(
      /cum_start_mmdd\s+text not null check \(public\.is_valid_mmdd\(cum_start_mmdd\)\)/,
    );
  });

  it("sun_series_daily 키는 (stn_id, cum_start_mmdd, date) 이고 누적 시작은 실제 있는 날만 받는다", () => {
    const body = SERIES_SQL.match(
      /create table if not exists public\.sun_series_daily \(([\s\S]*?)\n\);/,
    )![1];
    expect(body).toMatch(/primary key \(stn_id, cum_start_mmdd, date\)/);
    expect(body).not.toMatch(/\bcrop_id\b/);
    expect(body).toMatch(
      /cum_start_mmdd\s+text not null check \(public\.is_valid_mmdd\(cum_start_mmdd\)\)/,
    );
  });

  it("값 열은 옛 표와 같은 이름 · 형식이다 (heat ↔ heat_daily, sun ↔ sun_daily)", () => {
    const cols = (sql: string, table: string) =>
      sql
        .match(
          new RegExp(
            `create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
          ),
        )![1]
        .split("\n")
        .map((l) => l.trim().match(/^([a-z_0-9]+)\s+([a-z]+(?: [a-z]+)?)/))
        .filter((m): m is RegExpMatchArray => Boolean(m) && m![1] !== "primary")
        .map((m) => `${m[1]}:${m[2].replace(/ not$| default$/, "")}`);
    const oldHeat = cols(SQL, "heat_daily").filter(
      (c) => !c.startsWith("crop_id"),
    );
    const newHeat = cols(SERIES_SQL, "heat_series_daily");
    for (const c of oldHeat) expect(newHeat, c).toContain(c);
    const oldSun = cols(SQL, "sun_daily");
    const newSun = cols(SERIES_SQL, "sun_series_daily");
    for (const c of oldSun) expect(newSun, c).toContain(c);
    expect(newSun).toContain("cum_start_mmdd:text");
    expect(newHeat).toContain("cum_start_mmdd:text");
  });

  it("두 표 모두 updated_at 트리거(set_updated_at)가 있다", () => {
    for (const t of SERIES_TABLES) {
      expect(SERIES_SQL, t).toMatch(
        new RegExp(
          `create trigger ${t}_set_updated_at\\s+before update on public\\.${t}\\s+for each row execute function public\\.set_updated_at\\(\\)`,
        ),
      );
    }
  });

  it("쓰기 권한 · 쓰기 정책 · 회원 전용 정책이 없다 (서버 키만 쓴다)", () => {
    for (const t of SERIES_TABLES) {
      const grants = SERIES_STATEMENTS.filter(
        (s) => s.startsWith("grant") && s.includes(`public.${t} `),
      );
      expect(grants, t).toHaveLength(1);
      expect(grants[0]).toMatch(
        /^grant select on public\.\w+ to anon, authenticated$/,
      );
      const writePolicies = SERIES_STATEMENTS.filter(
        (s) =>
          s.startsWith("create policy") &&
          s.includes(` on public.${t} `) &&
          /for (insert|update|delete|all)/.test(s),
      );
      expect(writePolicies, t).toHaveLength(0);
    }
  });

  describe("뷰 crop_accum_series", () => {
    const view = SERIES_SQL.match(
      /create or replace view public\.crop_accum_series[\s\S]*?;/,
    )![0];

    it("security_invoker 로 읽는 사람의 권한을 쓰고, 비회원 · 회원은 읽기만 받는다", () => {
      expect(view).toContain("with (security_invoker = true)");
      expect(SERIES_SQL).toContain(
        "revoke all on public.crop_accum_series from anon, authenticated;",
      );
      expect(SERIES_SQL).toContain(
        "grant select on public.crop_accum_series to anon, authenticated;",
      );
    });

    it("열은 crop_id · season_type_id · heat_t_base_c · heat_cum_start_mmdd · sun_cum_start_mmdd", () => {
      for (const c of [
        "cs.crop_id",
        "cs.season_type_id",
        "as heat_t_base_c",
        "as heat_cum_start_mmdd",
        "as sun_cum_start_mmdd",
      ]) {
        expect(view, c).toContain(c);
      }
    });

    it("줄 기준: 단계 일수 네 개가 모두 있는 작형 + 작물 공통 (cum_start_mmdd 가 비었는지로 거르지 않는다)", () => {
      for (const c of ["l_ini_d", "l_dev_d", "l_mid_d", "l_late_d"]) {
        expect(view).toContain(`cs.${c} is not null`);
      }
      expect(view).not.toMatch(/where cs\.cum_start_mmdd is not null/);
      expect(view).toMatch(/union all[\s\S]*where c\.crop_id = 'common'/);
    });

    it("적산온도는 누적 시작과 기준온도가 모두 있을 때만, 일사는 누적 시작(없으면 01-01)을 따른다", () => {
      expect(view).toMatch(
        /case when cs\.cum_start_mmdd is not null and c\.t_base_c is not null then c\.t_base_c end as heat_t_base_c/,
      );
      expect(view).toMatch(
        /case when cs\.cum_start_mmdd is not null and c\.t_base_c is not null then cs\.cum_start_mmdd end as heat_cum_start_mmdd/,
      );
      expect(view).toContain(
        "coalesce(cs.cum_start_mmdd, '01-01') as sun_cum_start_mmdd",
      );
    });
  });

  it("확인 SQL · 되돌리기 SQL 이 있고, 되돌리기는 새 표에 줄이 있으면 멈춘다", () => {
    const check = readFileSync(
      join(ROOT, "supabase/checks/d1_3a_series_check.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      join(ROOT, "supabase/checks/d1_3a_series_rollback.sql"),
      "utf8",
    );
    expect(check).toContain("all_ok");
    expect(check).toContain("raise exception 'd1_3a_check_rollback'");
    // 비회원 · 회원 · 서버 키 모두 뷰에서 실제 줄 수를 본다 (사전 읽기 권한이 막히면 오류 없이 0줄이 된다)
    expect(check).toMatch(
      /count_as\('anon', 'select \* from public\.crop_accum_series'\) = 5/,
    );
    expect(check).toMatch(
      /count_as\('service_role', 'select \* from public\.crop_accum_series'\) = 5/,
    );
    expect(check).toMatch(
      /on conflict \(stn_id, t_base_c, cum_start_mmdd, date\) do update/,
    );
    expect(check).toMatch(
      /on conflict \(stn_id, cum_start_mmdd, date\) do update/,
    );
    expect(rollback).toMatch(
      /select count\(\*\) from public\.heat_series_daily/,
    );
    expect(rollback).toMatch(
      /select count\(\*\) from public\.sun_series_daily/,
    );
    expect(rollback).toMatch(/raise exception '되돌리기를 멈춥니다/);
    expect(rollback).not.toMatch(/drop function/);
  });

  it("결정 0063 에 croplib-dp 에 넘길 것(새 표 · on_conflict 열 · 뷰로 계열 읽기 · 옛 표는 3단계까지)이 있다", () => {
    const decision = readFileSync(
      join(ROOT, "docs/decisions/0063-accum-series.md"),
      "utf8",
    );
    expect(decision).toMatch(/croplib-dp ?에 넘길 것/);
    expect(decision).toContain("stn_id,t_base_c,cum_start_mmdd,date");
    expect(decision).toContain("stn_id,cum_start_mmdd,date");
    expect(decision).toContain("crop_accum_series");
    expect(decision).toMatch(/distinct \(heat_t_base_c, heat_cum_start_mmdd\)/);
    expect(decision).toMatch(/distinct sun_cum_start_mmdd/);
    expect(decision).toMatch(/3단계/);
    expect(CONTRACT).toMatch(
      /옛 표는 3단계에서 지움|옛 표는 3단계에서 지웁니다/,
    );
  });
});

describe("적산 계열 — croplib-dp 회신 반영 (결정 0063, 문서)", () => {
  const decision = readFileSync(
    join(ROOT, "docs/decisions/0063-accum-series.md"),
    "utf8",
  );

  it("누적 시작 전 날은 줄이 없고(그해 누적 시작일 ~ 12-31), 화면은 줄 없는 날을 작기 전으로 본다", () => {
    for (const doc of [decision, CONTRACT]) {
      expect(doc).toContain("누적 시작 전 날은 줄이 없");
      expect(doc).toContain("12-31");
      expect(doc).toMatch(/줄이 없는 날을 "작기 전"으로 (본다|봅니다)/);
    }
    // 예시: (10, 04-20) 계열은 04-20 ~ 12-31
    expect(decision).toContain("04-20 ~ 12-31");
    expect(CONTRACT).toContain("04-20 ~ 12-31");
  });

  it("t_base_c 는 자릿수 없는 numeric(실수형 아님)이고 숫자(Decimal)로 비교한다", () => {
    for (const doc of [decision, CONTRACT]) {
      expect(doc).toMatch(/`t_base_c`[^\n]*`numeric`/);
      expect(doc).toContain("실수형");
      expect(doc).toMatch(/문자열로 비교하지 말고 숫자\(Decimal\)로 비교/);
      expect(doc).toContain("`4` · `4.0` · `4.00`은 같은 키");
    }
    expect(decision).toContain("numeric(4,1)");
    // 실제 SQL 도 자릿수 없는 numeric 이다 (새 표 · 사전 · 옛 표가 같은 형식)
    expect(SERIES_SQL).toMatch(/t_base_c\s+numeric not null check/);
    expect(SERIES_SQL).not.toMatch(/numeric\(\d/);
  });
});

describe("동의 기록 (v2.3, 결정 0065, 이슈 #191)", () => {
  const file = (suffix: string, dir = MIGRATIONS_DIR) =>
    readdirSync(dir).find((n) => n.endsWith(suffix));
  const strip = (text: string) =>
    text
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .toLowerCase();

  const MIGRATION = file("_data_contract_v2_3_consent.sql");
  const CONSENT_SQL = MIGRATION
    ? strip(readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8"))
    : "";
  const CHECKS_DIR = join(ROOT, "supabase/checks");
  const CHECK = readFileSync(join(CHECKS_DIR, "l4_consent_check.sql"), "utf8");
  const ROLLBACK = strip(
    readFileSync(join(CHECKS_DIR, "l4_consent_rollback.sql"), "utf8"),
  );

  const FIVE = [
    "terms_version",
    "terms_agreed_at",
    "privacy_version",
    "privacy_confirmed_at",
    "age14_confirmed_at",
  ];
  const fn = (name: string) =>
    CONSENT_SQL.match(
      new RegExp(
        `create or replace function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$;`,
      ),
    )?.[0] ?? "";

  it("마이그레이션 파일이 있다", () => {
    expect(MIGRATION).toBeDefined();
  });

  describe("public.record_my_consent(p_terms_version, p_privacy_version)", () => {
    const body = fn("public.record_my_consent");
    const head = body.split("as $$")[0];

    it("인자 둘 · 보안 정의 · search_path 비움", () => {
      expect(body).not.toBe("");
      expect(head).toMatch(/p_terms_version text,\s*p_privacy_version text/);
      expect(head).toContain("security definer");
      expect(head).toMatch(/set search_path = ''/);
    });

    it("authenticated 만 실행한다 (public · anon 회수)", () => {
      expect(CONSENT_SQL).toMatch(
        /revoke all on function public\.record_my_consent\(text, text\) from public, anon;/,
      );
      expect(CONSENT_SQL).toMatch(
        /grant execute on function public\.record_my_consent\(text, text\) to authenticated;/,
      );
    });

    it("로그인하지 않았으면 오류(28000)", () => {
      expect(body).toMatch(/v_uid is null/);
      expect(body).toMatch(/errcode = '28000'/);
    });

    it("판 값은 앞뒤 공백을 떼고, 비었거나 100자를 넘으면 거절한다(22023)", () => {
      expect(body).toMatch(/btrim\(/);
      expect(body).toMatch(/= ''/);
      expect(body).toMatch(/length\([^)]*\) > 100/);
      expect(body).toMatch(/errcode = '22023'/);
    });

    it("줄이 없으면 member_seed 로 만든 뒤 쓴다 (ensure_my_member 와 같은 식)", () => {
      expect(body).toContain("public.member_seed(");
      expect(body).toMatch(/on conflict \(user_id\) do nothing/);
    });

    it("다섯 열을 DB 시각 하나(now())로 한 번에, 자기 줄에만 쓴다", () => {
      expect(body).toMatch(/v_now\s+timestamptz := now\(\)/);
      for (const col of FIVE) expect(body, col).toContain(col);
      for (const col of [
        "terms_agreed_at",
        "privacy_confirmed_at",
        "age14_confirmed_at",
      ]) {
        expect(body, col).toMatch(new RegExp(`${col}\\s*=\\s*v_now`));
      }
      expect(body).toMatch(/where user_id = v_uid/);
      expect(body).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    });
  });

  describe("동의 다섯 열의 직접 고치기 권한 회수", () => {
    it("다섯 열만 revoke update 한다 (표 전체 update 를 거두지 않는다)", () => {
      const m = CONSENT_SQL.match(
        /revoke update \(([^)]*)\)\s+on public\.members from authenticated;/,
      );
      expect(m).not.toBeNull();
      const cols = m![1].split(",").map((c) => c.trim());
      expect(cols.sort()).toEqual([...FIVE].sort());
    });

    it("회원에게 동의 열의 update 권한을 다시 주지 않는다 (grant update 없음)", () => {
      expect(CONSENT_SQL).not.toMatch(/grant update/);
    });
  });

  describe("public.member_has_consented()", () => {
    const body = fn("public.member_has_consented");
    const head = body.split("as $$")[0];

    it("stable · 보안 정의 · search_path 비움, authenticated 만 실행", () => {
      expect(body).not.toBe("");
      expect(head).toContain("returns boolean");
      expect(head).toContain("stable");
      expect(head).toContain("security definer");
      expect(head).toMatch(/set search_path = ''/);
      expect(CONSENT_SQL).toMatch(
        /revoke all on function public\.member_has_consented\(\) from public, anon;/,
      );
      expect(CONSENT_SQL).toMatch(
        /grant execute on function public\.member_has_consented\(\) to authenticated;/,
      );
    });

    it("자기 줄의 terms_version 이 비어 있지 않으면 참", () => {
      expect(body).toContain("auth.uid()");
      expect(body).toContain("terms_version is not null");
      expect(body).toMatch(/btrim\(m\.terms_version\) <> ''/);
    });
  });

  describe("농장 쓰기는 동의한 회원만 — 넣기 · 고치기 정책만", () => {
    const policy = (name: string, table: string, kind: string) =>
      CONSENT_SQL.match(
        new RegExp(
          `create policy "${name}"\\s+on public\\.${table} for ${kind} to authenticated[\\s\\S]*?;`,
        ),
      )?.[0] ?? "";

    it("farms: 넣기 · 고치기 with check 에 member_has_consented()", () => {
      const ins = policy("회원은 자기 농장을 만든다", "farms", "insert");
      const upd = policy("회원은 자기 농장을 고친다", "farms", "update");
      expect(ins).toContain("auth.uid() = user_id");
      expect(ins).toContain("public.member_has_consented()");
      expect(upd).toMatch(/using \(auth\.uid\(\) = user_id\)/);
      expect(upd).toMatch(/with check \([^;]*public\.member_has_consented\(\)/);
    });

    it("irrigation_logs: 넣기 · 고치기 with check 에 member_has_consented()", () => {
      const ins = policy(
        "회원은 자기 관수 기록을 넣는다",
        "irrigation_logs",
        "insert",
      );
      const upd = policy(
        "회원은 자기 관수 기록을 고친다",
        "irrigation_logs",
        "update",
      );
      expect(ins).toContain("public.member_has_consented()");
      expect(upd).toMatch(/with check \([^;]*public\.member_has_consented\(\)/);
      expect(ins).toContain("f.user_id = auth.uid()");
      expect(upd).toContain("f.user_id = auth.uid()");
    });

    it("읽기 · 지우기 정책은 건드리지 않는다 (파일에 select · delete 정책 없음)", () => {
      expect(CONSENT_SQL).not.toMatch(/create policy[^;]* for select/);
      expect(CONSENT_SQL).not.toMatch(/create policy[^;]* for delete/);
    });

    it("여러 번 실행해도 오류가 없다 — 정책은 drop policy if exists 뒤에 만든다", () => {
      const creates = CONSENT_SQL.match(/create policy "[^"]+"/g) ?? [];
      expect(creates.length).toBe(4);
      for (const c of creates) {
        const name = c.replace("create policy ", "");
        expect(CONSENT_SQL).toContain(
          `drop policy if exists ${name} on public.`,
        );
      }
    });
  });

  describe("확인 SQL · 되돌리기 SQL", () => {
    it("확인 SQL: 되돌림 방식, 맨 끝 all_ok, 이슈의 항목을 모두 덮는다", () => {
      expect(CHECK).toMatch(/raise exception 'l4_check_rollback'/);
      expect(CHECK).toContain("all_ok");
      for (const phrase of [
        "다섯 열을 직접 못 고침",
        "나머지 네 열은 고침",
        "함수로 쓰면 다섯 열이 채워짐",
        "DB 시각",
        "남의 줄은 못 씀",
        "비회원은 함수를 못 부름",
        "동의 전 농장 만들기 막힘",
        "동의 전 농장 고치기 막힘",
        "동의 전 관수 기록 넣기 막힘",
        "동의 전 관수 기록 고치기 막힘",
        "동의 뒤 농장 만들기 됨",
        "동의 전에도 자기 농장 읽기",
        "동의 전에도 자기 관수 기록 지우기",
        "동의 전에도 자기 농장 지우기",
        "빈 판 값 거절",
        "긴 판 값 거절",
        "줄이 빠진 회원",
      ]) {
        expect(CHECK, phrase).toContain(phrase);
      }
    });

    it("한 일을 한 뒤의 상태를 보는 항목(3c · 3e · 3h · 3i · 3j)은 먼저 변수에 담은 뒤 적는다 — 한 식 안의 (select …)는 함수 호출보다 먼저 계산될 수 있다(InitPlan, 3h · 3i 가 false 로 나왔던 원인)", () => {
      // 3h · 3i: 지우기 결과를 n 에 먼저 담는다 (한 식에 member_rows(...) = 1 and (select …) 로 쓰지 않는다)
      expect(CHECK).toMatch(
        /n := pg_temp\.member_rows\(u_e, format\('delete from public\.irrigation_logs/,
      );
      expect(CHECK).toMatch(
        /n := pg_temp\.member_rows\(u_e, format\('delete from public\.farms/,
      );
      expect(CHECK).not.toMatch(
        /pg_temp\.member_rows\(u_e, format\('delete[^;]*\)\) = 1\s+and \(?select/,
      );
      // 3c · 3e: 막힌 시도의 결과를 v 에 먼저 담는다
      expect(CHECK).toMatch(
        /v := pg_temp\.as_member\(u_e, format\(\$q\$update public\.farms/,
      );
      expect(CHECK).toMatch(
        /v := pg_temp\.as_member\(u_e, format\(\$q\$update public\.irrigation_logs/,
      );
    });

    it("되돌리기 SQL: 새 함수 둘을 지우고 권한 · 정책을 v2.2 상태로 돌린다", () => {
      expect(ROLLBACK).toMatch(
        /drop function if exists public\.record_my_consent\(text, text\);/,
      );
      expect(ROLLBACK).toMatch(
        /grant update \([^)]*terms_version[^)]*\)\s+on public\.members to authenticated;/,
      );
      for (const name of [
        "회원은 자기 농장을 만든다",
        "회원은 자기 농장을 고친다",
        "회원은 자기 관수 기록을 넣는다",
        "회원은 자기 관수 기록을 고친다",
      ]) {
        expect(ROLLBACK, name).toContain(`create policy "${name}"`);
      }
      // 정책이 도우미 함수를 쓰므로 정책을 먼저 되돌린 뒤 함수를 지운다
      expect(ROLLBACK.indexOf("create policy")).toBeLessThan(
        ROLLBACK.indexOf("drop function if exists public.member_has_consented"),
      );
    });
  });

  describe("계약서 v2.3", () => {
    it("버전 표 · 함수 설명 · 권한 표가 새 규칙을 말한다", () => {
      expect(CONTRACT).toMatch(/\|\s*v2\.3\s*\|/);
      expect(CONTRACT).toContain("record_my_consent");
      expect(CONTRACT).toContain("member_has_consented");
      expect(CONTRACT).toMatch(
        /`display_name`, `layout`, `font_scale`, `theme`/,
      );
    });
  });
});

describe("포도 적산온도 단계 시드 (v2.4, 결정 0070, 이슈 #201)", () => {
  const CHECKS_DIR = join(ROOT, "supabase/checks");
  const read = (dir: string, name: string) =>
    readFileSync(join(dir, name), "utf8");
  const strip = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
  const CHECK = read(CHECKS_DIR, "grape_gdd_check.sql");
  const ROLLBACK = strip(read(CHECKS_DIR, "grape_gdd_rollback.sql"));
  const D1_2 = read(CHECKS_DIR, "d1_2_farms_check.sql");
  const OLD_SOURCE =
    "FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944";

  it("계약서: v2.4 는 구조 그대로 · 사전 값만이고, 새 값 · 근거 · 비가림 기준 · 다음 구조 변경은 v2.5 를 말한다", () => {
    expect(CONTRACT).toMatch(/\|\s*v2\.4\s*\|/);
    expect(CONTRACT).toMatch(/\*\*v2\.4:\*\*[^\n]*구조 그대로[^\n]*사전 값만/);
    for (const phrase of [
      "20261121000000_seed_grape_gdd_stages.sql",
      "370",
      "1040",
      "2050",
      "만개",
      "변색기",
      "수확기",
      "비가림 04-20 기준",
      "croplib-dp #126",
      "v2.5",
    ]) {
      expect(CONTRACT, phrase).toContain(phrase);
    }
    // 옛 설명("비워 둡니다" · "나중에 넣는다")이 남아 있지 않다
    expect(CONTRACT).not.toContain(
      "`gdd_stages` · `gdd_stage_labels`는 비워 둡니다",
    );
    expect(CONTRACT).not.toContain("포도는 단계 숫자와 함께 나중에 넣는다");
  });

  it("확인 SQL: 되돌림 방식, 맨 끝 all_ok, 항목 수가 맞고, 이슈의 항목을 모두 덮는다", () => {
    expect(CHECK).toMatch(/raise exception 'grape_gdd_check_rollback'/);
    expect(CHECK).toContain("all_ok");
    const items = strip(CHECK).match(/pg_temp\.item\(res,/g)?.length ?? 0;
    expect(items).toBeGreaterThanOrEqual(10);
    expect(CHECK).toMatch(new RegExp(String.raw`count\(\*\) = ${items}\b`));
    for (const phrase of [
      "영향받은 줄 1",
      "단계 세 값",
      "라벨 세 값",
      "길이 같음",
      "기준온도 10",
      "나머지 열이 실행 전과 같음",
      "원래 글",
      "두 번 안 붙음",
      "사과 · 배추 · 공통",
      "줄 수 그대로",
      "비가림 04-20",
      "시설가온 비어 있음",
    ]) {
      expect(CHECK, phrase).toContain(phrase);
    }
  });

  it("확인 SQL: 한 일 → 변수 → 상태 확인 — 실행 전 스냅샷과 영향받은 줄 수를 먼저 변수에 담은 뒤 상태 항목을 쓴다(한 식 안의 (select …)는 함수 호출보다 먼저 계산될 수 있다, InitPlan)", () => {
    const body = strip(CHECK);
    const snapshot = body.indexOf("before_");
    const act = body.search(/update public\.crops\s+set gdd_stages/);
    const rows = body.search(/get diagnostics n = row_count/);
    const firstItem = body.indexOf("pg_temp.item(res,");
    expect(snapshot).toBeGreaterThan(-1);
    expect(act).toBeGreaterThan(snapshot);
    expect(rows).toBeGreaterThan(act);
    expect(firstItem).toBeGreaterThan(rows);
    // 한 식에 "함수 호출 결과 = 값 and (select …)"로 쓰지 않는다
    expect(body).not.toMatch(/row_count\s*=\s*1\s+and\s+\(select/);
  });

  it("확인 SQL 의 update 는 시드 파일의 update 와 글자까지 같다 (둘이 어긋나지 않게)", () => {
    const flat = (t: string) => t.replace(/\s+/g, " ").trim();
    const seed = flat(
      strip(
        readFileSync(
          join(MIGRATIONS_DIR, "20261121000000_seed_grape_gdd_stages.sql"),
          "utf8",
        ),
      ),
    );
    expect(flat(strip(CHECK))).toContain(seed.replace(/;$/, ""));
  });

  it("되돌리기 SQL: 두 열을 다시 비우고 source 를 원래 글로 돌린다 (포도 한 줄만, 여러 번 실행해도 같음)", () => {
    const flat = ROLLBACK.replace(/\s+/g, " ").trim();
    expect(flat).toMatch(/^update public\.crops set /);
    expect(flat).toContain("gdd_stages = null");
    expect(flat).toContain("gdd_stage_labels = null");
    expect(flat).toContain(`source = '${OLD_SOURCE}'`);
    expect(flat).toMatch(/where crop_id = 'grape';$/);
    expect(flat.match(/\bupdate\b/g)).toHaveLength(1);
  });

  it("d1_2 확인 SQL 11a: 적산 단계 · 라벨이 비어 있다 → 새 값과 같다로 맞췄다 (항목 수: v2.4 때 118, v2.6 에서 동작 11개를 더해 129)", () => {
    const block = D1_2.slice(D1_2.indexOf("'11a "), D1_2.indexOf("'11b "));
    expect(block).toContain("새 값과 같다");
    expect(block).toContain("gdd_stages = '{370,1040,2050}'");
    expect(block).toMatch(/gdd_stage_labels = '\{만개,변색기,수확기\}'/);
    expect(block).not.toContain("gdd_stages is null");
    expect(D1_2).toMatch(/count\(\*\) = 129\b/);
  });
});

describe("옛 적산 표 지우기 (v2.5, 결정 0074, D1-3 3-②)", () => {
  const OLD = ["heat_daily", "sun_daily"];
  const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
  const dropFile = () =>
    stripComments(
      read(
        "supabase/migrations/20261126000000_data_contract_v2_5_drop_old_accum.sql",
      ),
    );
  const statements = (sql: string) =>
    sql
      .split(";")
      .map((x) => x.replace(/\s+/g, " ").trim())
      .filter(Boolean);

  it("마이그레이션은 두 표를 지우는 두 문장뿐이고 cascade 를 쓰지 않는다 (여러 번 실행해도 됨)", () => {
    expect(statements(dropFile())).toEqual(
      OLD.map((t) => `drop table if exists public.${t}`),
    );
    expect(dropFile()).not.toContain("cascade");
  });

  it("계약서에서 옛 표 절이 빠지고 변경 기록 v2.5 가 있다", () => {
    for (const t of OLD) {
      expect(CONTRACT).not.toContain(`### \`public.${t}\``);
    }
    expect(CONTRACT).toMatch(/\*\*v2\.5:\*\*/);
    expect(CONTRACT).toMatch(/^\| v2\.5 +\|/m);
  });

  it("확인 SQL 은 읽기만 하고, 옛 표 없음 · 새 표 둘과 뷰 · 줄 수를 보고 all_ok 한 줄을 돌려준다", () => {
    const check = stripComments(
      read("supabase/checks/d1_3b_drop_old_check.sql"),
    );
    expect(statements(check)).toHaveLength(1);
    expect(check).not.toMatch(
      /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/,
    );
    for (const name of [...OLD, ...SERIES_TABLES, "crop_accum_series"]) {
      expect(check).toContain(`to_regclass('public.${name}')`);
    }
    for (const t of SERIES_TABLES) {
      expect(check).toContain(`count(*) from public.${t}`);
    }
    expect(check).toContain("all_ok");
  });

  it("되돌리기 SQL 은 빈 옛 표를 원래 구조(키 · RLS · 정책 · 트리거 · 권한)로 만들고, 줄은 못 살린다고 적는다", () => {
    const raw = read("supabase/checks/d1_3b_drop_old_rollback.sql");
    expect(raw.split("\n").slice(0, 3).join("\n")).toContain(
      "줄은 살리지 못함",
    );
    const sql = stripComments(raw);
    expect(sql).toMatch(/primary key \(stn_id, crop_id, date\)/);
    expect(sql).toMatch(/primary key \(stn_id, date\)/);
    expect(sql).toContain("references public.crops (crop_id)");
    for (const t of OLD) {
      for (const phrase of [
        `create table if not exists public.${t} (`,
        `alter table public.${t} enable row level security`,
        `revoke all on public.${t} from anon, authenticated`,
        `grant select on public.${t} to anon, authenticated`,
        `grant all on public.${t} to service_role`,
        `create policy "${t} 누구나 읽기"`,
        `create trigger ${t}_set_updated_at`,
      ]) {
        expect(sql).toContain(phrase);
      }
    }
    expect(sql).not.toMatch(/\binsert into\b/);
  });
});
