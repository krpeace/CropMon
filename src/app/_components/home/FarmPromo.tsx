import Image from "next/image";
import Link from "next/link";

import { Icon } from "../ui/Icon";

/** 종합 맨 아래 줄: 내 농장 미리보기로 가는 안내. */
export function FarmPromo({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="rounded-card bg-card text-ink flex items-center gap-3.5 px-4.5 py-4 active:opacity-85"
    >
      <Image
        src="/brand/mon.png"
        alt=""
        width={165}
        height={196}
        className="block h-auto w-11 flex-none"
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-17 font-bold">내 밭 단위로 보고 싶다면</span>
        <span className="text-15 text-ink-2/85">
          내 농장 미리보기 · 2027년 1월 1일부터 열려요
        </span>
      </div>
      <Icon
        name="chevron"
        size={18}
        strokeWidth={2.4}
        className="text-ink-2/50 flex-none"
      />
    </Link>
  );
}
