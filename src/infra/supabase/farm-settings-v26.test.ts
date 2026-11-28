import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** 데이터 계약 v2.6 내 농장 설정 칸 (이슈 #215, 결정 0076) — SQL · 문서 글자 검사. */
const ROOT = process.cwd();
const read = (path: string) =>
  existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "";
const flat = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const NAME = "20261128000000_data_contract_v2_6_farm_settings.sql";
const RAW = read(`supabase/migrations/${NAME}`);
const SQL = flat(RAW);
const fn = (name: string) =>
  SQL.match(
    new RegExp(
      `create or replace function ${name.replace(/\./g, "\\.")}\\(.*?\\$\\$;`,
    ),
  )?.[0] ?? "";
const trigger = (name: string) =>
  SQL.match(new RegExp(`create trigger ${name} .*?;`))?.[0] ?? "";

describe("irrigation_methods 사전", () => {
  it("RLS · 누구나 읽기 · 쓰기 권한 없음", () => {
    for (const phrase of [
      "create table if not exists public.irrigation_methods (",
      "alter table public.irrigation_methods enable row level security;",
      "revoke all on public.irrigation_methods from anon, authenticated;",
      "grant select on public.irrigation_methods to anon, authenticated;",
    ]) {
      expect(SQL, phrase).toContain(phrase);
    }
    expect(SQL).toMatch(
      /create policy "irrigation_methods 누구나 읽기" on public\.irrigation_methods for select to anon, authenticated using \(true\);/,
    );
    expect(SQL).not.toMatch(
      /grant (insert|update|delete|all)[^;]*irrigation_methods to (anon|authenticated)/,
    );
  });

  it("효율 0 < x <= 1, 기본은 하나만", () => {
    expect(SQL).toContain("check (efficiency > 0 and efficiency <= 1)");
    expect(SQL).toMatch(
      /create unique index if not exists irrigation_methods_one_default on public\.irrigation_methods \(is_default\) where is_default;/,
    );
  });

  it("점적 0.95(기본) · 스프링클러 0.75 · 도랑 0.40, 다시 실행해도 됨", () => {
    expect(SQL).toMatch(/\('drip', '점적관수', '[^']+', 0\.95, true, 1,/);
    expect(SQL).toMatch(
      /\('sprinkler', '스프링클러', '[^']+', 0\.75, false, 2,/,
    );
    expect(SQL).toMatch(/\('furrow', '도랑관수', '[^']+', 0\.40, false, 3,/);
    expect(SQL).toContain("관개 방식별 대표 효율, 사용자 결정 2026-11-27");
    expect(SQL).toContain("on conflict (method_code) do update set");
  });
});

describe("farms 새 칸", () => {
  it("관수 방법(기본 drip, 외래키) · 뿌리 깊이 6가지", () => {
    expect(SQL).toContain(
      "add column if not exists irrigation_method text not null default 'drip'",
    );
    expect(SQL).toContain(
      "foreign key (irrigation_method) references public.irrigation_methods (method_code)",
    );
    expect(SQL).toContain("check (zr_m in (0.3, 0.5, 0.8, 1.0, 1.2, 1.5))");
    expect(SQL).not.toMatch(/alter table public\.crops add constraint/);
  });

  it("단계 일수 넷은 함께 비거나 함께 차고, 각 5~200 · 합 366 이하", () => {
    expect(SQL).toContain(
      "check ( num_nulls(l_ini_d, l_dev_d, l_mid_d, l_late_d) = 4 or ( num_nulls(l_ini_d, l_dev_d, l_mid_d, l_late_d) = 0 " +
        "and l_ini_d between 5 and 200 and l_dev_d between 5 and 200 and l_mid_d between 5 and 200 and l_late_d between 5 and 200 " +
        "and l_ini_d + l_dev_d + l_mid_d + l_late_d <= 366 ) )",
    );
  });

  it("회원 넣기 · 고치기 열 권한에 새 6열을 더한다", () => {
    const cols = "irrigation_method, zr_m, l_ini_d, l_dev_d, l_mid_d, l_late_d";
    expect(SQL).toContain(
      `grant insert (${cols}) on public.farms to authenticated;`,
    );
    expect(SQL).toContain(
      `grant update (${cols}) on public.farms to authenticated;`,
    );
    expect(SQL).not.toContain('create policy "회원은 자기 농장을');
  });

  describe("farms_check_settings (before insert or update)", () => {
    const body = fn("public.farms_check_settings");

    it("작목 · 작형이 바뀌면 먼저 단계 일수 · 뿌리 깊이를 비운다", () => {
      const clear = body.indexOf("new.zr_m := null;");
      expect(body).toMatch(
        /\(old\.crop_id, old\.season_type_id\) is distinct from \(new\.crop_id, new\.season_type_id\)/,
      );
      for (const c of ["l_ini_d", "l_dev_d", "l_mid_d", "l_late_d", "zr_m"]) {
        expect(body).toContain(`new.${c} := null;`);
      }
      expect(clear).toBeLessThan(body.indexOf("not s.farm_open"));
    });

    it("작물 공통 · farm_open · stage_editable 을 거절한다(23514)", () => {
      expect(body).toMatch(/new\.crop_id = 'common'/);
      expect(body).toMatch(
        /\(tg_op = 'insert' or v_changed\) and not s\.farm_open/,
      );
      expect(body).toContain("not s.stage_editable");
      expect(body.match(/errcode = '23514'/g)).toHaveLength(3);
      // 작목과 안 맞는 작형은 외래키(23503)가 거절하게 작목까지 맞는 줄만 본다
      expect(body).toContain("and crop_id = new.crop_id");
    });

    it("트리거가 걸려 있다", () => {
      expect(trigger("farms_check_settings")).toContain(
        "before insert or update on public.farms for each row execute function public.farms_check_settings()",
      );
    });
  });

  describe("다시 계산", () => {
    it("관수 방법 · 뿌리 깊이는 지점 · 토성 · 면적과 같은 길", () => {
      const t = trigger("farms_after_update_calc");
      expect(t).toContain(
        "after update of stn_id, soil_code, irrigated_area_m2, irrigation_method, zr_m on public.farms",
      );
      for (const c of ["irrigation_method", "zr_m"]) {
        expect(t).toContain(`old.${c} is distinct from new.${c}`);
      }
    });

    it("단계 일수 · 시작일 출처는 작기 줄을 다시 맞추는 길", () => {
      const t = trigger("farms_after_update_crop");
      expect(t).toContain(
        "after update of crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source, season_end_mmdd, l_ini_d, l_dev_d, l_mid_d, l_late_d on public.farms",
      );
      for (const c of [
        "season_start_source",
        "l_ini_d",
        "l_dev_d",
        "l_mid_d",
        "l_late_d",
      ]) {
        expect(t).toContain(`old.${c} is distinct from new.${c}`);
      }
    });

    it("매년 날짜가 바뀌면 sync 전에 올해만을 풀고, 단계 일수가 바뀌면 sync 뒤 지금 줄 시작일로 요청한다", () => {
      const body = fn("public.farms_after_update_crop");
      const release = body.indexOf("start_source = 'this_year'");
      const sync = body.indexOf("public.sync_farm_seasons_at(");
      const touch = body.indexOf(
        "public.touch_farm_calc(new.farm_id, cur.start_date)",
      );
      expect(body).toContain(
        "old.season_start_mmdd is distinct from new.season_start_mmdd",
      );
      expect(release).toBeGreaterThan(-1);
      expect(sync).toBeGreaterThan(release);
      expect(touch).toBeGreaterThan(sync);
    });
  });
});

describe("crop_seasons 새 칸 · 값", () => {
  it("단계 이름(길이 4) · 시작 사건 이름 · 고치기 가능 · 농장에서 고르기", () => {
    for (const phrase of [
      "add column if not exists stage_labels text[]",
      "check (stage_labels is null or cardinality(stage_labels) = 4)",
      "add column if not exists start_event_label text",
      "add column if not exists stage_editable boolean not null default false",
      "add column if not exists farm_open boolean not null default true",
    ]) {
      expect(SQL, phrase).toContain(phrase);
    }
  });

  it.each([
    [
      "apple-main",
      "{발아·개화기,신초·유과기,과실 비대기,성숙·수확기}",
      "싹 튼 날",
      "true",
      "true",
    ],
    [
      "grape-rainshelter",
      "{발아·전엽기,신초·개화기,과실 비대·성숙기,수확·낙엽기}",
      "싹 튼 날",
      "true",
      "false",
    ],
    [
      "grape-heated",
      "{가온·발아기,신초·개화기,과실 비대·성숙기,수확 뒤}",
      "가온 시작한 날",
      "true",
      "false",
    ],
    [
      "kimchi_cabbage-summer",
      "{활착기,생육기,결구기,수확기}",
      "아주 심은 날",
      "false",
      "true",
    ],
  ])("%s 의 값", (id, labels, event, editable, open) => {
    const list = labels.slice(1, -1).split(",");
    expect(SQL).toContain(
      `set stage_labels = array[${list.map((l) => `'${l}'`).join(", ")}], start_event_label = '${event}', stage_editable = ${editable}, farm_open = ${open} where season_type_id = '${id}';`,
    );
  });

  it("사과 30·60·90·45 · 배추 15·20·15·10, 근거를 덧붙인 전체 문장", () => {
    expect(SQL).toMatch(
      /set l_ini_d = 30, l_dev_d = 60, l_mid_d = 90, l_late_d = 45, source = 'cropwater crops_library\.csv\. 단계 일수: 사공동훈 외 2013 · 권헌중·사공동훈 2022 · 국립원예특작과학원 만개 평균 2018–2024, 사용자 결정 2026-11-27' where season_type_id = 'apple-main';/,
    );
    expect(SQL).toMatch(
      /set l_ini_d = 15, l_dev_d = 20, l_mid_d = 15, l_late_d = 10, source = 'cropwater crops_library\.csv\. 태백 실측으로 보정 예정\. 단계 일수: 이경도 외 2017 · 김진희·윤진일 2015, 사용자 결정 2026-11-27' where season_type_id = 'kimchi_cabbage-summer';/,
    );
  });

  it("2027 조건의 끝만 바꾼다 (2026 은 그대로)", () => {
    const updates = SQL.match(/update public\.scenarios [^;]*;/g);
    expect(updates).toEqual([
      "update public.scenarios set season_end = '2027-11-11' where season_type_id = 'apple-main' and season_year = 2027;",
      "update public.scenarios set season_end = '2027-08-29' where season_type_id = 'kimchi_cabbage-summer' and season_year = 2027;",
    ]);
  });
});

describe("farm_calc_status 물 계수 곡선 칸", () => {
  it("꼭짓점 · 확정 여부 · 단계 경계 · 작기 줄 번호 (모두 빈칸 허용)", () => {
    for (const c of ["kc_ini", "kc_mid_adj", "kc_end_adj"]) {
      expect(SQL).toContain(`add column if not exists ${c} numeric`);
    }
    for (const c of ["kc_mid_final", "kc_end_final"]) {
      expect(SQL).toContain(`add column if not exists ${c} boolean`);
    }
    for (const c of ["dev_start", "mid_start", "late_start", "season_end"]) {
      expect(SQL).toContain(`add column if not exists ${c} date`);
    }
    expect(SQL).toContain("add column if not exists curve_farm_season_id uuid");
    expect(SQL).toContain(
      "foreign key (curve_farm_season_id) references public.farm_seasons (farm_season_id) on delete set null",
    );
    expect(SQL).not.toMatch(
      /grant (insert|update|delete)[^;]*farm_calc_status/,
    );
  });
});

describe("작기 시작일 두 겹", () => {
  it("farm_seasons 에 start_source · start_confirmed_at, 기존 줄 채우기", () => {
    expect(SQL).toContain(
      "add column if not exists start_source text not null default 'default'",
    );
    expect(SQL).toContain(
      "check (start_source in ('default', 'yearly', 'this_year'))",
    );
    expect(SQL).toContain(
      "add column if not exists start_confirmed_at timestamptz",
    );
    expect(SQL).toMatch(
      /update public\.farm_seasons s set start_source = 'yearly' from public\.farms f where f\.farm_id = s\.farm_id and f\.season_start_source = 'user' and s\.start_source = 'default';/,
    );
  });

  describe("sync_farm_seasons_at", () => {
    const body = fn("public.sync_farm_seasons_at");

    it("작기 길이는 농장의 단계 일수 넷이 있으면 그 합", () => {
      expect(body).toMatch(
        /if f\.l_ini_d is not null then v_len := f\.l_ini_d \+ f\.l_dev_d \+ f\.l_mid_d \+ f\.l_late_d;/,
      );
    });

    it("규칙 다: 올해만 줄, 또는 이미 시작했고 월-일이 같은 줄은 시작일을 두고 끝만 바꾼다", () => {
      expect(body).toContain(
        "(cur.crop_id, cur.season_type_id, cur.kc_set_id) is not distinct from (f.crop_id, f.season_type_id, f.kc_set_id)",
      );
      expect(body).toContain("cur.start_source = 'this_year'");
      expect(body).toContain(
        "cur.start_date <= p_today and to_char(cur.start_date, 'mm-dd') = coalesce(f.season_start_mmdd, '01-01')",
      );
      expect(body).toContain("v_start := cur.start_date;");
    });

    it("규칙 가: 가장 최근 지난 줄이 같은 작형의 올해만이고 새 창과 겹치면 다음 해 창", () => {
      expect(body).toMatch(
        /where farm_id = p_farm_id and end_date < p_today order by end_date desc limit 1;/,
      );
      expect(body).toMatch(
        /while last\.start_source = 'this_year' and last\.season_type_id = f\.season_type_id and last\.end_date >= v_start loop v_start := \(v_start \+ interval '1 year'\)::date;/,
      );
      // 지난 줄을 자르거나 지우기 전에 창을 정한다
      expect(body.indexOf("while last.start_source")).toBeLessThan(
        body.indexOf("end_date < p_today and start_date >= v_start"),
      );
    });

    it("규칙 라: 시작일 · 작목 · 작형 · 재배 방식이 바뀌면 확인 시각을 비운다", () => {
      expect(body).toMatch(
        /start_confirmed_at = case when \(crop_id, season_type_id, kc_set_id, start_date\) is distinct from \(f\.crop_id, f\.season_type_id, f\.kc_set_id, v_start\) then null else start_confirmed_at end/,
      );
    });

    it("새 줄의 출처는 default · yearly 뿐", () => {
      expect(body).toContain(
        "case when f.season_start_source = 'user' then 'yearly' else 'default' end",
      );
    });

    it("직접 실행할 수 없다", () => {
      expect(SQL).toContain(
        "revoke all on function public.sync_farm_seasons_at(uuid, date) from public, anon, authenticated, service_role;",
      );
    });
  });

  describe.each([
    ["public.set_this_season_start", "date"],
    ["public.confirm_this_season_start", ""],
  ])("%s", (name, args) => {
    const body = fn(name);

    it("보안 정의 · search_path 비움 · 인자로 농장 번호를 받지 않는다", () => {
      const head = body.split("as $$")[0];
      expect(head).toContain("security definer");
      expect(head).toContain("set search_path = ''");
      expect(head).not.toContain("uuid");
    });

    it("authenticated 만 실행", () => {
      expect(SQL).toContain(
        `revoke all on function ${name}(${args}) from public, anon, authenticated, service_role;`,
      );
      expect(SQL).toContain(
        `grant execute on function ${name}(${args}) to authenticated;`,
      );
    });

    it("로그인 → 동의 → 농장 → 지금 줄 순서로 거절", () => {
      const at = [
        "'not authenticated' using errcode = '28000'",
        "'consent required' using errcode = '42501'",
        "'no farm' using errcode = 'p0002'",
        "'no current season' using errcode = 'p0002'",
      ].map((p) => body.indexOf(p));
      expect(at.every((i) => i > -1)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(body).toContain("not public.member_has_consented()");
      expect(body).toContain("where user_id = v_uid for update");
    });
  });

  it("set_this_season_start: ±60일 · 지난 줄 · 끝난 작기 거절, 올해만으로 기록", () => {
    const body = fn("public.set_this_season_start");
    for (const phrase of [
      "'start date required' using errcode = '22023'",
      "'start date out of range' using errcode = '22023'",
      "'start date overlaps previous season' using errcode = '22023'",
      "'season would already be over' using errcode = '22023'",
      "abs(p_start - v_anchor) > 60",
      "coalesce(s.start_mmdd, f.season_start_mmdd)",
      "p_start <= v_prev_end",
      "v_end < v_today",
      "start_source = 'this_year'",
      "start_confirmed_at = now()",
      "start_unset = false",
    ]) {
      expect(body, phrase).toContain(phrase);
    }
  });

  it("confirm_this_season_start 는 확인 시각만 쓴다", () => {
    expect(fn("public.confirm_this_season_start")).toContain(
      "update public.farm_seasons set start_confirmed_at = now() where farm_season_id = cur.farm_season_id;",
    );
  });
});

describe("확인 · 되돌리기 SQL", () => {
  it("v2.6 확인 SQL 은 읽기만 하는 한 문장이고 all_ok 한 줄", () => {
    const check = flat(read("supabase/checks/v2_6_farm_settings_check.sql"));
    expect(check.split(";").filter((s) => s.trim())).toHaveLength(1);
    expect(check.replace(/'[^']*'/g, "''")).not.toMatch(
      /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/,
    );
    for (const phrase of [
      "irrigation_methods",
      "farms_zr_m_choice",
      "farms_stage_days_rule",
      "farms_irrigation_method_fk",
      "farm_calc_status_curve_season_fk",
      "farm_seasons_start_source_check",
      "cardinality(stage_labels) = 4",
      "farm_open",
      "stage_editable",
      "2027-11-11",
      "2027-08-29",
      "farms_check_settings",
      "set_this_season_start",
      "confirm_this_season_start",
      "has_function_privilege('anon'",
      "has_function_privilege('authenticated'",
      "has_function_privilege('service_role'",
      "all_ok",
    ]) {
      expect(check, phrase).toContain(phrase);
    }
  });

  it("되돌리기 SQL: farms 줄이 있으면 멈추고, 함수 · 칸 · 표를 지우고 옛 값으로", () => {
    const sql = flat(read("supabase/checks/v2_6_farm_settings_rollback.sql"));
    for (const phrase of [
      "select count(*) into n from public.farms",
      "drop function if exists public.set_this_season_start(date);",
      "drop function if exists public.confirm_this_season_start();",
      "drop function if exists public.farms_check_settings();",
      "create or replace function public.sync_farm_seasons_at(",
      "drop column if exists irrigation_method",
      "drop column if exists start_source",
      "drop column if exists curve_farm_season_id",
      "drop column if exists farm_open",
      "drop table if exists public.irrigation_methods;",
      "set l_ini_d = 20, l_dev_d = 70, l_mid_d = 90, l_late_d = 30",
      "set l_ini_d = 25, l_dev_d = 30, l_mid_d = 25, l_late_d = 10",
      "season_end = '2027-10-27'",
      "season_end = '2027-09-28'",
    ]) {
      expect(sql, phrase).toContain(phrase);
    }
  });

  it("d1_2 확인 SQL: 새 일수 · 포도는 블록 안에서만 열기 · v2.6 동작 항목", () => {
    const raw = read("supabase/checks/d1_2_farms_check.sql");
    const check = flat(raw);
    expect(check).toContain(
      "update public.crop_seasons set farm_open = true where crop_id = 'grape';",
    );
    expect(raw).toContain("raise exception 'd1_2_check_rollback'");
    // 포도를 여는 쓰기는 되돌려지는 블록 안(시작과 일부러 낸 오류 사이)에 있다
    expect(raw.indexOf("set farm_open = true")).toBeGreaterThan(
      raw.indexOf("do $check$"),
    );
    expect(raw.indexOf("set farm_open = true")).toBeLessThan(
      raw.indexOf("raise exception 'd1_2_check_rollback'"),
    );
    for (const item of [
      "13a 포도 작형으로 농장 넣기는 거절",
      "13b 배추에 단계 일수는 거절",
      "13c 단계 일수 셋만 넣기는 거절",
      "13d 작형을 바꾸면 단계 일수 · 뿌리 깊이가 비워진다",
      "13e",
      "13f",
      "13g 규칙 가",
      "13h 규칙 다",
    ]) {
      expect(raw, item).toContain(item);
    }
    const items = (check.match(/pg_temp\.item\(res,/g)?.length ?? 0) - 1; // 9c 는 두 갈래 중 하나만
    expect(raw).toContain(`count(*) = ${items} from d1_2_results`);
  });
});

describe("문서 · 가짜 서버", () => {
  const contract = read("docs/DATA_CONTRACT.md");

  it("데이터 계약 v2.6: 판 이력 · 새 칸 · croplib-dp 쓰기 규칙 · 새 일수 · 포도 닫힘", () => {
    expect(contract).toMatch(/## 현재 버전: v2\.6\b/);
    expect(contract).toMatch(/\*\*v2\.6:\*\*/);
    expect(contract).toMatch(/^\| v2\.6 +\|/m);
    for (const phrase of [
      "### `public.irrigation_methods`",
      "`irrigation_method`",
      "`stage_editable`",
      "`farm_open`",
      "`start_source`",
      "`curve_farm_season_id`",
      "set_this_season_start",
      "confirm_this_season_start",
      "그 단계의 끝 날이 어제 이전이고 그 단계 관측이 10일 이상",
      "한 번의 update",
      "season_end`는 `farm_seasons.end_date`와 같아야",
      "30·60·90·45",
      "15·20·15·10",
      "start date out of range",
    ]) {
      expect(contract, phrase).toContain(phrase);
    }
  });

  it("결정 0076 에 여섯 규칙과 공개 관수효율 분리가 있다", () => {
    const d = read("docs/decisions/0076-farm-settings-v2-6.md");
    for (const phrase of [
      "가.",
      "나.",
      "다.",
      "라.",
      "마.",
      "바.",
      "0.95",
      "따로 관리",
      "농장 id",
    ]) {
      expect(d, phrase).toContain(phrase);
    }
  });

  it("가짜 Supabase 에 irrigation_methods 가 있다", () => {
    expect(read("e2e/fake-supabase.mjs")).toContain("irrigation_methods");
  });

  it("마이그레이션이 가장 마지막 파일이다", () => {
    expect(readdirSync(join(ROOT, "supabase/migrations")).sort().at(-1)).toBe(
      NAME,
    );
  });
});
