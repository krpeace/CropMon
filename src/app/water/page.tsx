import type { Metadata } from "next";

import { WaterBoard } from "../_components/water/WaterBoard";

export const metadata: Metadata = { title: "물" };

export default function Page(props: PageProps<"/water">) {
  return <WaterBoard searchParams={props.searchParams} />;
}
