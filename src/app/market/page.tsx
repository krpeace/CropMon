import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "도매시장" };

export default function Page(props: PageProps<"/market">) {
  return <ShellPage page="market" searchParams={props.searchParams} />;
}
