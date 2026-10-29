"use client";

import Link from "next/link";
import { useState } from "react";

import type { Selection } from "@/domain/selection";
import { withWaterQuery } from "@/domain/water-outlook";
import type { SoilOption } from "@/services/water";

import { Icon } from "../ui/Icon";

export function SoilPicker({
  soils,
  selection,
  date,
}: {
  soils: SoilOption[];
  selection: Selection;
  date: string | null;
}) {
  const [open, setOpen] = useState(false);
  const current = soils.find((s) => s.selected) ?? soils[0];
  if (!current) return null;

  return (
    <div className="border-ink-2/18 flex flex-col gap-2 border-t-(length:--hairline) pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="text-15 text-ink shadow-hairline inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-white/85 px-3.5 py-1.5 font-semibold dark:bg-white/12"
        >
          <span className="text-ink-2/80">계산에 쓴 토양:</span>
          <span className="font-bold">{current.name}</span>
          {current.isEstimated && (
            <span className="bg-fill/16 text-12 text-ink-2/85 rounded-full px-2 py-0.5 font-bold">
              추정값
            </span>
          )}
          <Icon
            name="chevronDown"
            size={16}
            strokeWidth={2.2}
            className={`text-ink-2/70 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="토양 고르기"
          className="rounded-box grid grid-cols-2 gap-1.5 bg-white/90 p-2.5 sm:grid-cols-3 dark:bg-white/12"
        >
          {soils.map((s) => (
            <Link
              key={s.code}
              role="option"
              aria-selected={s.selected}
              href={withWaterQuery({ ...selection, soil: s.code }, { date })}
              scroll={false}
              onClick={() => setOpen(false)}
              className={`rounded-input text-14 flex min-h-10 items-center justify-between gap-1.5 px-2.5 py-1.5 font-semibold ${
                s.selected
                  ? "bg-brand text-white"
                  : "bg-fill/10 text-ink hover:bg-fill/18"
              }`}
            >
              <span className="truncate">{s.name}</span>
              {s.isEstimated && (
                <span
                  className={`text-12 shrink-0 rounded-full px-1.75 py-0.5 font-bold ${
                    s.selected
                      ? "bg-white/20 text-white"
                      : "bg-fill/16 text-ink-2/85"
                  }`}
                >
                  추정값
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
