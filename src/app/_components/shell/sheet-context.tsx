"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type SheetKind = "login" | "about";

type SheetState = {
  sheet: SheetKind | null;
  open: (kind: SheetKind) => void;
  close: () => void;
};

const SheetContext = createContext<SheetState | null>(null);

/** 가운데 창(로그인 안내, CropMon 소개)을 헤더·바닥글·종합 화면이 함께 쓴다. */
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const value = useMemo(
    () => ({ sheet, open: setSheet, close: () => setSheet(null) }),
    [sheet],
  );
  return <SheetContext value={value}>{children}</SheetContext>;
}

export function useSheet() {
  const value = useContext(SheetContext);
  if (!value) throw new Error("SheetProvider 안에서만 쓸 수 있어요");
  return value;
}
