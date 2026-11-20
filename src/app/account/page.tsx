import type { Metadata } from "next";

export const metadata: Metadata = { title: "회원 정보" };

/**
 * 회원 정보 — **임시 쪽** (이슈 #191, 결정 0065). 동의 전 회원 기능 막기(`MemberGate`)를 화면 시험으로 못 박으려고 둔다.
 * L6(회원 정보 · 로그아웃 · 회원탈퇴 · SNS 연결 끊기)가 이 쪽을 이어받아 실제 화면으로 바꾼다.
 * 스위치를 끄면 프록시가 없는 주소로 다시 써서 404 다(알파와 같음).
 */
export default function Page() {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <h1 className="text-22 m-0 font-bold">회원 정보</h1>
      <p className="text-16 text-ink-2/85 m-0">준비 중이에요.</p>
    </div>
  );
}
