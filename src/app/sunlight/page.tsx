import type { Metadata } from "next";

import { ShellPage } from "../_components/shell/ShellPage";

export const metadata: Metadata = { title: "햇빛" };

export default function Page(props: PageProps<"/sunlight">) {
  return <ShellPage page="sunlight" searchParams={props.searchParams} />;
}
