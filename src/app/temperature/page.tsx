import type { Metadata } from "next";

import { TemperatureBoard } from "../_components/temperature/TemperatureBoard";

export const metadata: Metadata = { title: "온도" };

export default function Page(props: PageProps<"/temperature">) {
  return <TemperatureBoard searchParams={props.searchParams} />;
}
