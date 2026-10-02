"use client";

import { useId, useState, type ReactNode } from "react";
import { TERMS, type TermKey } from "@/lib/terms";

/**
 * Plain words first, the coding term on demand. Hover, focus or tap reveals
 * the definition; it is always in the DOM via aria-describedby.
 */
export function TermTip({
  term,
  children,
  className = "",
  align = "left",
}: {
  term: TermKey;
  children?: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const t = TERMS[term];
  return (
    <span className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help uppercase underline decoration-line-strong decoration-dotted underline-offset-[3px] hover:decoration-ink"
      >
        {children ?? t.word}
      </button>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute bottom-full ${align === "right" ? "right-0" : "left-0"} z-30 mb-2 w-64 rounded-lg bg-navy px-3 py-2.5 text-left text-[12px] leading-relaxed font-normal tracking-normal text-white normal-case shadow-soft transition-opacity ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <span className="block font-semibold">{t.word}</span>
        {t.plain}
      </span>
    </span>
  );
}
