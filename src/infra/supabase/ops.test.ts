import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** 운영 예약(결정 0014)이 토큰을 담지 않고, 정해진 시각에 정해진 워크플로만 부르는지 검사한다. */
const DIR = join(process.cwd(), "supabase/migrations");
const ALL = readdirSync(DIR)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => readFileSync(join(DIR, n), "utf8"))
  .join("\n");
const OPS = readFileSync(
  join(DIR, "20261026010000_ops_dispatch_cron.sql"),
  "utf8",
);
const CODE = OPS.replace(/--.*$/gm, "");

describe("운영 예약 (Supabase pg_cron → croplib-dp workflow_dispatch)", () => {
  it("마이그레이션 어디에도 GitHub 토큰이 없다", () => {
    expect(ALL).not.toMatch(
      /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/,
    );
    expect(CODE).toMatch(
      /from vault\.decrypted_secrets\s+where name = 'github_dispatch_token'/,
    );
  });

  it("화면·회원은 운영용 함수와 기록을 쓸 수 없다", () => {
    expect(CODE).toContain(
      "revoke all on schema ops from public, anon, authenticated;",
    );
    expect(CODE).toContain(
      "revoke all on function ops.dispatch_workflow(text, jsonb) from public, anon, authenticated;",
    );
    expect(CODE).toContain(
      "revoke all on ops.dispatch_recent from public, anon, authenticated;",
    );
    expect(CODE).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it("02:15·02:45·17:15·17:45 물 수집, 09:20 적산온도, 매시간 40분 감시 (UTC 로 적음)", () => {
    const jobs = [
      ...CODE.matchAll(
        /cron\.schedule\('([^']+)', '([^']+)', \$cron\$(.*?)\$cron\$\)/g,
      ),
    ].map((m) => [m[1], m[2], m[3].match(/dispatch_workflow\('([^']+)'/)?.[1]]);
    expect(jobs).toEqual([
      ["croplib-collect-02", "15 17 * * *", "collect.yml"],
      ["croplib-collect-02b", "45 17 * * *", "collect.yml"],
      ["croplib-collect-17", "15 8 * * *", "collect.yml"],
      ["croplib-collect-17b", "45 8 * * *", "collect.yml"],
      ["croplib-heat-sun", "20 0 * * *", "heat-sun.yml"],
      ["croplib-monitor", "40 * * * *", "monitor.yml"],
    ]);
    expect(CODE).toContain('{"write": "true"}');
  });
});
