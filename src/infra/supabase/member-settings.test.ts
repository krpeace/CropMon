import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readMySettings, writeMySettings } from "./member-settings";

let errorLog: ReturnType<typeof vi.spyOn>;
const logged = () => JSON.stringify(errorLog.mock.calls);
const spy = () => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

describe("readMySettings — 자기 members 줄의 세 열만 읽기", () => {
  const selecting = (maybeSingle: () => Promise<unknown>) => {
    const select = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as SupabaseClient, from, select };
  };

  it("세 열(layout · font_scale · theme)만 고른다 — 이름 · 이메일 · 동의 열은 읽지 않는다", async () => {
    spy();
    const { client, from, select } = selecting(async () => ({
      data: { layout: { v: 1 }, font_scale: { v: 1 }, theme: "dark" },
      error: null,
    }));
    const r = await readMySettings(client);
    expect(r).toEqual({
      ok: true,
      row: { layout: { v: 1 }, font_scale: { v: 1 }, theme: "dark" },
    });
    expect(from).toHaveBeenCalledWith("members");
    expect(select).toHaveBeenCalledWith("layout, font_scale, theme");
  });

  it("줄이 없으면 빈 줄(전부 비어 있음)", async () => {
    spy();
    const { client } = selecting(async () => ({ data: null, error: null }));
    expect(await readMySettings(client)).toEqual({ ok: true, row: null });
  });

  it("오류 · 던짐은 ok:false — 기록에는 단계와 코드만(원문 · 개인 값 없음)", async () => {
    spy();
    let { client } = selecting(async () => ({
      data: null,
      error: { code: "PGRST301", message: "denied for someone@example.com" },
    }));
    expect(await readMySettings(client)).toEqual({ ok: false });
    expect(logged()).toContain("settings/read");
    expect(logged()).toContain("PGRST301");
    expect(logged()).not.toContain("someone@example.com");

    ({ client } = selecting(async () => {
      throw new Error("hang up someone@example.com");
    }));
    expect(await readMySettings(client)).toEqual({ ok: false });
    expect(logged()).not.toContain("hang up");
  });
});

describe("writeMySettings — 바뀐 칸만, 자기 줄에만", () => {
  const updating = (result: () => Promise<unknown>) => {
    const select = vi.fn(result);
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return {
      client: { from } as unknown as SupabaseClient,
      from,
      update,
      eq,
      select,
    };
  };

  it("바뀐 칸을 DB 열 이름으로 바꿔 자기 줄(user_id)에만 쓴다", async () => {
    spy();
    const { client, from, update, eq } = updating(async () => ({
      data: [{ user_id: "u" }],
      error: null,
    }));
    const r = await writeMySettings(client, "u-1", {
      layout: { v: 1, order: ["home"], off: [] },
      fontScale: { step: "large", follow: true },
      theme: "dark",
    });
    expect(r).toBe("ok");
    expect(from).toHaveBeenCalledWith("members");
    expect(update).toHaveBeenCalledWith({
      layout: { v: 1, order: ["home"], off: [] },
      font_scale: { v: 1, step: "large", follow: true },
      theme: "dark",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("보낸 칸만 쓴다 (다른 열은 건드리지 않음)", async () => {
    spy();
    const { client, update } = updating(async () => ({
      data: [{ user_id: "u" }],
      error: null,
    }));
    await writeMySettings(client, "u-1", { theme: "light" });
    expect(update).toHaveBeenCalledWith({ theme: "light" });
  });

  it("영향 0줄이면 no-row", async () => {
    spy();
    const { client } = updating(async () => ({ data: [], error: null }));
    expect(await writeMySettings(client, "u-1", { theme: "light" })).toBe(
      "no-row",
    );
  });

  it("오류 · 던짐은 error — 기록에는 단계와 코드만", async () => {
    spy();
    let { client } = updating(async () => ({
      data: null,
      error: { code: "42501", message: "denied for someone@example.com" },
    }));
    expect(await writeMySettings(client, "u-1", { theme: "light" })).toBe(
      "error",
    );
    expect(logged()).toContain("settings/write");
    expect(logged()).toContain("42501");
    expect(logged()).not.toContain("someone@example.com");

    ({ client } = updating(async () => {
      throw new Error("boom someone@example.com");
    }));
    expect(await writeMySettings(client, "u-1", { theme: "light" })).toBe(
      "error",
    );
    expect(logged()).not.toContain("boom");
  });
});
