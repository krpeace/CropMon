"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type SheetKind = "login" | "about";
export type PopoverKind = "region" | "crop" | null;

type SheetState = {
  sheet: SheetKind | null;
  open: (kind: SheetKind) => void;
  close: () => void;
  popover: PopoverKind;
  setPopover: (kind: PopoverKind) => void;
  /** 열려 있는 아래 시트의 수. 오토 하이드가 시트가 열린 동안 상태를 안 바꾸려고 읽는다 (이슈 #159). */
  holds: number;
  /** 아래 시트가 열릴 때 부르고, 돌려받은 함수를 닫힐 때 부른다. */
  hold: () => () => void;
};

const SheetContext = createContext<SheetState | null>(null);

/** 가운데 창(로그인 안내, CropMon 소개, 지역 고르기 시트·팝오버)을 헤더·바닥글·종합 화면이 함께 쓴다. */
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [popover, setPopover] = useState<PopoverKind>(null);
  const [holds, setHolds] = useState(0);
  const hold = useCallback(() => {
    setHolds((n) => n + 1);
    return () => setHolds((n) => n - 1);
  }, []);
  const value = useMemo(
    () => ({
      sheet,
      open: setSheet,
      close: () => setSheet(null),
      popover,
      setPopover,
      holds,
      hold,
    }),
    [sheet, popover, holds, hold],
  );
  return <SheetContext value={value}>{children}</SheetContext>;
}

export function useSheet() {
  const value = useContext(SheetContext);
  if (!value) throw new Error("SheetProvider 안에서만 쓸 수 있어요");
  return value;
}
