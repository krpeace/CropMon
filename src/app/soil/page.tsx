import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "토양" };

export default function Page(props: PageProps<"/soil">) {
  return <ShellPage page="soil" searchParams={props.searchParams} />;
}
