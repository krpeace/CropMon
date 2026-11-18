import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "병해충" };

export default function Page(props: PageProps<"/pest">) {
  return <ShellPage page="pest" searchParams={props.searchParams} />;
}
