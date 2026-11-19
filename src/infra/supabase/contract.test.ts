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
  it("계약서에 공개 테이블 14개와 회원 표 members, app_health 가 있다", () => {
    expect(tablesInContract().sort()).toEqual(
      [...PUBLIC_TABLES, MEMBERS_TABLE, HEALTH_TABLE].sort(),
    );
  });

  it("마이그레이션이 만드는 테이블이 계약서의 테이블과 같다", () => {
    expect(tablesInSql().sort()).toEqual(tablesInContract().sort());
  });

  it("계약서의 현재 버전이 v2.0 이다", () => {
    expect(CONTRACT).toMatch(/## 현재 버전: v2\.0\b/);
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

  describe.each(["heat_daily", "sun_daily"])(
    "public.%s 올린 시각 (v1.8)",
    (table) => {
      it("updated_at 열이 비어 있지 않고 기본값은 now() 이다", () => {
        expect(SQL).toMatch(
          new RegExp(
            `alter table public\\.${table}\\s+add column if not exists updated_at timestamptz not null default now\\(\\)`,
          ),
        );
      });

      it("고쳐 쓸 때(upsert 포함)도 updated_at 을 갱신하는 트리거가 있다", () => {
        expect(SQL).toMatch(
          new RegExp(
            `create trigger ${table}_set_updated_at\\s+before update on public\\.${table}\\s+for each row execute function public\\.set_updated_at\\(\\)`,
          ),
        );
      });

      it("계약서 표에 updated_at 이 적혀 있다", () => {
        const section = CONTRACT.split(`### \`public.${table}\``)[1].split(
          "### `public.",
        )[0];
        expect(section).toContain("`updated_at`");
      });
    },
  );

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
