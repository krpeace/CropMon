import type { Metadata } from "next";

import { HomeHead } from "./_components/home/HomeHead";

export const metadata: Metadata = { title: "종합" };

export default function Home(props: PageProps<"/">) {
  return <HomeHead searchParams={props.searchParams} />;
}
