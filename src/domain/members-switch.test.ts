import { describe, expect, it } from "vitest";

import { membersEnabled } from "./members-switch";

describe("membersEnabled — 회원제 기능 스위치 (결정 0061)", () => {
  it('"true" 일 때만 켠다', () => {
    expect(membersEnabled({ MEMBERS_ENABLED: "true" })).toBe(true);
  });

  it("없거나 비었거나 다른 값이면 끈다 (기본은 끔 — 지금 알파와 같다)", () => {
    expect(membersEnabled({})).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: undefined })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "false" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "1" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "yes" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "True" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: "TRUE" })).toBe(false);
    expect(membersEnabled({ MEMBERS_ENABLED: " true" })).toBe(false);
  });
});
