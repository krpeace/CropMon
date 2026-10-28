"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type SheetKind = "login" | "about" | "station";
export type PopoverKind = "region" | null;

type SheetState = {
  sheet: SheetKind | null;
  open: (kind: SheetKind) => void;
  close: () => void;
  popover: PopoverKind;
  setPopover: (kind: PopoverKind) => void;
};

const SheetContext = createContext<SheetState | null>(null);

/** 가운데 창(로그인 안내, CropMon 소개, 지역 고르기 시트·팝오버)을 헤더·바닥글·종합 화면이 함께 쓴다. */
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [popover, setPopover] = useState<PopoverKind>(null);
  const value = useMemo(
    () => ({
      sheet,
      open: setSheet,
      close: () => setSheet(null),
      popover,
      setPopover,
    }),
    [sheet, popover],
  );
  return <SheetContext value={value}>{children}</SheetContext>;
}

export function useSheet() {
  const value = useContext(SheetContext);
  if (!value) throw new Error("SheetProvider 안에서만 쓸 수 있어요");
  return value;
}
