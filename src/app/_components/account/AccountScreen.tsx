import Link from "next/link";

import type { AccountInfo } from "@/domain/account-info";
import { legalHref } from "@/domain/legal";

/** 회원 정보를 못 읽었을 때 한 줄 (확정 문구 밖 — 쉬운 말). */
export const ACCOUNT_READ_FAILED_TEXT =
  "회원 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요";

const CARD = "rounded-card bg-card m-0 flex flex-col px-4 py-1";
const LINE =
  "border-ink-2/14 flex min-h-13 items-center gap-3 border-t-(length:--hairline) py-2 first:border-t-0";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className={LINE}>
      <dt className="text-15 text-ink-2/85 w-24 flex-none font-semibold">
        {label}
      </dt>
      <dd className="text-16 m-0 min-w-0 flex-1 font-semibold break-all">
        {value}
      </dd>
    </div>
  );
}

function DocLine({
  title,
  line,
  id,
}: {
  title: string;
  line: string | null;
  id: "terms" | "privacy";
}) {
  return (
    <div className={LINE}>
      <dt className="text-15 text-ink-2/85 w-24 flex-none font-semibold">
        {title}
      </dt>
      <dd className="m-0 flex min-w-0 flex-1 items-center gap-2">
        <span className="text-15 min-w-0 flex-1 font-semibold">
          {line ?? "기록이 없어요"}
        </span>
        <Link
          href={legalHref(id)}
          aria-label={`${title} 보기`}
          className="text-brand-ink text-15 fh-44 flex flex-none items-center px-1 font-bold"
        >
          보기 ›
        </Link>
      </dd>
    </div>
  );
}

/**
 * 회원 정보 화면 (이슈 #195, 결정 0067, 시안 v0.4.6 "회원 정보"). 위에서 아래로: 로그인 방법 · 이름 · 메일(없으면 줄째로 뺌) · 가입한 날 ·
 * 동의한 약관 두 줄([보기 ›] → 약관 · 개인정보처리방침) · 로그아웃 · 맨 아래 빨강 "회원탈퇴"(확인 화면으로).
 * 값은 서버가 읽어 `info` 로 준다(못 읽었으면 `null` — 안내 한 줄과 함께 로그아웃 · 회원탈퇴 길은 그대로 연다).
 * 쪽 제목 h1 은 화면 읽기용(`sr-only`) — 휴대폰은 맥락 바가 제목을 보인다.
 */
export function AccountScreen({ info }: { info: AccountInfo | null }) {
  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-4 pb-4">
      <h1 className="sr-only">회원 정보</h1>

      {info ? (
        <>
          <dl className={CARD}>
            {info.providerLabel && (
              <Line label="로그인 방법" value={info.providerLabel} />
            )}
            {info.name && <Line label="이름" value={info.name} />}
            {info.email && <Line label="메일" value={info.email} />}
            {info.joined && <Line label="가입한 날" value={info.joined} />}
          </dl>
          <dl className={CARD}>
            <DocLine title="이용약관" line={info.termsLine} id="terms" />
            <DocLine
              title="개인정보처리방침"
              line={info.privacyLine}
              id="privacy"
            />
          </dl>
        </>
      ) : (
        <p
          role="alert"
          className="bg-tile text-14 text-ink rounded-box m-0 px-3.5 py-2.5 font-semibold"
        >
          {ACCOUNT_READ_FAILED_TEXT}
        </p>
      )}

      <form method="post" action="/auth/signout?next=%2F">
        <button
          type="submit"
          className="bg-fill/14 text-17 text-ink fh-50 w-full cursor-pointer rounded-full font-semibold"
        >
          로그아웃
        </button>
      </form>

      <Link
        href="/account/withdraw"
        className="text-danger text-16 fh-50 flex items-center justify-center rounded-full font-bold"
      >
        회원탈퇴
      </Link>
    </div>
  );
}
