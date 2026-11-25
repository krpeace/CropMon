import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** 결정 0072: 화면(src)은 옛 표 heat_daily · sun_daily 를 읽지 않는다. 3-②에서 옛 표를 지워도 화면이 안 깨진다. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("옛 표 읽기 금지 (결정 0072)", () => {
  it('src 에 .from("heat_daily") · .from("sun_daily") 가 0곳이다', () => {
    const bad = files(join(process.cwd(), "src")).filter((f) =>
      /\.from\(\s*["'`](heat_daily|sun_daily)["'`]\s*\)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });
});
