import type { Block, Inline } from "@/domain/legal-markdown";

/** 굵은 글씨는 <strong>, 나머지는 글자 노드 — HTML 문자열을 끼워 넣는 곳이 없다. */
function Rich({ inline }: { inline: Inline }) {
  return (
    <>
      {inline.map((s, i) =>
        s.bold ? (
          <strong key={i}>{s.text}</strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

const CELL = "border-ink-2/20 border-b-(length:--hairline) px-3 py-2 align-top";

/**
 * 약관 · 개인정보처리방침 본문 (변환기 `parseLegalMarkdown` 결과를 그린다, 이슈 #173).
 * 제목 세 단계(문서 제목 24 · 조/번호 제목 18 · 작은 제목 16), 본문 16(글씨 크기를 따름, 줄 간격 넉넉),
 * 번호 목록은 원문 번호 그대로(`li value`), 표는 상자로 감싸 **표만** 가로로 스크롤(문서 전체가 넘치지 않게).
 */
export function LegalBody({ blocks }: { blocks: Block[] }) {
  return (
    <div
      data-testid="legal-body"
      className="text-16 flex flex-col gap-3 leading-relaxed"
    >
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          if (b.level === 2) {
            return (
              <h2
                key={i}
                className="text-24 leading-title m-0 pt-1 font-bold text-pretty"
              >
                <Rich inline={b.inline} />
              </h2>
            );
          }
          if (b.level === 3) {
            return (
              <h3
                key={i}
                className="text-18 leading-title m-0 pt-4 font-bold text-pretty"
              >
                <Rich inline={b.inline} />
              </h3>
            );
          }
          return (
            <h4 key={i} className="text-16 m-0 pt-2 font-bold text-pretty">
              <Rich inline={b.inline} />
            </h4>
          );
        }
        if (b.type === "paragraph") {
          return (
            <p key={i} className="m-0 text-pretty">
              <Rich inline={b.inline} />
            </p>
          );
        }
        if (b.type === "ordered") {
          return (
            <ol key={i} className="m-0 flex list-decimal flex-col gap-1.5 pl-6">
              {b.items.map((item, k) => (
                <li key={k} value={item.value} className="pl-1 text-pretty">
                  <Rich inline={item.inline} />
                  {item.sub.length > 0 && (
                    <ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5">
                      {item.sub.map((s, j) => (
                        <li key={j} className="text-pretty">
                          <Rich inline={s} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          );
        }
        if (b.type === "bullets") {
          return (
            <ul key={i} className="m-0 flex list-disc flex-col gap-1 pl-6">
              {b.items.map((item, k) => (
                <li key={k} className="text-pretty">
                  <Rich inline={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <div
            key={i}
            className="rounded-box border-ink-2/20 overflow-x-auto border-(length:--hairline)"
          >
            {/* 칸 수에 맞춘 최소 폭(칸당 8em, 글자 크기를 따라 같이 커짐): 칸이 많은 표(방침 7번 6칸)만 좁은 화면에서 가로로 스크롤되고,
                2칸짜리 표는 그대로 들어간다. 칸이 너무 좁아져 글자가 한 줄에 몇 자씩 접히는 것을 막는다. */}
            <table
              className="text-14 w-full border-collapse text-left"
              style={{ minWidth: `${b.head.length * 8}em` }}
            >
              <thead>
                <tr>
                  {b.head.map((c, k) => (
                    <th
                      key={k}
                      scope="col"
                      className={`${CELL} bg-fill/10 font-bold whitespace-nowrap`}
                    >
                      <Rich inline={c} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, k) => (
                      <td key={k} className={CELL}>
                        <Rich inline={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
