import packageJson from "../../../../package.json";
import { AboutButton } from "./Sheets";

export function SiteFooter() {
  return (
    <footer className="border-ink-2/20 text-14 text-ink-2/85 mx-auto mt-7 flex max-w-(--page-max) flex-wrap items-center gap-x-5 gap-y-2 border-t-(length:--hairline) px-(--page-gutter) pt-4.5 pb-6">
      <span>자료 출처: 기상청 (ASOS 종관기상관측 · 단기예보)</span>
      <span>CropMon v{packageJson.version}</span>
      <AboutButton />
    </footer>
  );
}
