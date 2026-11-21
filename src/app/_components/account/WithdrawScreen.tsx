"use client";

import { useRef, useState } from "react";

import { withdrawLinkLine } from "@/domain/withdraw-copy";

/** 탈퇴를 마치지 못했을 때 맨 위 한 줄 (확정 문구 밖 — 검토 채팅 승인 11/20). */
export const WITHDRAW_FAILED_TEXT =
  "탈퇴를 마치지 못했어요. 잠시 뒤 다시 해 주세요";
/** 재인증 도중 시간이 지났을 때(탈퇴 의도 쿠키 만료 · 없음, 이슈 #197 — 검토 채팅 승인 11/20). */
export const WITHDRAW_EXPIRED_TEXT =
  "시간이 지나 탈퇴하지 않았어요. 다시 해 주세요";
/** 확인 칸을 켜지 않고 누르려 할 때(시안 그대로). */
export const WITHDRAW_NEED_CONFIRM_TEXT =
  "위 내용을 확인했다고 체크하면 탈퇴할 수 있어요";

/** 구글 · 네이버 회원에게 [탈퇴하기] 위에 보이는 한 줄(이슈 #197, 검토 채팅 승인 11/20). 누르면 그 공급자로 로그인을 한 번 더 한다. */
export function reauthHint(provider: "google" | "naver"): string {
  return `탈퇴하기를 누르면 연결을 끊기 위해 ${provider === "google" ? "구글" : "네이버"} 로그인을 한 번 더 해요.`;
}

const GONE = [
  "회원 정보",
  "내 농장",
  "작기",
  "관수 기록",
  "계산 결과",
  "화면 설정",
] as const;

/**
 * 회원탈퇴 확인 화면 (이슈 #195, 결정 0067, 시안 v0.4.6). **문구는 확정 문구 그대로**: 지워지는 것 6줄 · 굵은 줄 · 남는 것(작게) ·
 * 연결 줄("탈퇴하면 카카오·네이버·구글 연결도 함께 끊어요.", 네이버가 열리지 않았으면 "네이버"를 뺌 — 이슈 #205, 결정 0071. 옛 "각 계정 설정에서 해제"
 * 안내는 끊기 실패 알림으로 옮겨졌다) · 다시 로그인 안내 · 확인 칸 · 탈퇴하기.
 *
 * - 확인 칸을 켜야 [탈퇴하기]가 눌린다(`aria-disabled` 로 막고, 누르려 하면 안내 줄). 폼 `POST` 라 서버도 확인 칸(`confirm`)을 본다.
 * - 한 번 누르면 진행 표시로 바뀌고 두 번째 누름은 막는다(두 번 탈퇴 요청이 가지 않게).
 * - 바탕 `--color-danger`(위험 색, 결정 0052). 휴대폰 150%에서도 안 잘리게 높이는 글씨에 따라 늘어난다(`fh-*` 최소 높이).
 * - 서버가 돌려보낸 `failed` 는 맨 위 한 줄, `confirm`(칸 없이 보냄)은 안내 줄을 바로 보인다.
 */
export function WithdrawScreen({
  notice,
  reauth,
  naverOn,
}: {
  notice: "failed" | "confirm" | "expired" | null;
  /** 구글 · 네이버 회원이면 그 공급자(안내 줄을 보인다). 카카오만이면 null. */
  reauth: "google" | "naver" | null;
  /** 네이버 로그인이 열렸는지(`naverLoginEnabled`). 닫혀 있으면 연결 줄에서 "네이버"를 뺀다(이슈 #205, 결정 0071). */
  naverOn: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [needHint, setNeedHint] = useState(notice === "confirm");
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-4 pb-4">
      <h1 className="sr-only">회원탈퇴</h1>

      {notice === "failed" && (
        <p
          role="alert"
          className="bg-tile text-14 text-ink rounded-box m-0 px-3.5 py-2.5 font-semibold"
        >
          {WITHDRAW_FAILED_TEXT}
        </p>
      )}

      {notice === "expired" && (
        <p
          role="alert"
          className="bg-tile text-14 text-ink rounded-box m-0 px-3.5 py-2.5 font-semibold"
        >
          {WITHDRAW_EXPIRED_TEXT}
        </p>
      )}

      <div className="rounded-card bg-card flex flex-col gap-3 px-4 py-4">
        <p className="text-15 text-ink-2/85 m-0 font-semibold">
          탈퇴하면 지워지는 것
        </p>
        <ul className="text-16 m-0 flex list-none flex-col gap-1 p-0 font-semibold">
          {GONE.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-ink-2/50 size-1.5 flex-none rounded-full"
              />
              {item}
            </li>
          ))}
        </ul>
        <b className="text-17 text-danger">바로 지워지고 되돌릴 수 없어요</b>
        <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
          알아볼 수 없게 묶은 통계 자료와 최대 7일 보관 뒤 자동으로 지워지는
          암호화 백업은 예외예요.
        </p>
        <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
          {withdrawLinkLine(naverOn)}
        </p>
        <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
          같은 계정으로 다시 로그인하면 새 회원으로 시작해요
        </p>
      </div>

      <form
        method="post"
        action="/auth/withdraw"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          // 확인 칸이 꺼져 있거나 이미 보냈으면 보내지 않는다
          if (!checked) {
            e.preventDefault();
            setNeedHint(true);
            return;
          }
          if (sent.current) {
            e.preventDefault();
            return;
          }
          sent.current = true;
          setBusy(true);
        }}
      >
        <label className="text-16 fh-50 flex cursor-pointer items-center gap-3 font-semibold">
          <input
            type="checkbox"
            name="confirm"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              if (e.target.checked) setNeedHint(false);
            }}
            className="accent-brand size-6 flex-none cursor-pointer"
          />
          위 내용을 확인했어요
        </label>

        {reauth && (
          <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
            {reauthHint(reauth)}
          </p>
        )}

        <button
          type="submit"
          aria-disabled={checked && !busy ? undefined : true}
          aria-busy={busy || undefined}
          className={`bg-danger text-on-danger text-18 fh-54 w-full rounded-full px-4 font-bold ${
            checked && !busy
              ? "cursor-pointer"
              : "cursor-not-allowed opacity-50"
          }`}
        >
          {busy ? "탈퇴하는 중이에요" : "탈퇴하기"}
        </button>

        {needHint && !checked && (
          <p role="status" className="text-14 text-ink-2/85 m-0 leading-snug">
            {WITHDRAW_NEED_CONFIRM_TEXT}
          </p>
        )}
      </form>
    </div>
  );
}
