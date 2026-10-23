import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "온도" };

export default function Page(props: PageProps<"/temperature">) {
  return <ShellPage page="temperature" searchParams={props.searchParams} />;
}
