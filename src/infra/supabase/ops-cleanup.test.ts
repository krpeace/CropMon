import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** 정기 정리 O2 (이슈 #213, 결정 0075) — SQL · 문서 글자 검사. */
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

const MIGRATION = "supabase/migrations/20261127000000_ops_cleanup.sql";
const SQL = flat(read(MIGRATION));
const FN =
  SQL.match(
    /create or replace function ops\.cleanup_accounts\(\).*?\$\$;/,
  )?.[0] ?? "";
const BODY = FN.split("as $$")[1] ?? "";
const STATEMENTS = BODY.split(";").map((s) => s.trim());

/** 이슈의 대상 조건 그대로: 23시간 넘었고, 동의 판 값이 있는 members 줄이 없다. */
const TARGET =
  "u.created_at <= now() - interval '23 hours' and not exists ( " +
  "select 1 from public.members m where m.user_id = u.id " +
  "and m.terms_version is not null and btrim(m.terms_version) <> '' )";

describe("ops.cleanup_accounts() 마이그레이션", () => {
  it("jsonb 를 돌려주는 보안 정의 함수이고 search_path 를 비운다", () => {
    const head = FN.split("as $$")[0];
    expect(head).toContain("returns jsonb");
    expect(head).toContain("security definer");
    expect(head).toContain("set search_path = ''");
  });

  it("지운 줄 수를 세 이름으로 돌려준다", () => {
    for (const key of ["unconsented_users", "withdrawn_rows", "cron_runs"]) {
      expect(BODY).toContain(`'${key}'`);
    }
    expect(BODY.match(/get diagnostics \w+ = row_count/g)).toHaveLength(3);
  });

  it("지우는 문장은 셋뿐이다", () => {
    expect(SQL.match(/delete from [a-z_.]+/g)).toEqual([
      "delete from auth.users",
      "delete from ops.withdrawn_accounts",
      "delete from cron.job_run_details",
    ]);
    expect(SQL).not.toMatch(/\b(truncate|drop table)\b/);
  });

  it("계정 delete 의 조건은 이슈 조건 그대로다 (23시간 · members 없음 또는 동의 판이 null · 공백)", () => {
    expect(STATEMENTS).toContain(`delete from auth.users u where ${TARGET}`);
  });

  it("delete 앞에서 auth.users → members 순서로, 별도 문장으로 잠근다", () => {
    const users = STATEMENTS.indexOf(
      `begin perform 1 from auth.users u where ${TARGET} for update of u`,
    );
    const members = STATEMENTS.indexOf(
      "perform 1 from public.members where user_id in ( " +
        `select u.id from auth.users u where ${TARGET} ) for update`,
    );
    const remove = STATEMENTS.indexOf(
      `delete from auth.users u where ${TARGET}`,
    );
    expect(users).toBeGreaterThanOrEqual(0);
    expect(members).toBeGreaterThan(users);
    expect(remove).toBeGreaterThan(members);
    expect(BODY).not.toContain("left join");
  });

  it("탈퇴 기록 · 예약 실행 기록은 7일이 지난 것만 지운다", () => {
    expect(STATEMENTS).toContain(
      "delete from ops.withdrawn_accounts where withdrawn_at < now() - interval '7 days'",
    );
    expect(STATEMENTS).toContain(
      "delete from cron.job_run_details where end_time < now() - interval '7 days'",
    );
  });

  it("동의 전 계정은 탈퇴 해시를 남기지 않는다", () => {
    expect(SQL).not.toContain("insert into");
  });

  it("누구에게도 실행 권한을 주지 않는다", () => {
    expect(SQL).toContain(
      "revoke all on function ops.cleanup_accounts() from public, anon, authenticated, service_role;",
    );
    expect(SQL).not.toMatch(/\bgrant\b/);
  });

  it("매시간 7분에 ops-cleanup-hourly 로 예약한다", () => {
    expect(SQL).toContain(
      "select cron.schedule('ops-cleanup-hourly', '7 * * * *', $cron$select ops.cleanup_accounts()$cron$);",
    );
  });
});

describe("확인 · 되돌리기 SQL", () => {
  it("확인 SQL 은 읽기만 하는 한 문장이고, 함수 · 권한 · 예약을 보고 all_ok 를 낸다", () => {
    const check = flat(read("supabase/checks/o2_cleanup_check.sql"));
    expect(check.split(";").filter((s) => s.trim())).toHaveLength(1);
    expect(check).not.toMatch(
      /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/,
    );
    expect(check).not.toContain("select ops.cleanup_accounts() from");
    for (const phrase of [
      "to_regprocedure('ops.cleanup_accounts()')",
      "prosecdef",
      'search_path=""',
      "has_function_privilege('anon'",
      "has_function_privilege('authenticated'",
      "has_function_privilege('service_role'",
      "from cron.job",
      "jobname = 'ops-cleanup-hourly'",
      "schedule = '7 * * * *'",
      "active",
      "all_ok",
    ]) {
      expect(check, phrase).toContain(phrase);
    }
  });

  it("되돌리기 SQL 은 첫 줄에 지운 계정은 못 살린다고 적고, 예약을 멈춘 뒤 함수를 지운다", () => {
    const raw = read("supabase/checks/o2_cleanup_rollback.sql");
    expect(raw.split("\n")[0]).toContain("지운 계정은 되돌릴 수 없음");
    const sql = flat(raw);
    const stop = sql.indexOf("cron.unschedule(");
    const drop = sql.indexOf("drop function if exists ops.cleanup_accounts();");
    expect(sql).toContain("jobname = 'ops-cleanup-hourly'");
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(stop);
  });
});

describe("문서", () => {
  const contract = read("docs/DATA_CONTRACT.md");

  it("데이터 계약은 실제 함수 이름 · 주기 · 기준을 적고, 판은 올리지 않는다", () => {
    expect(contract).toContain("ops.cleanup_accounts()");
    expect(contract).toContain("매시간 7분");
    expect(contract).toContain("23시간");
    expect(contract).not.toContain("정리 작업(O2)");
    expect(contract).not.toContain("정리 작업 O2");
    expect(contract).not.toMatch(/^\| v2\.6 +\|/m);
  });

  it("구조 문서의 예약 목록과 결정 0075 가 있다", () => {
    expect(read("docs/ARCHITECTURE.md")).toContain("ops-cleanup-hourly");
    const decision = read("docs/decisions/0075-ops-cleanup.md");
    expect(decision).toContain("ops.cleanup_accounts()");
    expect(decision).toContain("해시");
    expect(decision).toContain("연결 끊기");
  });
});
