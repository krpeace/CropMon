import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "관측" };

export default function Page(props: PageProps<"/outlook">) {
  return <ShellPage page="outlook" searchParams={props.searchParams} />;
}
