import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "내 농장" };

export default function Page(props: PageProps<"/my-farm">) {
  return <ShellPage page="my-farm" searchParams={props.searchParams} />;
}
