import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "농사정보" };

export default function Page(props: PageProps<"/farminfo">) {
  return <ShellPage page="farminfo" searchParams={props.searchParams} />;
}
