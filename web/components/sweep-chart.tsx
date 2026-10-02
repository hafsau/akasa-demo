"use client";

import { useId, useState } from "react";
import type { SweepPoint } from "@/lib/types";

// Validated with the dataviz palette checker (light surface): all checks pass.
export const SERIES_COLORS = { current: "#00939e", baseline: "#4a5ecc", v1: "#e7314e" } as const;

export interface Series {
  key: keyof typeof SERIES_COLORS;
  label: string;
  points: SweepPoint[];
  dashed?: boolean;
}

const W = 520;
const H = 240;
const M = { t: 16, r: 16, b: 36, l: 44 };

export function SweepChart({
  title,
  metric,
  series,
  marker,
}: {
  title: string;
  metric: "autonomy" | "escape_rate" | "code_precision";
  series: Series[];
  marker: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const x = (t: number) => M.l + t * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v) * (H - M.t - M.b);
  const fmt = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "–");
  const thresholds = series[0]?.points.map((p) => p.threshold) ?? [];

  const path = (pts: SweepPoint[]) =>
    pts
      .filter((p) => Number.isFinite(p[metric]))
      .map((p, i) => `${i ? "L" : "M"}${x(p.threshold).toFixed(1)},${y(p[metric]).toFixed(1)}`)
      .join(" ");

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * (W - M.l - M.r) / (W - M.l - M.r);
    const nearest = thresholds.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), thresholds[0]);
    setHover(nearest);
  };

  return (
    <figure className="rounded-xl bg-paper p-4 shadow-soft">
      <figcaption id={id} className="text-[15px] font-semibold">{title}</figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft" aria-hidden>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES_COLORS[s.key]} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-labelledby={id}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-dim)">{fmt(v)}</text>
            </g>
          ))}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <text key={t} x={x(t)} y={H - M.b + 18} textAnchor="middle" fontSize="11" fill="var(--ink-dim)">{t.toFixed(1)}</text>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="var(--ink-dim)">confidence threshold</text>
          <line x1={x(marker)} x2={x(marker)} y1={M.t} y2={H - M.b} stroke="var(--coral)" strokeOpacity="0.35" strokeDasharray="3 3" />
          {series.map((s) => (
            <path
              key={s.key}
              d={path(s.points)}
              fill="none"
              stroke={SERIES_COLORS[s.key]}
              strokeWidth="2"
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--ink-dim)" />
              {series.map((s) => {
                const p = s.points.find((q) => q.threshold === hover);
                return p && Number.isFinite(p[metric]) ? (
                  <circle key={s.key} cx={x(hover)} cy={y(p[metric])} r="4.5" fill={SERIES_COLORS[s.key]} stroke="var(--paper)" strokeWidth="2" />
                ) : null;
              })}
            </g>
          )}
          <rect
            x={M.l}
            y={M.t}
            width={W - M.l - M.r}
            height={H - M.t - M.b}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 rounded-md bg-navy px-3 py-2 text-[12px] text-white shadow-soft"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > 0.6 ? "translateX(-110%)" : "translateX(10%)" }}
          >
            <p className="font-semibold">Threshold {hover.toFixed(2)}</p>
            {series.map((s) => {
              const p = s.points.find((q) => q.threshold === hover);
              return (
                <p key={s.key} className="tnum">
                  {s.label}: {p ? fmt(p[metric]) : "–"}
                </p>
              );
            })}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Threshold</th>
            {series.map((s) => <th key={s.key}>{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {thresholds.map((t) => (
            <tr key={t}>
              <td>{t.toFixed(2)}</td>
              {series.map((s) => <td key={s.key}>{fmt(s.points.find((p) => p.threshold === t)?.[metric] ?? NaN)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
