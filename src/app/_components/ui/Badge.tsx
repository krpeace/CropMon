/** 회색 배지. "준비 중", "자료 없음", "회원제 미리보기"에 쓴다. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-fill/14 text-14 text-gray-ink rounded-full px-2.75 py-1.25 font-bold whitespace-nowrap">
      {children}
    </span>
  );
}
