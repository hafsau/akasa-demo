"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Threshold" },
  { href: "/evals", label: "Evals" },
  { href: "/about", label: "How it works" },
];

export function Mark({ className = "" }: { className?: string }) {
  // A solid badge in Akasa's visual language: four points rising across a coral
  // threshold line. Below the line they're plain; above it they're connected.
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="20" fill="var(--navy)" />
      <rect x="9" y="19.5" width="22" height="3" rx="1.5" fill="var(--coral)" />
      <circle cx="12.5" cy="28" r="2.3" fill="#fff" />
      <circle cx="18" cy="26" r="2.3" fill="#fff" />
      <path d="M22.5 15 L28 11.5" stroke="var(--cyan)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22.5" cy="15" r="2.6" fill="var(--cyan)" />
      <circle cx="28" cy="11.5" r="2.6" fill="var(--cyan)" />
    </svg>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-paper/95 shadow-nav backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Threshold home">
          <Mark className="h-9 w-9" />
          <span className="hidden text-[21px] font-extrabold tracking-[0.02em] text-navy uppercase min-[400px]:inline">Threshold</span>
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
