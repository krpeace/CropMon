// 오전/오후 표기는 기기(ICU)마다 "PM"처럼 다르게 나올 수 있어 직접 붙인다.
const KOREA_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO 시각을 한국 시간 "2026년 10월 22일 오후 3:05" 꼴로 보여 준다. */
export function formatKoreanDateTime(iso: string | null | undefined): string {
  if (!iso) return "자료 없음";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "자료 없음";

  const parts = Object.fromEntries(
    KOREA_PARTS.formatToParts(time).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const period = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${period} ${hour12}:${parts.minute}`;
}

/** 시각 → 한국 시각 조각 (발표 "10월 25일 02시", 갱신 "02:41" 표시용). 읽을 수 없으면 null. */
export function koreanClock(iso: string | null | undefined) {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = Object.fromEntries(
    KOREA_PARTS.formatToParts(time).map((part) => [part.type, part.value]),
  );
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour.padStart(2, "0"),
    minute: parts.minute,
  };
}
