import type { Metadata } from "next";

import { SunlightBoard } from "../_components/sunlight/SunlightBoard";

export const metadata: Metadata = { title: "햇빛" };

export default function Page(props: PageProps<"/sunlight">) {
  return <SunlightBoard searchParams={props.searchParams} />;
}
