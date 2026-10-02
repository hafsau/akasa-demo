"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Threshold" },
  { href: "/evals", label: "Evals" },
  { href: "/about", label: "How it works" },
];

export function Mark({ className = "" }: { className?: string }) {
  // Dots resolving into a line: a stay's notes becoming one coded claim.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M16 3a13 13 0 0 1 13 13" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="9" cy="20" r="1.8" fill="currentColor" />
      <circle cx="14" cy="17" r="1.8" fill="currentColor" />
      <circle cx="19" cy="13.5" r="1.8" fill="var(--teal)" />
      <circle cx="23.5" cy="10" r="1.8" fill="var(--teal)" />
    </svg>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-paper/95 shadow-nav backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Threshold home">
          <Mark className="h-8 w-8" />
          <span className="hidden text-[19px] font-bold tracking-tight min-[400px]:inline">threshold</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-4">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" || path.startsWith("/encounter") : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2 py-2 text-[14px] font-medium whitespace-nowrap text-nav sm:text-[15px] ${
                  active ? "after:absolute after:inset-x-2 after:-bottom-[2px] after:h-[2px] after:bg-coral" : "hover:text-coral-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
          <a
            href="https://github.com/hafsau/akasa-demo"
            className="ml-1 hidden rounded-md bg-coral-ink px-4 py-2.5 text-[13px] font-semibold tracking-wide text-white uppercase hover:bg-coral-deep sm:inline-block"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}
