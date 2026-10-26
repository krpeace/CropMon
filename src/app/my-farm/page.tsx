import type { Metadata } from "next";

import { FarmScreen } from "../_components/farm/FarmScreen";

export const metadata: Metadata = { title: "내 농장" };

export default function Page() {
  return <FarmScreen />;
}
