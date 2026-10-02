export interface Span {
  id: string;
  start: number | null;
  end: number | null;
}

export interface Segment {
  text: string;
  findingId?: string;
}

/**
 * Split a document into plain runs and evidence spans. Spans are applied in
 * document order; one that overlaps an earlier span is dropped, so the
 * segments always concatenate back to the original text.
 */
export function segments(text: string, spans: readonly Span[]): Segment[] {
  const sorted = spans
    .filter((s): s is Span & { start: number; end: number } => s.start != null && s.end != null)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Segment[] = [];
  let i = 0;
  for (const s of sorted) {
    if (s.start < i) continue;
    if (s.start > i) out.push({ text: text.slice(i, s.start) });
    out.push({ text: text.slice(s.start, s.end), findingId: s.id });
    i = s.end;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}
