import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "일지" };

export default function Page(props: PageProps<"/diary">) {
  return <ShellPage page="diary" searchParams={props.searchParams} />;
}
