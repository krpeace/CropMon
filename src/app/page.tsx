import type { Metadata } from "next";

import { HomeBoard } from "./_components/home/HomeBoard";

export const metadata: Metadata = { title: "종합" };

export default function Home(props: PageProps<"/">) {
  return <HomeBoard searchParams={props.searchParams} />;
}
