/**
 * Plain-language definitions for coding terms. The UI leads with the plain
 * words and shows the coding term on hover or focus. One sentence each.
 */
export const TERMS = {
  drg: { word: "DRG (MS-DRG)", plain: "The payment group a hospital stay falls into, set by the main diagnosis plus any serious complications." },
  pdx: { word: "Principal diagnosis", plain: "The condition found, after study, to be chiefly responsible for the admission." },
  ccmcc: { word: "CC / MCC", plain: "Secondary conditions that make a stay more complex (CC) or much more complex (MCC). They can move the DRG." },
  poa: { word: "POA", plain: "Present on admission: whether a condition was there when the patient arrived or developed in the hospital." },
  precision: { word: "Code precision", plain: "Of the codes the system finalized, the share the answer key agrees with." },
  overcoding: { word: "Over-coding rate", plain: "Share of finalized stays whose DRG is higher than the answer key's. The compliance number." },
  escape: { word: "Escape", plain: "A stay that needed a human, by the answer key, but was finalized automatically." },
  query: { word: "Provider query", plain: "A neutral question to the physician when the chart is unclear or conflicting. It must never lead them." },
  icd10: { word: "ICD-10-CM", plain: "The US diagnosis code set. FY2027 took effect October 1, 2026." },
} as const;

export type TermKey = keyof typeof TERMS;
