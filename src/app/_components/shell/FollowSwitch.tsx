"use client";

/**
 * "휴대폰 설정 따르기" 스위치 (이슈 #168, 결정 0055). **시험 과제**라서 따로 떼기 쉽게 부품 하나로 만들었다 —
 * 실제 휴대폰에서 안 되면 사용자 확인 뒤 이 부품과 저장 값의 `follow` 한 칸(`domain/font-scale.ts`)만 빼고 단계만 남긴다.
 * 켜면 휴대폰 글자 크기에서 구한 값을 가장 가까운 단계로 맞춰 쓴다(0.9~1.5 밖이면 끝 단계).
 */
export function FollowSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-card bg-card flex flex-col gap-1.5 px-4 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="text-17 fh-54 flex w-full cursor-pointer items-center gap-3 text-left font-semibold"
      >
        <span className="flex-1">휴대폰 설정 따르기</span>
        <span
          aria-hidden="true"
          className={`relative h-7.75 w-12.75 flex-none rounded-full transition-colors ${
            on ? "bg-brand" : "bg-fill/30"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-6.75 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </span>
      </button>
      <p className="text-14 text-ink-2/85 m-0 pb-3 leading-snug">
        휴대폰 설정에서 정한 글자 크기를 따라가요. 켜 두면 아래에서 직접 고를 수
        없어요.
      </p>
    </div>
  );
}
