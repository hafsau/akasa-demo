import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import encounters from "@/data/encounters.json";
import { Replay } from "@/components/replay";
import type { EncounterDoc } from "@/lib/types";

const ids = (encounters.agent as { id: string }[]).map((r) => r.id);

export function generateStaticParams() {
  return ids.map((id) => ({ id }));
}

export const dynamicParams = false;

function load(id: string): EncounterDoc | null {
  if (!ids.includes(id)) return null;
  const file = path.join(process.cwd(), "data", "encounters", `${id}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as EncounterDoc;
}

export async function generateMetadata({ params }: PageProps<"/encounter/[id]">): Promise<Metadata> {
  const { id } = await params;
  const doc = load(id);
  return { title: doc ? doc.case.title : "Encounter", description: doc?.case.summary };
}

export default async function EncounterPage({ params }: PageProps<"/encounter/[id]">) {
  const { id } = await params;
  const doc = load(id);
  if (!doc) notFound();
  const i = ids.indexOf(id);
  return <Replay doc={doc} prev={ids[i - 1] ?? null} next={ids[i + 1] ?? null} />;
}
