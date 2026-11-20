"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { type AuthProvider } from "@/domain/auth";
import {
  LOGIN_PROVIDERS,
  loginButtonHref,
  loginRequestNext,
  loginSheetNext,
  removeSearchKeys,
} from "@/domain/login-sheet";
import { legalHref } from "@/domain/legal";
import { parseSelection, withSelection } from "@/domain/selection";
import { STATION_ENTRIES } from "@/services/shell";

import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { BottomSheet } from "./BottomSheet";
import { useMembersState } from "./members-state";
import { ROW, SoonRow, ThemeRow } from "./MoreList";
import { useSheet } from "./sheet-context";

export function AboutButton() {
  const { open } = useSheet();
  return (
    <button
      type="button"
      onClick={() => open("about")}
      className="text-brand-ink fh-44 inline-flex cursor-pointer items-center font-bold"
    >
      CropMon 소개
    </button>
  );
}

const DESKTOP_QUERY = "(min-width: 1024px)";
const subscribeDesktop = (onChange: () => void) => {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
/** 폭 1024 이상(데스크톱 배치). 서버에서는 휴대폰으로 본다(시트는 연 뒤에만 그려서 어긋나지 않는다). */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * 가운데 창(CropMon 소개 · 로그인 · 내 계정)과 아래 시트(휴대폰의 로그인 · 내 계정). layout 에서 <Suspense> 안에 둔다.
 * 작물·지역 고르기는 여기서 그리지 않는다(BottomSheet 를 맥락 바가 직접 쓴다).
 *
 * `login` 시트는 회원제 표시(`useMembersState`)에 따라 갈린다 (이슈 #189, 결정 0064):
 * - 끔(속성 없음, 지금 알파): "로그인은 2027년 1월 1일부터 열려요" 안내 창 — 예전과 똑같다.
 * - 켬 · 비로그인: 로그인 시트 (휴대폰은 아래 시트, 데스크톱은 가운데 창 폭 520 · 끌기 손잡이 없음).
 * `/?login=1&next=…`(로그인 필요 주소를 비로그인으로 열었을 때)로 오면 시트를 열고, 닫으면 주소에서 `login` · `next` 를 지운다.
 */
export function Sheets() {
  const { sheet, open, close } = useSheet();
  const members = useMembersState();
  const pathname = usePathname();
  const params = useSearchParams();
  const desktop = useIsDesktop();
  const search = params.toString() ? `?${params.toString()}` : "";
  const requestNext = loginRequestNext(search);

  // /?login=1&next=… 로 열렸으면 시트를 연다 (지금 화면의 스위치에 맞는 시트가 뜬다)
  useEffect(() => {
    if (requestNext !== null) open("login");
  }, [requestNext, open]);

  const closeSheet = useCallback(() => {
    close();
    // 로그인 필요 주소로 열렸던 시트를 닫으면 주소에서 login · next 를 지운다(새로고침해도 다시 안 열림)
    const { pathname: p, search: q, hash } = window.location;
    if (new URLSearchParams(q).get("login") === "1") {
      window.history.replaceState(
        window.history.state,
        "",
        removeSearchKeys(p, q, hash, ["login", "next"]),
      );
    }
  }, [close]);

  // 로그인했는데 로그인 시트가 열렸거나, 로그인하지 않았는데 내 계정이 열렸으면 닫는다
  const stale =
    (sheet === "login" && members.mode === "in") ||
    (sheet === "account" && members.mode !== "in");
  useEffect(() => {
    if (stale) closeSheet();
  }, [stale, closeSheet]);

  if (sheet === null || stale) return null;

  // 안내 창(소개 · 스위치 끔의 로그인 안내)은 예전 그대로
  if (sheet === "about" || (sheet === "login" && members.mode === "off")) {
    return <NoticeDialog sheet={sheet} onClose={closeSheet} />;
  }

  const next = requestNext ?? loginSheetNext(pathname, search);
  const title = sheet === "login" ? "로그인" : "내 계정";
  const body =
    sheet === "login" ? (
      <LoginBody next={next} naverOn={members.naver} onClose={closeSheet} />
    ) : (
      <AccountBody next={next} onClose={closeSheet} />
    );

  return desktop ? (
    <CenterWindow title={title} onClose={closeSheet}>
      {body}
    </CenterWindow>
  ) : (
    <MobileSheet title={title} onClose={closeSheet}>
      {body}
    </MobileSheet>
  );
}

/** 휴대폰: 아래에서 올라오는 시트(BottomSheet, 결정 0050). 넘치면 안에서 스크롤한다. */
export function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { triggerRef } = useSheet();
  return (
    <BottomSheet title={title} triggerRef={triggerRef} onClose={onClose}>
      <div className="overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
        {children}
      </div>
    </BottomSheet>
  );
}

/**
 * 데스크톱: 가운데 창 (폭 520 · 끌기 손잡이 없음). 제목 줄은 안에서 스크롤해도 위에 붙어 있고(sticky) × 가 잘리지 않는다.
 * 바깥이나 Esc 를 누르면 닫히고, 닫히면 연 버튼으로 포커스를 돌려준다.
 */
export function CenterWindow({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { triggerRef } = useSheet();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="bg-scrim/28 fixed inset-0 z-40 flex items-center justify-center p-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="rounded-panel bg-card shadow-panel max-h-[86%] w-full max-w-130 [scrollbar-width:none] overflow-auto"
      >
        <div className="bg-card sticky top-0 z-10 flex items-center gap-2.5 px-5 pt-4 pb-2">
          <span className="text-22 flex-1 font-bold">{title}</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="bg-fill/12 text-20 text-ink flex size-11 flex-none cursor-pointer items-center justify-center rounded-full"
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-7.5">{children}</div>
      </div>
    </div>
  );
}

// ── 안내 창: CropMon 소개 · 스위치 끔의 로그인 안내 (예전 그대로) ─────────────────────

function NoticeDialog({
  sheet,
  onClose,
}: {
  sheet: "login" | "about" | "account";
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="bg-scrim/28 fixed inset-0 z-40 flex items-center justify-center p-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={sheet === "login" ? "로그인 안내" : "CropMon 소개"}
        onClick={(e) => e.stopPropagation()}
        className="rounded-panel bg-card shadow-panel max-h-[86%] w-full max-w-130 [scrollbar-width:none] overflow-auto px-5 pt-2 pb-7.5"
      >
        <div className="bg-ink-2/30 mx-auto mt-1 mb-2.5 h-1.25 w-9 rounded-full" />
        {sheet === "login" ? (
          <ComingSoonLogin onClose={onClose} />
        ) : (
          <AboutSheet onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="bg-fill/12 text-17 text-ink fh-50 w-full cursor-pointer rounded-full font-semibold"
    >
      닫기
    </button>
  );
}

function ComingSoonLogin({ onClose }: { onClose: () => void }) {
  const selection = parseSelection(useSearchParams(), STATION_ENTRIES);
  return (
    <div className="flex flex-col items-center gap-3 pt-2 pb-1 text-center">
      <Image
        src="/brand/mon.png"
        alt=""
        width={165}
        height={196}
        className="h-auto w-19"
      />
      <span className="text-23 font-bold">
        로그인은 2027년 1월 1일부터 열려요
      </span>
      <span className="text-17 text-ink-2/88 leading-loose">
        회원이 되면 내 밭 주소와 흙의 종류로
        <br />내 밭 단위 물 판정을 받을 수 있어요.
      </span>
      <Link
        href={withSelection("/my-farm", selection)}
        onClick={onClose}
        className="bg-brand text-18 fh-54 mt-1.5 flex w-full items-center justify-center rounded-full font-bold text-white"
      >
        내 농장 미리보기
      </Link>
      <CloseButton onClose={onClose} />
    </div>
  );
}

function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-1 text-center">
      <span className="bg-plate rounded-row flex shrink-0 dark:px-2 dark:py-0.5">
        <Image
          src="/brand/logo-emblem.png"
          alt="CropMon 작물재배의 든든한 감시자"
          width={412}
          height={383}
          className="h-auto w-37.5"
        />
      </span>
      <span className="text-14 text-ink-2/80">
        Crop Monitoring + Crop Monster
      </span>
      <span className="text-19 leading-loose font-bold text-pretty">
        농업 데이터와 내 농장 기록으로
        <br />
        작물 재배 판단을 돕는 서비스
      </span>
      <span className="text-16 text-ink-2/88 leading-loose">
        지도사는 지역 단위로, 농업인은 내 밭 단위로 본다
      </span>
      <div className="rounded-box bg-tile text-15 leading-body flex w-full flex-col gap-1.5 px-4 py-3.5 text-left">
        <span>
          <b>지금</b> 기상청 ASOS 관측·단기예보로 계산한 물수지(FAO-56),
          적산온도, 적산일사
        </span>
        <span className="text-ink-2/85">
          <b className="text-ink">앞으로</b> 토양(농진청), 도매시장 가격(aT),
          농업관측(KREI)
        </span>
        <span className="text-14 text-ink-2/75">
          기상청 자료가 뒤늦게 수정·회수되면 기준 날짜가 실제와 하루 어긋날 수
          있어요.
        </span>
      </div>
      <CloseButton onClose={onClose} />
    </div>
  );
}

// ── 로그인 시트 (회원제 켬 · 비로그인) ───────────────────────────────────────────────

/**
 * 공급자 버튼의 색 · 심볼 (각 회사 공식 값, 결정 0064 · docs/SOCIAL_LOGIN.md 5절).
 * 심볼은 공식 배포 파일 그대로다(직접 그리거나 바꾸지 않는다). 카카오 심볼은 아직 못 받아 비워 둔다(O3 전 필수).
 */
const PROVIDER_STYLE: Record<
  AuthProvider,
  { box: string; spinner: string; symbol: ReactNode }
> = {
  kakao: {
    box: "bg-[#FEE500] text-[rgba(0,0,0,0.85)]",
    spinner: "border-black/20 border-t-black",
    symbol: null,
  },
  "custom:naver": {
    box: "bg-[#03C75A] text-white",
    spinner: "border-white/40 border-t-white",
    symbol: (
      <Image
        src="/brand/login/naver-icon.png"
        alt=""
        width={34}
        height={34}
        className="absolute top-1/2 left-2.5 size-8.5 -translate-y-1/2"
      />
    ),
  },
  google: {
    box: "border border-[#747775] bg-white text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]",
    spinner:
      "border-[#1F1F1F]/25 border-t-[#1F1F1F] dark:border-[#E3E3E3]/30 dark:border-t-[#E3E3E3]",
    symbol: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- 구글 공식 SVG 를 그대로 쓴다 */}
        <img
          src="/brand/login/google-light.svg"
          alt=""
          width={40}
          height={40}
          className="absolute top-1/2 left-1.5 size-10 -translate-y-1/2 dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- 구글 공식 SVG 를 그대로 쓴다 */}
        <img
          src="/brand/login/google-dark.svg"
          alt=""
          width={40}
          height={40}
          className="absolute top-1/2 left-1.5 hidden size-10 -translate-y-1/2 dark:block"
        />
      </>
    ),
  },
};

const BUTTON_BASE =
  "fh-52 relative flex w-full items-center justify-center gap-2.5 rounded-[12px] px-12 text-16 font-semibold";

function LoginBody({
  next,
  naverOn,
  onClose,
}: {
  next: string;
  naverOn: boolean;
  onClose: () => void;
}) {
  // 누른 공급자. 공급자 화면에서 "뒤로"로 돌아와 페이지가 캐시에서 되살아나도(bfcache) 진행 표시가 남지 않게 지운다.
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <Image
          src="/brand/mon.png"
          alt=""
          width={165}
          height={196}
          className="h-12 w-auto flex-none"
        />
        <span className="text-21 leading-snug font-bold text-pretty">
          로그인하면 내 밭 단위로 봐요
        </span>
      </div>
      <span className="text-16 text-ink-2/88 leading-snug text-pretty">
        내 밭 주소와 작물을 등록하면 상단이 ‘내 농장’으로 바뀌어요. 처음이면
        로그인이 곧 가입이에요.
      </span>

      <div className="mt-1 flex flex-col gap-2">
        {LOGIN_PROVIDERS.map(({ provider, label }) => {
          const style = PROVIDER_STYLE[provider];
          if (provider === "custom:naver" && !naverOn) {
            // 대시보드 설정을 마칠 때까지 준비 중 — 같은 자리 · 같은 크기, 흐리게, 못 누름
            return (
              <button
                key={provider}
                type="button"
                disabled
                aria-disabled="true"
                className={`${BUTTON_BASE} ${style.box} cursor-default opacity-45`}
              >
                {style.symbol}
                <span>{label}</span>
                <Badge className="bg-black/15 text-white">준비 중</Badge>
              </button>
            );
          }
          const isBusy = busy === provider;
          const blocked = busy !== null && !isBusy;
          return (
            // <Link> 가 아니라 <a>: 미리 불러오기가 로그인 시작(쿠키를 심는 요청)을 먼저 보내지 않게 (결정 0061)
            <a
              key={provider}
              href={loginButtonHref(provider, next)}
              onClick={(e) => {
                if (busy !== null) return e.preventDefault(); // 두 번 누름 막기
                setBusy(provider);
              }}
              aria-busy={isBusy || undefined}
              aria-disabled={blocked || undefined}
              tabIndex={blocked ? -1 : undefined}
              className={`${BUTTON_BASE} ${style.box} no-underline ${
                blocked ? "pointer-events-none opacity-45" : ""
              }`}
            >
              {isBusy ? (
                <span
                  data-testid="login-spinner"
                  aria-hidden="true"
                  className={`absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 rounded-full border-[2.5px] motion-safe:animate-spin ${style.spinner}`}
                />
              ) : (
                style.symbol
              )}
              <span>{label}</span>
            </a>
          );
        })}
      </div>

      <span className="text-14 text-ink-2/85 text-center leading-snug text-pretty">
        아이디·비밀번호 가입은 없어요. 카카오·네이버·구글 계정으로만 로그인해요.
      </span>
      <span className="text-13 text-ink-2/85 text-center leading-snug text-pretty">
        로그인하기 전에{" "}
        <Link
          href={legalHref("terms")}
          onClick={onClose}
          className="text-brand-ink font-bold underline"
        >
          이용약관
        </Link>
        과{" "}
        <Link
          href={legalHref("privacy")}
          onClick={onClose}
          className="text-brand-ink font-bold underline"
        >
          개인정보처리방침
        </Link>
        을 확인해 주세요.
      </span>
    </div>
  );
}

// ── 내 계정 시트 (로그인함) ──────────────────────────────────────────────────────────

const GROUP = "rounded-card bg-tile m-0 flex list-none flex-col px-4 py-0.5";

/** 이미 있는 화면으로 가는 줄. 눌러 이동하면 시트를 닫는다. */
function NavRow({
  href,
  icon,
  label,
  onClose,
}: {
  href: string;
  icon: "layout" | "text";
  label: string;
  onClose: () => void;
}) {
  return (
    <li className="contents">
      <Link href={href} onClick={onClose} className={ROW}>
        <Icon name={icon} size={24} className="text-brand-ink flex-none" />
        <span className="flex-1">{label}</span>
        <span aria-hidden="true" className="text-20 text-ink-2/60">
          ›
        </span>
      </Link>
    </li>
  );
}

/**
 * 내 계정 시트의 틀 (시안 v0.4.6 사용자 메뉴 순서): 알림 · 농장 설정 · 작물 설정 · 화면 구성 · 글씨 크기 · 다크 모드 / 회원 정보 · 알림 설정 / 로그아웃.
 * 있는 화면(화면 구성 · 글씨 크기 · 다크 모드)만 연결하고, 아직 없는 화면은 회색 "준비 중"이다. 회원탈퇴 줄은 L6.
 * 회원은 헤더의 다크 모드 버튼이 사라지고 여기서 바꾼다(시안 "회원은 사용자 메뉴 안").
 * 로그아웃은 `POST /auth/signout` 폼이다(링크 미리 불러오기로 로그아웃되지 않게, 결정 0061). 끝나면 지금 보던 화면으로 돌아온다.
 */
function AccountBody({ next, onClose }: { next: string; onClose: () => void }) {
  const selection = parseSelection(useSearchParams(), STATION_ENTRIES);
  return (
    <div className="flex flex-col gap-3">
      <ul className={GROUP}>
        <SoonRow icon="bell" label="알림" />
        <SoonRow icon="farm" label="농장 설정" />
        <SoonRow icon="crop" label="작물 설정" />
        <NavRow
          href={withSelection("/layout", selection)}
          icon="layout"
          label="화면 구성"
          onClose={onClose}
        />
        <NavRow
          href={withSelection("/font-size", selection)}
          icon="text"
          label="글씨 크기"
          onClose={onClose}
        />
        <ThemeRow />
      </ul>
      <ul className={GROUP}>
        <SoonRow icon="user" label="회원 정보" />
        <SoonRow icon="bell" label="알림 설정" />
      </ul>
      <form
        method="post"
        action={`/auth/signout?next=${encodeURIComponent(next)}`}
      >
        <button
          type="submit"
          className="bg-fill/14 text-17 text-ink fh-50 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full font-semibold"
        >
          <Icon name="logout" size={22} />
          로그아웃
        </button>
      </form>
    </div>
  );
}
