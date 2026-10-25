import Image from "next/image";
import Link from "next/link";

import { Badge } from "../ui/Badge";
import { Grid } from "../ui/Grid";

type Props = {
  /** 이 메뉴가 답할 질문 (PAGE_INFO 의 것). */
  question: string;
  /** 열리면 보여 줄 것 4개. */
  items: string[];
  /** 쓸 자료 이름. */
  source: string;
  /** "그동안 물 판정 보기"가 가는 주소 (고른 지역·작물·재배 방식 유지). */
  waterHref: string;
};

/**
 * 토양·도매시장의 "준비 중" 본문 (시안 sSoon, 이슈 #27). 두 메뉴가 같은 모양에 글만 다르다.
 * 위 큰 카드(말풍선·캐릭터·질문) → 아래 두 칸(열리면 보여 줄 것 | 쓸 자료와 물 판정 버튼). 정적인 화면이다.
 */
export function ComingSoon({ question, items, source, waterHref }: Props) {
  return (
    <section aria-label="준비 중 안내" className="flex flex-col gap-4">
      <div className="rounded-card bg-card flex flex-col items-center gap-3.5 px-5 pt-7 pb-6 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-mint/32 text-19 text-mint-ink rounded-bubble px-4.5 py-3 font-bold">
            준비하고 있어요
          </div>
          <Image
            src="/brand/mon.png"
            alt=""
            width={165}
            height={196}
            className="block h-auto w-26"
          />
        </div>
        <span className="text-15 text-ink-2/80 font-bold">
          이 메뉴가 답할 질문
        </span>
        <div className="text-soon-question leading-card max-w-130 font-bold text-pretty">
          “{question}”
        </div>
      </div>

      <Grid min="wide">
        <section
          aria-label="열리면 보여 줄 것"
          className="rounded-card bg-card flex flex-col px-5 py-2"
        >
          <span className="text-17 pt-3 pb-1.5 font-bold">
            열리면 보여 줄 것
          </span>
          <ol className="m-0 flex list-none flex-col p-0">
            {items.map((text, i) => (
              <li
                key={text}
                className="border-ink-2/14 flex min-h-13 items-center gap-3 border-t-(length:--hairline)"
              >
                <span
                  aria-hidden="true"
                  className="bg-emerald/14 text-14 text-brand flex size-7 flex-none items-center justify-center rounded-full font-bold"
                >
                  {i + 1}
                </span>
                <span className="text-17 leading-snug">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-3">
          <section
            aria-label="쓸 자료"
            className="rounded-card bg-card flex flex-col gap-2 p-5"
          >
            <span className="text-17 font-bold">쓸 자료</span>
            <span className="text-17 leading-body">{source}</span>
            <Badge className="self-start">지금은 자료 없음</Badge>
          </section>
          <Link
            href={waterHref}
            className="bg-brand text-18 flex h-14 items-center justify-center rounded-full font-bold text-white"
          >
            그동안 물 판정 보기
          </Link>
        </div>
      </Grid>
    </section>
  );
}
