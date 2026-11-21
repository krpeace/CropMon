import { describe, expect, it } from "vitest";

import {
  unlinkProviderNames,
  withdrawLinkLine,
  withdrawUnlinkedText,
} from "./withdraw-copy";

// 확정 문구 (2026-11-20 확정, 이슈 #205, 결정 0071). **글자 하나도 바꾸지 않는다** — 전체 글자로 견준다.
describe("탈퇴 확정 문구 (이슈 #205)", () => {
  it("공급자 이름: 네이버가 열렸으면 카카오·네이버·구글, 아니면 네이버를 뺀 카카오·구글", () => {
    expect(unlinkProviderNames(true)).toBe("카카오·네이버·구글");
    expect(unlinkProviderNames(false)).toBe("카카오·구글");
  });

  it("탈퇴 확인 화면의 연결 줄 (켬 · 끔)", () => {
    expect(withdrawLinkLine(true)).toBe(
      "탈퇴하면 카카오·네이버·구글 연결도 함께 끊어요.",
    );
    expect(withdrawLinkLine(false)).toBe(
      "탈퇴하면 카카오·구글 연결도 함께 끊어요.",
    );
  });

  it("끊기 실패 알림: 첫 줄은 마침표까지 '탈퇴했어요.', 둘째 줄은 확정 뒷문장 그대로 (켬 · 끔)", () => {
    expect(withdrawUnlinkedText(true)).toBe(
      "탈퇴했어요.\n카카오·네이버·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
    );
    expect(withdrawUnlinkedText(false)).toBe(
      "탈퇴했어요.\n카카오·구글 계정의 '연결된 서비스'에 남은 CropMon은 각 계정 설정에서 해제할 수 있어요.",
    );
  });

  it("옛 문구('연결된 서비스는 …' · 화면의 '각 계정 설정에서 해제' 단독 줄)는 어디에도 남지 않는다", () => {
    for (const on of [true, false]) {
      expect(withdrawLinkLine(on)).not.toContain("해제");
      expect(withdrawUnlinkedText(on)).not.toContain(
        "연결된 서비스는 각 계정 설정에서 해제할 수 있어요",
      );
    }
  });
});
