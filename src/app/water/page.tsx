import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "물" };

export default function Page(props: PageProps<"/water">) {
  return <ShellPage page="water" searchParams={props.searchParams} />;
}
