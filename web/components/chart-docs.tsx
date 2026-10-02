"use client";

import { useEffect, useRef } from "react";
import { segments } from "@/lib/highlight";
import type { Document, Finding } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  provider: "Provider",
  consultant: "Consultant",
  nursing: "Nursing",
  dietitian: "Dietitian",
  radiology: "Radiology",
  lab: "Lab",
  pharmacy: "Pharmacy",
};

export function ChartDocs({ docs, findings, active }: { docs: Document[]; findings: Finding[]; active: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active.size || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>('mark[data-active="true"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div ref={ref} className="grid max-h-[78vh] gap-4 overflow-y-auto pr-1" tabIndex={0} aria-label="Chart documents">
      {docs.map((d) => {
        const fs = findings.filter((f) => f.doc_id === d.id);
        const isAddendum = /addendum/i.test(d.type) || /^\s*addendum/i.test(d.text);
        return (
          <article key={d.id} className={`rounded-lg border bg-paper ${isAddendum ? "border-coral" : "border-line"}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-card px-4 py-2.5">
              <h3 className="text-[14px] font-semibold">
                {d.type}
                {isAddendum && <span className="ml-2 text-[11px] font-bold tracking-wide text-coral-ink uppercase">Addendum</span>}
              </h3>
              <p className="text-[12px] text-ink-dim">
                {d.author} · {ROLE_LABEL[d.author_role] ?? d.author_role} · {d.timestamp.replace("T", " ")}
              </p>
            </header>
            <p className="px-4 py-3 font-mono text-[12.5px] leading-[1.65] whitespace-pre-wrap text-ink-soft">
              {segments(d.text, fs).map((s, i) => {
                const f = s.findingId ? fs.find((x) => x.id === s.findingId) : undefined;
                return f ? (
                  <mark
                    key={i}
                    className="evidence"
                    data-active={active.has(f.id) ? "true" : "false"}
                    title={`${f.id} · ${f.condition} (${f.assertion})`}
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                );
              })}
            </p>
          </article>
        );
      })}
    </div>
  );
}
