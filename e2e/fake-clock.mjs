// 화면 테스트용 "오늘" 옮기기 (Node 쪽). 환경변수 E2E_TODAY(YYYY-MM-DD, 한국 날짜)가 있을 때만 쓴다.
// playwright.config.ts 가 NODE_OPTIONS=--import=<이 파일> 로 가짜 Supabase · 화면 서버에만 미리 읽혀, 둘이 같은 날을 "오늘"로 본다.
// 하루 단위로만 옮기므로 시각(몇 시 몇 분)은 진짜 그대로다. 시험 코드와 브라우저는 e2e/fixtures.ts 가 같은 규칙으로 맞춘다
// (시험 실행기의 전역 Date 는 옮기지 않는다 — Playwright 내부 시계 설정이 어긋난다).
const target = process.env.E2E_TODAY;
if (target) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || Number.isNaN(Date.parse(target))) {
    throw new Error(`E2E_TODAY 형식이 YYYY-MM-DD 가 아님: ${target}`);
  }
  const RealDate = Date;
  const DAY = 86_400_000;
  const realToday = new RealDate(RealDate.now() + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  const offset =
    (RealDate.parse(`${target}T00:00:00Z`) -
      RealDate.parse(`${realToday}T00:00:00Z`)) /
    DAY;
  const shifted = () => RealDate.now() + offset * DAY;
  globalThis.Date = new Proxy(RealDate, {
    construct: (t, args, nt) =>
      args.length === 0 ? new t(shifted()) : Reflect.construct(t, args, nt),
    apply: () => new RealDate(shifted()).toString(),
    get: (t, p) => (p === "now" ? shifted : Reflect.get(t, p, t)),
  });
}
