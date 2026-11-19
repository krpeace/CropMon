import { Fragment } from "react";

import { OPERATOR, operatorSegments } from "@/domain/operator";

/**
 * 운영자 표기 한 줄 (이슈 #161 바닥글 · 이슈 #173 약관 화면이 같이 쓴다). **글자는 `domain/operator.ts` 한 곳**이다.
 * 마디(회사 · 대표 · 사업자등록번호 + 번호 · 주소 · 전화)마다 `white-space: nowrap` 으로 묶고 점(·)은 앞 마디 끝에 붙여,
 * 하이픈 숫자(281-87-02364 · 031-360-4152)가 쪼개지거나 줄 처음에 점이 오지 않게 한다.
 * `wrapAddress`: 주소 마디만 줄바꿈을 허용한다 — 주소는 한 덩어리로 놓으면 휴대폰 본문 폭(390 화면에서 358px)보다 길어
 * (100%에서 약 398px, 150%에서 458px) 오른쪽이 화면 밖으로 잘린다. 번호가 든 마디는 그대로 쪼개지지 않는다(이슈 #173).
 */
export function OperatorLine({
  testId,
  className = "",
  wrapAddress = false,
}: {
  testId: string;
  className?: string;
  wrapAddress?: boolean;
}) {
  return (
    <p
      data-testid={testId}
      className={`text-12 text-gray-ink leading-body m-0 ${className}`}
    >
      {operatorSegments().map((segment, i, all) => (
        <Fragment key={segment}>
          {i > 0 && " "}
          <span
            className={
              wrapAddress && segment === OPERATOR.address
                ? ""
                : "whitespace-nowrap"
            }
          >
            {i < all.length - 1 ? `${segment} ·` : segment}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
